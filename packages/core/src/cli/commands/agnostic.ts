/**
 * Agnostic Command — Manage the Agnostic QA sub-agent team Docker Compose stack.
 *
 * Agnostic is a Python/CrewAI 6-agent QA platform that YEOMAN can orchestrate
 * as a sub-agent team. This command manages its Docker Compose lifecycle so you
 * don't need to switch to the agnostic directory manually.
 *
 * Subcommands:
 *   start   Start the full 6-agent stack (docker compose up -d)
 *   stop    Gracefully stop the stack (docker compose down)
 *   status  Show container states for each agent and service
 *   logs    Tail logs from one or all agents
 *   pull    Pull latest images (docker compose pull)
 *
 * Path resolution (first match wins):
 *   1. --path <dir>  flag
 *   2. AGNOSTIC_PATH env var
 *   3. Auto-detect: ../agnostic relative to cwd, then ~/agnostic, then ~/Repos/agnostic
 *
 * Once the stack is up, configure YEOMAN to communicate with it:
 *   MCP_EXPOSE_AGNOSTIC_TOOLS=true
 *   AGNOSTIC_URL=http://127.0.0.1:8000
 *   AGNOSTIC_EMAIL=<email>
 *   AGNOSTIC_PASSWORD=<password>
 */

import { execFile, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Command, CommandContext } from '../router.js';

// ─── Known service names in the Agnostic docker-compose.yml ──────────────────

const AGENT_SERVICES = [
  'qa-manager',
  'senior-qa',
  'junior-qa',
  'qa-analyst',
  'security-compliance-agent',
  'performance-agent',
] as const;

const INFRA_SERVICES = ['redis', 'rabbitmq', 'webgui'] as const;

const ALL_SERVICES = [...INFRA_SERVICES, ...AGENT_SERVICES] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function compose(
  projectDir: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'docker',
      ['compose', ...args],
      { cwd: projectDir, maxBuffer: 10 * 1024 * 1024, timeout: 300_000 },
      (err, stdout, stderr) => {
        const raw = err as (Error & { code?: number }) | null;
        const code = typeof raw?.code === 'number' ? raw.code : err ? 1 : 0;
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
      }
    );
  });
}

function resolveAgnosticPath(flagPath?: string): string | null {
  const candidates = [
    flagPath,
    process.env.AGNOSTIC_PATH,
    path.resolve(process.cwd(), '..', 'agnostic'),
    path.join(os.homedir(), 'agnostic'),
    path.join(os.homedir(), 'Repos', 'agnostic'),
    path.join(os.homedir(), 'Projects', 'agnostic'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const composePath = path.join(candidate, 'docker-compose.yml');
    if (fs.existsSync(composePath)) return candidate;
  }
  return null;
}

function extractFlag(argv: string[], flag: string): { value: string | undefined; rest: string[] } {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx === argv.length - 1) return { value: undefined, rest: argv };
  const value = argv[idx + 1];
  const rest = [...argv.slice(0, idx), ...argv.slice(idx + 2)];
  return { value, rest };
}

function extractBoolFlag(argv: string[], ...flags: string[]): { value: boolean; rest: string[] } {
  for (const flag of flags) {
    const idx = argv.indexOf(flag);
    if (idx !== -1) {
      return { value: true, rest: [...argv.slice(0, idx), ...argv.slice(idx + 1)] };
    }
  }
  return { value: false, rest: argv };
}

// ─── Command ──────────────────────────────────────────────────────────────────

export const agnosticCommand: Command = {
  name: 'agnostic',
  aliases: ['ag'],
  description: 'Manage the Agnostic QA sub-agent team Docker Compose stack',
  usage: 'secureyeoman agnostic <start|stop|status|logs|pull> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    // --help
    const helpResult = extractBoolFlag(argv, '--help', '-h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(`
Usage: ${this.usage}

Subcommands:
  start             Start the Agnostic 6-agent stack (docker compose up -d)
  stop              Stop the stack (docker compose down)
  status            Show per-container state for all agents and services
  logs [agent]      Tail logs — optionally specify one agent name
  pull              Pull latest images without starting

Options:
  --path <dir>      Path to the agnostic project directory
                    (default: AGNOSTIC_PATH env var or auto-detected)
  --follow, -f      Follow log output (logs subcommand only)
  --tail <n>        Number of log lines to show (default: 50)
  -h, --help        Show this help

Agent names for 'logs':
  ${AGENT_SERVICES.join(', ')}
  ${INFRA_SERVICES.join(', ')}

Environment variables (set after start to wire MCP tools):
  MCP_EXPOSE_AGNOSTIC_TOOLS=true
  AGNOSTIC_URL=http://127.0.0.1:8000
  AGNOSTIC_EMAIL=<email>
  AGNOSTIC_PASSWORD=<password>
`);
      return 0;
    }
    argv = helpResult.rest;

    // --path flag
    const pathResult = extractFlag(argv, '--path');
    argv = pathResult.rest;
    const flagPath = pathResult.value;

    const projectDir = resolveAgnosticPath(flagPath);
    if (!projectDir) {
      ctx.stderr.write(
        'Cannot find the Agnostic project directory.\n\n' +
          'Tried:\n' +
          '  • --path <dir> flag\n' +
          '  • AGNOSTIC_PATH env var\n' +
          '  • ../agnostic (relative to cwd)\n' +
          '  • ~/agnostic\n' +
          '  • ~/Repos/agnostic\n\n' +
          'Set AGNOSTIC_PATH=/path/to/agnostic in your .env or pass --path.\n'
      );
      return 1;
    }

    const subcommand = argv[0];
    argv = argv.slice(1);

    // ── start ────────────────────────────────────────────────────────────────

    if (subcommand === 'start') {
      ctx.stdout.write(`Starting Agnostic QA team at: ${projectDir}\n`);
      ctx.stdout.write('This may take a minute on first run while images are pulled...\n\n');

      const result = await compose(projectDir, ['up', '-d', '--remove-orphans']);
      if (result.stderr) ctx.stdout.write(result.stderr + '\n');
      if (result.stdout) ctx.stdout.write(result.stdout + '\n');

      if (result.code !== 0) {
        ctx.stderr.write('Stack failed to start. Check the output above for details.\n');
        return 1;
      }

      ctx.stdout.write('\nAgnostic QA team started.\n\n');
      ctx.stdout.write('Add these variables to your .env to enable MCP tools:\n\n');
      ctx.stdout.write('  MCP_EXPOSE_AGNOSTIC_TOOLS=true\n');
      ctx.stdout.write('  AGNOSTIC_URL=http://127.0.0.1:8000\n');
      ctx.stdout.write('  AGNOSTIC_EMAIL=<your-email>\n');
      ctx.stdout.write('  AGNOSTIC_PASSWORD=<your-password>\n\n');
      ctx.stdout.write("Run 'secureyeoman agnostic status' to verify all agents are running.\n");
      return 0;
    }

    // ── stop ─────────────────────────────────────────────────────────────────

    if (subcommand === 'stop') {
      ctx.stdout.write(`Stopping Agnostic QA team at: ${projectDir}\n`);

      const result = await compose(projectDir, ['down']);
      if (result.stderr) ctx.stdout.write(result.stderr + '\n');
      if (result.stdout) ctx.stdout.write(result.stdout + '\n');

      if (result.code !== 0) {
        ctx.stderr.write('Stack did not stop cleanly. Check the output above.\n');
        return 1;
      }

      ctx.stdout.write('\nAgnostic QA team stopped.\n');
      return 0;
    }

    // ── status ───────────────────────────────────────────────────────────────

    if (subcommand === 'status') {
      ctx.stdout.write(`\nAgnostic QA team status (${projectDir})\n\n`);

      // docker compose ps --format json gives structured output
      const result = await compose(projectDir, ['ps', '--format', 'json']);

      if (result.code !== 0) {
        ctx.stderr.write(`docker compose ps failed:\n${result.stderr}\n`);
        return 1;
      }

      if (!result.stdout) {
        ctx.stdout.write('No containers running. Run: secureyeoman agnostic start\n');
        return 0;
      }

      // compose ps --format json outputs one JSON object per line (NDJSON)
      const lines = result.stdout.split('\n').filter(Boolean);
      const containers: { Name: string; State: string; Status: string; Ports?: string }[] = [];

      for (const line of lines) {
        try {
          const obj = JSON.parse(line) as {
            Name: string;
            State: string;
            Status: string;
            Ports?: string;
          };
          containers.push(obj);
        } catch {
          // older Docker versions output a JSON array
          try {
            const arr = JSON.parse(result.stdout) as {
              Name: string;
              State: string;
              Status: string;
              Ports?: string;
            }[];
            containers.push(...arr);
            break;
          } catch {
            // fall back to raw text
          }
        }
      }

      if (containers.length > 0) {
        const colW = 35;
        ctx.stdout.write(`${'Service'.padEnd(colW)} ${'State'.padEnd(12)} Status\n`);
        ctx.stdout.write(`${'-'.repeat(colW)} ${'-'.repeat(12)} ${'-'.repeat(20)}\n`);
        for (const c of containers) {
          const state = c.State ?? 'unknown';
          const icon = state === 'running' ? '✓' : state === 'exited' ? '✗' : '~';
          ctx.stdout.write(
            `${icon} ${c.Name.padEnd(colW - 2)} ${state.padEnd(12)} ${c.Status ?? ''}\n`
          );
        }

        const running = containers.filter((c) => c.State === 'running').length;
        ctx.stdout.write(`\n${running}/${containers.length} containers running.\n`);
      } else {
        // Fallback: print raw output
        ctx.stdout.write(result.stdout + '\n');
      }

      ctx.stdout.write('\nAgnostic UI: http://127.0.0.1:8000\n\n');
      return 0;
    }

    // ── logs ─────────────────────────────────────────────────────────────────

    if (subcommand === 'logs') {
      const followResult = extractBoolFlag(argv, '--follow', '-f');
      argv = followResult.rest;
      const follow = followResult.value;

      const tailResult = extractFlag(argv, '--tail');
      argv = tailResult.rest;
      const tailLines = tailResult.value ?? '50';

      // optional agent name — anything that doesn't start with --
      const targetService = argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined;

      const composeArgs = ['logs', `--tail=${tailLines}`];
      if (follow) composeArgs.push('--follow');
      if (targetService) composeArgs.push(targetService);

      if (follow) {
        // spawn so output streams through in real time
        ctx.stdout.write(
          `Tailing logs${targetService ? ` for ${targetService}` : ''} (Ctrl-C to stop)...\n\n`
        );
        return await new Promise<number>((resolve) => {
          const child = spawn('docker', ['compose', ...composeArgs], {
            cwd: projectDir,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          child.stdout.on('data', (chunk: Buffer) => ctx.stdout.write(chunk.toString()));
          child.stderr.on('data', (chunk: Buffer) => ctx.stdout.write(chunk.toString()));
          child.on('close', (code) => {
            resolve(code ?? 0);
          });
        });
      }

      const result = await compose(projectDir, composeArgs);
      if (result.stdout) ctx.stdout.write(result.stdout + '\n');
      if (result.stderr) ctx.stdout.write(result.stderr + '\n');
      return result.code;
    }

    // ── pull ─────────────────────────────────────────────────────────────────

    if (subcommand === 'pull') {
      ctx.stdout.write(`Pulling latest images for Agnostic at: ${projectDir}\n`);

      const result = await compose(projectDir, ['pull']);
      if (result.stderr) ctx.stdout.write(result.stderr + '\n');
      if (result.stdout) ctx.stdout.write(result.stdout + '\n');

      if (result.code !== 0) {
        ctx.stderr.write('Pull failed. Check the output above.\n');
        return 1;
      }

      ctx.stdout.write('\nImages updated. Run: secureyeoman agnostic start\n');
      return 0;
    }

    ctx.stderr.write(`Unknown subcommand: ${subcommand}\n`);
    ctx.stderr.write(`Run 'secureyeoman agnostic --help' for usage.\n`);
    return 1;
  },
};
