/**
 * Agent Command — Start SecureYeoman in agent mode (Tier 2.5).
 *
 * Runs a streamlined runtime with soul + AI + delegation capabilities.
 * No brain/RAG, no training, no dashboard, no marketplace.
 *
 * Usage:
 *   secureyeoman agent start                     # Start agent runtime
 *   secureyeoman agent start --personality FRIDAY # Specific personality
 *   secureyeoman agent register --parent URL      # Register with parent SY
 *   secureyeoman agent status                     # Show agent info
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, colorContext } from '../utils.js';
import { VERSION } from '../../version.js';

function printHelp(stream: NodeJS.WritableStream): void {
  stream.write(`
Usage: secureyeoman agent <subcommand> [options]

Run SecureYeoman in agent mode — streamlined AI agent runtime (Tier 2.5).

Subcommands:
  start              Start the agent runtime
  register           Register with a parent SecureYeoman instance
  status             Show agent node capabilities and info

Start options:
  -p, --port <n>              Port for agent endpoints (default: 8099)
  -H, --host <addr>           Bind address (default: 0.0.0.0)
  -c, --config <path>         Config file path
  -l, --log-level <level>     Log level: trace|debug|info|warn|error
  --personality <name>        Personality to load at boot (e.g. FRIDAY)

Register options:
  --parent <url>              Parent SY instance URL (required)
  --token <token>             Registration token for auth with parent

Environment Variables:
  SECUREYEOMAN_AGENT_TAGS     Comma-separated capability tags
  SECUREYEOMAN_PARENT_URL     Default parent URL for registration
  SECUREYEOMAN_AGENT_TOKEN    Default registration token
\n`);
}

function printBanner(
  stream: NodeJS.WritableStream,
  host: string,
  port: number,
  personality?: string
): void {
  const versionLabel = `v${VERSION}`.padEnd(13);
  stream.write(`
  ╔═══════════════════════════════════════════╗
  ║     SecureYeoman Agent ${versionLabel}        ║
  ║   AI Agent Runtime (Tier 2.5)            ║
  ╚═══════════════════════════════════════════╝

  Health:      http://${host}:${port}/health
  Chat:        http://${host}:${port}/api/v1/agent/chat
  A2A:         http://${host}:${port}/api/v1/a2a/receive
  Personality: ${personality ?? '(auto)'}
\n`);
}

async function runStart(ctx: CommandContext): Promise<number> {
  let argv = ctx.argv;

  const portResult = extractFlag(argv, 'port', 'p');
  argv = portResult.rest;
  const hostResult = extractFlag(argv, 'host', 'H');
  argv = hostResult.rest;
  const configResult = extractFlag(argv, 'config', 'c');
  argv = configResult.rest;
  const logLevelResult = extractFlag(argv, 'log-level', 'l');
  argv = logLevelResult.rest;
  const personalityResult = extractFlag(argv, 'personality');

  const port = portResult.value ? Number(portResult.value) : 8099;
  const host = hostResult.value ?? '0.0.0.0';
  const configPath = configResult.value;
  const logLevel = logLevelResult.value;
  const personality = personalityResult.value;

  const overrides: Record<string, unknown> = {
    gateway: { port, host, allowRemoteAccess: true },
    ...(logLevel ? { logging: { level: logLevel } } : {}),
    a2a: { enabled: true },
  };

  const { createAgentRuntime } = await import('../../agent/agent-runtime.js');

  let runtime: Awaited<ReturnType<typeof createAgentRuntime>> | null = null;

  try {
    runtime = await createAgentRuntime({
      config: {
        configPath: configPath ?? undefined,
        overrides,
      },
      port,
      host,
      personality: personality ?? undefined,
    });

    printBanner(ctx.stdout, host, port, personality ?? undefined);

    // Auto-register with parent if configured
    const parentUrl = process.env.SECUREYEOMAN_PARENT_URL;
    const regToken = process.env.SECUREYEOMAN_AGENT_TOKEN;

    if (parentUrl) {
      try {
        const { peerId } = await runtime.registerWithParent(parentUrl, regToken);
        ctx.stdout.write(`  Registered with parent: ${parentUrl} (peer: ${peerId})\n\n`);
      } catch (err) {
        ctx.stderr.write(
          `  Warning: Failed to register with parent ${parentUrl}: ${err instanceof Error ? err.message : String(err)}\n\n`
        );
      }
    }
  } catch (error) {
    ctx.stderr.write(
      `Failed to start agent runtime: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return 1;
  }

  // Block until shutdown signal
  return new Promise<number>((resolve) => {
    const shutdown = async (signal: string) => {
      ctx.stdout.write(`\nReceived ${signal}, shutting down...\n`);
      try {
        await runtime?.shutdown();
        ctx.stdout.write('Agent shutdown complete.\n');
        resolve(0);
      } catch (err) {
        ctx.stderr.write(`Error during shutdown: ${String(err)}\n`);
        resolve(1);
      }
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  });
}

async function runRegister(ctx: CommandContext): Promise<number> {
  let argv = ctx.argv;

  const parentResult = extractFlag(argv, 'parent');
  argv = parentResult.rest;
  const tokenResult = extractFlag(argv, 'token');

  const parentUrl = parentResult.value ?? process.env.SECUREYEOMAN_PARENT_URL;
  const token = tokenResult.value ?? process.env.SECUREYEOMAN_AGENT_TOKEN;

  if (!parentUrl) {
    ctx.stderr.write('Error: --parent <url> is required (or set SECUREYEOMAN_PARENT_URL)\n');
    return 1;
  }

  const { createAgentRuntime } = await import('../../agent/agent-runtime.js');
  const runtime = await createAgentRuntime({ port: 0 });

  try {
    const { peerId } = await runtime.registerWithParent(parentUrl, token);
    const c = colorContext(ctx.stdout);
    ctx.stdout.write(`${c.green('✓')} Registered with ${parentUrl}\n`);
    ctx.stdout.write(`  Peer ID: ${peerId}\n`);
  } catch (err) {
    ctx.stderr.write(`Registration failed: ${err instanceof Error ? err.message : String(err)}\n`);
    await runtime.shutdown();
    return 1;
  }

  await runtime.shutdown();
  return 0;
}

async function runStatus(ctx: CommandContext): Promise<number> {
  const { AgentRuntime } = await import('../../agent/agent-runtime.js');
  const runtime = new AgentRuntime();
  const caps = runtime.getCapabilities();
  const c = colorContext(ctx.stdout);

  ctx.stdout.write(`\n${c.bold('SecureYeoman Agent Node')}\n\n`);
  ctx.stdout.write(`  Node ID:      ${caps.nodeId}\n`);
  ctx.stdout.write(`  Hostname:     ${caps.hostname}\n`);
  ctx.stdout.write(`  Arch:         ${caps.arch}\n`);
  ctx.stdout.write(`  Platform:     ${caps.platform}\n`);
  ctx.stdout.write(`  Memory:       ${caps.totalMemoryMb} MB\n`);
  ctx.stdout.write(`  CPU Cores:    ${caps.cpuCores}\n`);
  ctx.stdout.write(`  GPU:          ${caps.hasGpu ? c.green('detected') : c.dim('none')}\n`);
  ctx.stdout.write(`  Mode:         ${c.bold('agent')}\n`);
  ctx.stdout.write(`  Personality:  ${caps.personality ?? c.dim('none')}\n`);
  ctx.stdout.write(`  AI Provider:  ${caps.aiProvider ?? c.dim('none')}\n`);
  ctx.stdout.write(
    `  Tags:         ${caps.tags.length > 0 ? caps.tags.join(', ') : c.dim('none')}\n`
  );
  ctx.stdout.write(`  Version:      ${VERSION}\n\n`);

  return 0;
}

export const agentCommand: Command = {
  name: 'agent',
  description: 'Agent mode — streamlined AI agent runtime (Tier 2.5)',
  usage: 'secureyeoman agent <start|register|status> [options]',

  async run(ctx: CommandContext): Promise<number> {
    const sub = ctx.argv[0];

    const helpResult = extractBoolFlag(ctx.argv, 'help', 'h');
    if (helpResult.value || !sub) {
      printHelp(ctx.stdout);
      return 0;
    }

    switch (sub) {
      case 'start':
        return runStart({ ...ctx, argv: ctx.argv.slice(1) });
      case 'register':
        return runRegister({ ...ctx, argv: ctx.argv.slice(1) });
      case 'status':
        return runStatus({ ...ctx, argv: ctx.argv.slice(1) });
      default:
        ctx.stderr.write(`Unknown agent subcommand: ${sub}\n`);
        printHelp(ctx.stderr);
        return 1;
    }
  },
};
