/**
 * Edge Command — Start SecureYeoman in edge/IoT mode.
 *
 * Runs a minimal headless runtime: A2A transport, task execution, health endpoint.
 * No brain, soul, spirit, marketplace, or dashboard.
 *
 * Usage:
 *   secureyeoman edge start                    # Start edge runtime
 *   secureyeoman edge start --port 18790       # Custom port
 *   secureyeoman edge register --parent URL    # Register with parent instance
 *   secureyeoman edge status                   # Show edge node info
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, colorContext } from '../utils.js';
import { VERSION } from '../../version.js';

function printHelp(stream: NodeJS.WritableStream): void {
  stream.write(`
Usage: secureyeoman edge <subcommand> [options]

Run SecureYeoman in minimal edge/IoT mode — headless A2A agent.

Subcommands:
  start              Start the edge runtime
  register           Register with a parent SecureYeoman instance
  status             Show edge node capabilities and info

Start options:
  -p, --port <n>              Port for health/A2A endpoints (default: 18789)
  -H, --host <addr>           Bind address (default: 0.0.0.0)
  -c, --config <path>         Config file path
  -l, --log-level <level>     Log level: trace|debug|info|warn|error

Register options:
  --parent <url>              Parent SY instance URL (required)
  --token <token>             Registration token for auth with parent

Environment Variables:
  SECUREYEOMAN_EDGE_TAGS      Comma-separated capability tags (e.g. "gpu,inference")
  SECUREYEOMAN_PARENT_URL     Default parent URL for registration
  SECUREYEOMAN_EDGE_TOKEN     Default registration token
\n`);
}

function printBanner(stream: NodeJS.WritableStream, host: string, port: number): void {
  const versionLabel = `v${VERSION}`.padEnd(13);
  stream.write(`
  ╔═══════════════════════════════════════════╗
  ║       SecureYeoman Edge ${versionLabel}        ║
  ║   Minimal A2A Agent Runtime              ║
  ╚═══════════════════════════════════════════╝

  Health:  http://${host}:${port}/health
  A2A:     http://${host}:${port}/api/v1/a2a/receive
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

  const port = portResult.value ? Number(portResult.value) : undefined;
  const host = hostResult.value ?? '0.0.0.0';
  const configPath = configResult.value;
  const logLevel = logLevelResult.value;

  // Build config overrides for edge mode
  const overrides: Record<string, unknown> = {
    gateway: {
      ...(port ? { port } : {}),
      host,
      allowRemoteAccess: true,
    },
    ...(logLevel ? { logging: { level: logLevel } } : {}),
    // Enable A2A by default in edge mode
    a2a: { enabled: true },
  };

  const { createEdgeRuntime } = await import('../../edge/edge-runtime.js');

  let runtime: Awaited<ReturnType<typeof createEdgeRuntime>> | null = null;

  try {
    runtime = await createEdgeRuntime({
      config: {
        configPath: configPath ?? undefined,
        overrides,
      },
      port,
      host,
    });

    const actualPort = port ?? 18789;
    printBanner(ctx.stdout, host, actualPort);

    // Auto-register with parent if configured
    const parentUrl =
      process.env.SECUREYEOMAN_PARENT_URL;
    const regToken =
      process.env.SECUREYEOMAN_EDGE_TOKEN;

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
      `Failed to start edge runtime: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return 1;
  }

  // Block until shutdown signal
  return new Promise<number>((resolve) => {
    const shutdown = async (signal: string) => {
      ctx.stdout.write(`\nReceived ${signal}, shutting down...\n`);
      try {
        await runtime?.shutdown();
        ctx.stdout.write('Edge shutdown complete.\n');
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
  const token = tokenResult.value ?? process.env.SECUREYEOMAN_EDGE_TOKEN;

  if (!parentUrl) {
    ctx.stderr.write('Error: --parent <url> is required (or set SECUREYEOMAN_PARENT_URL)\n');
    return 1;
  }

  const { createEdgeRuntime } = await import('../../edge/edge-runtime.js');
  const runtime = await createEdgeRuntime();

  try {
    const { peerId } = await runtime.registerWithParent(parentUrl, token);
    const c = colorContext(ctx.stdout);
    ctx.stdout.write(`${c.green('✓')} Registered with ${parentUrl}\n`);
    ctx.stdout.write(`  Peer ID: ${peerId}\n`);
  } catch (err) {
    ctx.stderr.write(
      `Registration failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    await runtime.shutdown();
    return 1;
  }

  await runtime.shutdown();
  return 0;
}

async function runStatus(ctx: CommandContext): Promise<number> {
  const { EdgeRuntime } = await import('../../edge/edge-runtime.js');
  const runtime = new EdgeRuntime();
  const caps = runtime.getCapabilities();
  const c = colorContext(ctx.stdout);

  ctx.stdout.write(`\n${c.bold('SecureYeoman Edge Node')}\n\n`);
  ctx.stdout.write(`  Node ID:    ${caps.nodeId}\n`);
  ctx.stdout.write(`  Hostname:   ${caps.hostname}\n`);
  ctx.stdout.write(`  Arch:       ${caps.arch}\n`);
  ctx.stdout.write(`  Platform:   ${caps.platform}\n`);
  ctx.stdout.write(`  Memory:     ${caps.totalMemoryMb} MB\n`);
  ctx.stdout.write(`  CPU Cores:  ${caps.cpuCores}\n`);
  ctx.stdout.write(`  GPU:        ${caps.hasGpu ? c.green('detected') : c.dim('none')}\n`);
  ctx.stdout.write(`  Tags:       ${caps.tags.length > 0 ? caps.tags.join(', ') : c.dim('none')}\n`);
  ctx.stdout.write(`  Version:    ${VERSION}\n\n`);

  return 0;
}

export const edgeCommand: Command = {
  name: 'edge',
  description: 'Edge/IoT mode — minimal headless A2A agent',
  usage: 'secureyeoman edge <start|register|status> [options]',

  async run(ctx: CommandContext): Promise<number> {
    const sub = ctx.argv[0];

    // --help
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
        ctx.stderr.write(`Unknown edge subcommand: ${sub}\n`);
        printHelp(ctx.stderr);
        return 1;
    }
  },
};
