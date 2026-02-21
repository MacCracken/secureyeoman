/**
 * Security Command — Manage the Kali security toolkit container lifecycle.
 *
 * Subcommands:
 *   setup     Pull kalilinux/kali-rolling, start container, install tools
 *   teardown  Stop and remove the container
 *   update    Update installed packages inside the container
 *   status    Show container state and tool availability
 */

import { execFile } from 'node:child_process';
import type { Command, CommandContext } from '../router.js';

const CONTAINER = 'kali-sy-toolkit';
const KALI_IMAGE = 'kalilinux/kali-rolling';

const SECURITY_TOOLS = [
  'nmap',
  'gobuster',
  'ffuf',
  'nikto',
  'sqlmap',
  'nuclei',
  'whatweb',
  'wpscan',
  'hashcat',
  'john',
  'theharvester',
  'dnsutils', // provides dig
  'whois',
];

function docker(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'docker',
      args,
      { maxBuffer: 10 * 1024 * 1024, timeout: 600_000 },
      (err, stdout, stderr) => {
        const code = (err as (NodeJS.ErrnoException & { code?: number }) | null)?.code ?? 0;
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code: typeof code === 'number' ? code : err ? 1 : 0,
        });
      }
    );
  });
}

async function isDockerAvailable(): Promise<boolean> {
  const { code } = await docker(['info', '--format', '{{.ServerVersion}}']);
  return code === 0;
}

async function isContainerRunning(): Promise<boolean> {
  const { stdout } = await docker(['inspect', '--format', '{{.State.Running}}', CONTAINER]);
  return stdout === 'true';
}

async function containerExists(): Promise<boolean> {
  const { code } = await docker(['inspect', CONTAINER]);
  return code === 0;
}

async function checkToolInContainer(tool: string): Promise<boolean> {
  const bin = tool === 'dnsutils' ? 'dig' : tool === 'theharvester' ? 'theHarvester' : tool;
  const { code } = await docker(['exec', CONTAINER, 'which', bin]);
  return code === 0;
}

export const securityCommand: Command = {
  name: 'security',
  aliases: ['sec'],
  description: 'Manage the Kali security toolkit container (setup, teardown, update, status)',
  usage: 'secureyeoman security <setup|teardown|update|status>',

  async run(ctx: CommandContext): Promise<number> {
    const argv = ctx.argv;
    const subcommand = argv[0];

    if (!subcommand || subcommand === '--help' || subcommand === '-h') {
      ctx.stdout.write(`
Usage: ${this.usage}

Subcommands:
  setup     Pull the Kali image, start the container, and install security tools
  teardown  Stop and remove the Kali container
  update    Update packages inside the running container
  status    Show container state and per-tool availability

Environment variables set after setup:
  MCP_EXPOSE_SECURITY_TOOLS=true
  MCP_SECURITY_TOOLS_MODE=docker-exec
  MCP_SECURITY_TOOLS_CONTAINER=${CONTAINER}
  MCP_ALLOWED_TARGETS=<your targets>
  SHODAN_API_KEY=<optional>
`);
      return 0;
    }

    if (subcommand === 'setup') {
      ctx.stdout.write('Checking Docker availability...\n');
      if (!(await isDockerAvailable())) {
        ctx.stderr.write(
          'Error: Docker is not available. Install Docker and ensure the daemon is running.\n'
        );
        return 1;
      }
      ctx.stdout.write('Docker is available.\n');

      if (await containerExists()) {
        ctx.stdout.write(
          `Container "${CONTAINER}" already exists. Run teardown first to recreate it.\n`
        );
        return 1;
      }

      ctx.stdout.write(`Pulling ${KALI_IMAGE} (this may take a few minutes)...\n`);
      const pull = await docker(['pull', KALI_IMAGE]);
      if (pull.stderr && pull.stderr.includes('Error')) {
        ctx.stderr.write(`Pull failed:\n${pull.stderr}\n`);
        return 1;
      }
      ctx.stdout.write('Image pulled.\n');

      ctx.stdout.write(`Starting container "${CONTAINER}"...\n`);
      const run = await docker(['run', '-d', '--name', CONTAINER, KALI_IMAGE, 'sleep', 'infinity']);
      if (run.code !== 0) {
        ctx.stderr.write(`Failed to start container:\n${run.stderr}\n`);
        return 1;
      }
      ctx.stdout.write(`Container started (ID: ${run.stdout.slice(0, 12)}).\n`);

      ctx.stdout.write('Updating package lists...\n');
      const update = await docker(['exec', CONTAINER, 'apt-get', 'update', '-qq']);
      if (update.code !== 0) {
        ctx.stderr.write(`apt-get update failed:\n${update.stderr}\n`);
        return 1;
      }

      ctx.stdout.write(`Installing tools: ${SECURITY_TOOLS.join(', ')}...\n`);
      const install = await docker([
        'exec',
        CONTAINER,
        'apt-get',
        'install',
        '-y',
        '--no-install-recommends',
        ...SECURITY_TOOLS,
      ]);
      if (install.code !== 0) {
        ctx.stderr.write(`Tool installation failed:\n${install.stderr}\n`);
        return 1;
      }

      ctx.stdout.write('\nSetup complete.\n\n');
      ctx.stdout.write('Add these variables to your .env file:\n\n');
      ctx.stdout.write(`  MCP_EXPOSE_SECURITY_TOOLS=true\n`);
      ctx.stdout.write(`  MCP_SECURITY_TOOLS_MODE=docker-exec\n`);
      ctx.stdout.write(`  MCP_SECURITY_TOOLS_CONTAINER=${CONTAINER}\n`);
      ctx.stdout.write(
        `  MCP_ALLOWED_TARGETS=<enter your targets, comma-separated CIDRs/hostnames/URLs>\n`
      );
      ctx.stdout.write(`  # SHODAN_API_KEY=<optional, enables sec_shodan tool>\n\n`);
      ctx.stdout.write(`Run 'secureyeoman security status' to verify tool availability.\n`);
      return 0;
    }

    if (subcommand === 'teardown') {
      ctx.stdout.write(`Stopping container "${CONTAINER}"...\n`);
      const stop = await docker(['stop', CONTAINER]);
      if (stop.code !== 0) {
        ctx.stderr.write(`Stop failed (container may not be running): ${stop.stderr}\n`);
      } else {
        ctx.stdout.write('Container stopped.\n');
      }

      ctx.stdout.write(`Removing container "${CONTAINER}"...\n`);
      const rm = await docker(['rm', CONTAINER]);
      if (rm.code !== 0) {
        ctx.stderr.write(`Remove failed: ${rm.stderr}\n`);
        return 1;
      }
      ctx.stdout.write('Container removed.\n');
      return 0;
    }

    if (subcommand === 'update') {
      if (!(await isContainerRunning())) {
        ctx.stderr.write(`Container "${CONTAINER}" is not running. Run setup first.\n`);
        return 1;
      }

      ctx.stdout.write('Updating package lists...\n');
      const update = await docker(['exec', CONTAINER, 'apt-get', 'update', '-qq']);
      if (update.code !== 0) {
        ctx.stderr.write(`apt-get update failed:\n${update.stderr}\n`);
        return 1;
      }

      ctx.stdout.write('Upgrading installed packages...\n');
      const upgrade = await docker(['exec', CONTAINER, 'apt-get', 'upgrade', '-y']);
      if (upgrade.code !== 0) {
        ctx.stderr.write(`apt-get upgrade failed:\n${upgrade.stderr}\n`);
        return 1;
      }

      ctx.stdout.write('Update complete.\n');
      return 0;
    }

    if (subcommand === 'status') {
      ctx.stdout.write(`\nContainer: ${CONTAINER}\n`);
      const exists = await containerExists();
      const running = exists && (await isContainerRunning());
      ctx.stdout.write(`State: ${!exists ? 'not found' : running ? 'running' : 'stopped'}\n`);

      if (running) {
        ctx.stdout.write('\nTool availability:\n');
        const displayNames: Record<string, string> = {
          dnsutils: 'dig (via dnsutils)',
          theharvester: 'theHarvester',
        };
        for (const tool of SECURITY_TOOLS) {
          const avail = await checkToolInContainer(tool);
          const display = displayNames[tool] ?? tool;
          ctx.stdout.write(`  ${avail ? '✓' : '✗'} ${display}\n`);
        }
      }

      ctx.stdout.write('\nCurrent config (from environment):\n');
      const vars = [
        'MCP_EXPOSE_SECURITY_TOOLS',
        'MCP_SECURITY_TOOLS_MODE',
        'MCP_SECURITY_TOOLS_CONTAINER',
        'MCP_ALLOWED_TARGETS',
        'SHODAN_API_KEY',
      ];
      for (const v of vars) {
        const val = process.env[v];
        const display = v === 'SHODAN_API_KEY' && val ? '[set]' : (val ?? '(not set)');
        ctx.stdout.write(`  ${v}=${display}\n`);
      }
      ctx.stdout.write('\n');
      return 0;
    }

    ctx.stderr.write(`Unknown subcommand: ${subcommand}\n`);
    ctx.stderr.write(`Run 'secureyeoman security --help' for usage.\n`);
    return 1;
  },
};
