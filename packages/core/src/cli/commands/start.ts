/**
 * Start Command — Starts the SecureYeoman gateway (refactored from cli.ts main()).
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { createSecureYeoman } from '../../secureyeoman.js';
import type { SecureYeoman } from '../../secureyeoman.js';
import { isOpenSSLAvailable, generateDevCerts } from '../../security/cert-gen.js';
import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag } from '../utils.js';
import { VERSION } from '../../version.js';
import { resolveAgnosticPath, compose } from './agnostic.js';

function printBanner(stream: NodeJS.WritableStream, host: string, port: number, tls = false): void {
  const scheme = tls ? 'https' : 'http';
  const versionLabel = `v${VERSION}`.padEnd(13);
  stream.write(`
  ╔═══════════════════════════════════════════╗
  ║          SecureYeoman ${versionLabel}          ║
  ║   Secure Autonomous Agent Framework       ║
  ╚═══════════════════════════════════════════╝

  Gateway:    ${scheme}://${host}:${port}
  Dashboard:  ${scheme}://${host}:${port} (serve dashboard build)
  Health:     ${scheme}://${host}:${port}/health
  API:        ${scheme}://${host}:${port}/api/v1/
\n`);
}

function printHelp(stream: NodeJS.WritableStream): void {
  stream.write(`
Usage: secureyeoman [start] [options]

Start the SecureYeoman gateway server.

Options:
  -p, --port <number>      Gateway port (default: 3000)
  -H, --host <string>      Gateway host (default: 127.0.0.1)
  -c, --config <path>      Config file path (YAML)
  -l, --log-level <level>  Log level: trace|debug|info|warn|error|fatal
      --tls                Enable TLS (auto-generates dev certs if needed)
  -v, --version            Show version
  -h, --help               Show this help

Environment Variables:
  SECUREYEOMAN_SIGNING_KEY       Audit chain signing key (required)
  SECUREYEOMAN_TOKEN_SECRET      JWT token secret (required)
  SECUREYEOMAN_ENCRYPTION_KEY    Encryption key (required)
  SECUREYEOMAN_ADMIN_PASSWORD    Admin password (required)

  ANTHROPIC_API_KEY              Anthropic API key
  OPENAI_API_KEY                 OpenAI API key
  GOOGLE_GENERATIVE_AI_API_KEY   Google Gemini API key

  AGNOSTIC_AUTO_START=true       Also start the Agnostic QA Docker stack on launch
  AGNOSTIC_PATH=/path/to/agnostic  Path to the Agnostic project (auto-detected if omitted)
\n`);
}

export const startCommand: Command = {
  name: 'start',
  description: 'Start the gateway server (default)',
  usage: 'secureyeoman [start] [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    // --help
    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      printHelp(ctx.stdout);
      return 0;
    }
    argv = helpResult.rest;

    // --version
    const versionResult = extractBoolFlag(argv, 'version', 'v');
    if (versionResult.value) {
      ctx.stdout.write(`secureyeoman v${VERSION}\n`);
      return 0;
    }
    argv = versionResult.rest;

    // Parse flags
    const portResult = extractFlag(argv, 'port', 'p');
    argv = portResult.rest;
    const hostResult = extractFlag(argv, 'host', 'H');
    argv = hostResult.rest;
    const configResult = extractFlag(argv, 'config', 'c');
    argv = configResult.rest;
    const logLevelResult = extractFlag(argv, 'log-level', 'l');
    argv = logLevelResult.rest;
    const dashboardDistResult = extractFlag(argv, 'dashboard-dist');
    argv = dashboardDistResult.rest;
    const tlsResult = extractBoolFlag(argv, 'tls');

    const port = portResult.value ? Number(portResult.value) : undefined;
    const host = hostResult.value;
    const configPath = configResult.value;
    const logLevel = logLevelResult.value;
    const dashboardDist = dashboardDistResult.value;
    const tls = tlsResult.value;

    // Build config overrides
    const overrides: Record<string, unknown> = {};
    if (port || host) {
      overrides.gateway = {
        ...(port ? { port } : {}),
        ...(host ? { host } : {}),
      };
    }
    if (logLevel) {
      overrides.logging = { level: logLevel };
    }

    // --tls: enable TLS, auto-generating dev certs if no paths configured
    if (tls) {
      const gw = (overrides.gateway ?? {}) as Record<string, unknown>;
      const tlsConfig: Record<string, unknown> = { enabled: true };

      if (!gw.tls || !(gw.tls as Record<string, unknown>).certPath) {
        if (!isOpenSSLAvailable()) {
          ctx.stderr.write('Error: --tls requires openssl on PATH to generate dev certs\n');
          return 1;
        }
        const certDir = path.join(os.homedir(), '.secureyeoman', 'dev-certs');
        ctx.stdout.write(`Generating dev TLS certificates in ${certDir} ...\n`);
        const certs = generateDevCerts(certDir);
        tlsConfig.certPath = certs.serverCert;
        tlsConfig.keyPath = certs.serverKey;
        tlsConfig.caPath = certs.caCert;
      }

      gw.tls = tlsConfig;
      overrides.gateway = gw;
    }

    // AGNOSTIC_AUTO_START: optionally bring up the Agnostic QA Docker stack first
    if (process.env.AGNOSTIC_AUTO_START === 'true') {
      const agnosticDir = resolveAgnosticPath();
      if (agnosticDir) {
        ctx.stdout.write(`AGNOSTIC_AUTO_START: starting Agnostic QA team at ${agnosticDir}...\n`);
        const agnosticResult = await compose(agnosticDir, ['up', '-d', '--remove-orphans']);
        if (agnosticResult.code !== 0) {
          ctx.stdout.write(
            `AGNOSTIC_AUTO_START: compose up exited ${agnosticResult.code} — gateway will continue without Agnostic.\n`
          );
          if (agnosticResult.stderr) ctx.stdout.write(agnosticResult.stderr + '\n');
        } else {
          ctx.stdout.write('AGNOSTIC_AUTO_START: Agnostic QA team started.\n');
        }
      } else {
        ctx.stdout.write(
          'AGNOSTIC_AUTO_START=true but Agnostic directory not found — skipping. ' +
            'Set AGNOSTIC_PATH or ensure agnostic is at ../agnostic.\n'
        );
      }
    }

    let instance: SecureYeoman | null = null;

    try {
      instance = await createSecureYeoman({
        config: {
          configPath,
          overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        },
        enableGateway: true,
        dashboardDist: dashboardDist ?? undefined,
      });

      const config = instance.getConfig();
      const actualHost = host ?? config.gateway.host;
      const actualPort = port ?? config.gateway.port;
      printBanner(ctx.stdout, actualHost, actualPort, tls);
    } catch (error) {
      ctx.stderr.write(
        `Failed to start SecureYeoman: ${error instanceof Error ? error.message : String(error)}\n`
      );
      return 1;
    }

    // Block until shutdown signal
    return new Promise<number>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      const shutdown = async (signal: string) => {
        ctx.stdout.write(`\nReceived ${signal}, shutting down...\n`);
        try {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          await instance?.shutdown();
          ctx.stdout.write('Shutdown complete.\n');
          resolve(0);
        } catch (err) {
          ctx.stderr.write(`Error during shutdown: ${String(err)}\n`);
          resolve(1);
        }
      };

      process.on('SIGINT', () => void shutdown('SIGINT'));
      process.on('SIGTERM', () => void shutdown('SIGTERM'));
    });
  },
};
