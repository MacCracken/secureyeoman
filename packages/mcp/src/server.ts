/**
 * McpServiceServer — Fastify + MCP SDK server.
 *
 * Lifecycle: validate core → register tools/resources/prompts → auto-register → listen.
 */

import { unlinkSync } from 'node:fs';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import Fastify, { type FastifyInstance } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import { CoreApiClient } from './core-client.js';
import { ProxyAuth } from './auth/proxy-auth.js';
import { AutoRegistration } from './registration/auto-register.js';
import { registerStreamableHttpTransport } from './transport/streamable-http.js';
import { registerAllTools, type ToolMiddleware } from './tools/index.js';
import { globalToolRegistry } from './tools/tool-utils.js';
import { shutdownBrowserPool } from './tools/browser-tools.js';
import { shutdownNetworkTools } from './tools/network-tools.js';
import { shutdownTwingateTools } from './tools/twingate-tools.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';
import { createRateLimiter } from './middleware/rate-limiter.js';
import { createInputValidator } from './middleware/input-validator.js';
import { createAuditLogger } from './middleware/audit-logger.js';
import { createSecretRedactor } from './middleware/secret-redactor.js';
import { registerDashboardRoutes } from './dashboard/routes.js';
import { decryptSshKey } from './utils/ssh-crypto.js';
import { MCP_VERSION } from './utils/version.js';

export interface McpServiceServerOptions {
  config: McpServiceConfig;
  coreClient: CoreApiClient;
}

export class McpServiceServer {
  private readonly config: McpServiceConfig;
  private readonly app: FastifyInstance;
  private readonly coreClient: CoreApiClient;
  private readonly auth: ProxyAuth;
  private readonly autoReg: AutoRegistration;
  private readonly mcpServer: McpServer;
  private rateLimiterPruneTimer: ReturnType<typeof setInterval> | null = null;
  /** Cached middleware — created once, reused for per-session server factories. */
  private toolMiddleware: ToolMiddleware | null = null;

  constructor(opts: McpServiceServerOptions) {
    this.config = opts.config;
    this.coreClient = opts.coreClient;
    this.auth = new ProxyAuth(this.coreClient);
    this.autoReg = new AutoRegistration(this.coreClient, this.config);

    this.app = Fastify({
      logger: false,
      bodyLimit: 1_048_576,
    });

    this.mcpServer = new McpServer({
      name: 'secureyeoman-mcp',
      version: MCP_VERSION,
    });
  }

  /**
   * Create a fresh McpServer instance with all tools, resources, and prompts
   * registered. Used by the streamable HTTP transport to give each session
   * its own server (required by the MCP SDK — one transport per server).
   */
  async createSessionServer(): Promise<McpServer> {
    const server = new McpServer({
      name: 'secureyeoman-mcp',
      version: MCP_VERSION,
    });

    if (this.toolMiddleware) {
      await registerAllTools(server, this.coreClient, this.config, this.toolMiddleware);
      registerAllResources(server, this.coreClient);
      registerAllPrompts(server, this.coreClient);
    }

    return server;
  }

  async start(): Promise<void> {
    // 1. Validate core reachability
    const coreHealthy = await this.coreClient.healthCheck();
    if (!coreHealthy) {
      throw new Error(`Core service unreachable at ${this.config.coreUrl}`);
    }

    // 2. Set up middleware
    const rateLimiter = createRateLimiter(this.config.rateLimitPerTool);
    // Prune stale rate-limit buckets every 10 minutes
    this.rateLimiterPruneTimer = setInterval(
      () => {
        rateLimiter.prune();
      },
      10 * 60 * 1000
    );
    this.rateLimiterPruneTimer.unref();
    const inputValidator = createInputValidator();
    const auditLogger = createAuditLogger(this.coreClient);
    const secretRedactor = createSecretRedactor();

    // 3. Register tools, resources, prompts
    this.toolMiddleware = { rateLimiter, inputValidator, auditLogger, secretRedactor };
    await registerAllTools(this.mcpServer, this.coreClient, this.config, this.toolMiddleware);
    registerAllResources(this.mcpServer, this.coreClient);
    registerAllPrompts(this.mcpServer, this.coreClient);

    // 3.5 Restore SSH keys from SecretsManager (encrypted at rest; decrypted locally)
    await this.restoreSshKeys();

    // 4. Register transports
    if (this.config.transport === 'streamable-http') {
      registerStreamableHttpTransport({
        app: this.app,
        auth: this.auth,
        createServer: () => this.createSessionServer(),
      });
    }

    // 5. Register dashboard routes
    registerDashboardRoutes(this.app, this.auth, this.mcpServer);

    // 5a. Internal tool-call endpoint — lets core call YEOMAN MCP tools directly
    // without going through the full MCP protocol (initialize → tools/call → close).
    // Auth: same ProxyAuth JWT as all other endpoints.
    this.app.post('/api/v1/internal/tool-call', async (request, reply) => {
      const token = this.auth.extractToken(request.headers.authorization);
      if (!token) return reply.code(401).send({ error: 'Unauthorized' });
      const authResult = await this.auth.verify(token);
      if (!authResult.valid) return reply.code(401).send({ error: 'Unauthorized' });

      const { name, arguments: args } = request.body as {
        name?: string;
        arguments?: Record<string, unknown>;
      };
      if (!name) return reply.code(400).send({ error: 'Missing tool name' });

      const handler = globalToolRegistry.get(name);
      if (!handler) return reply.code(404).send({ error: `Tool not found: ${name}` });

      try {
        const result = await handler(args ?? {});
        return result;
      } catch (err) {
        return reply.code(500).send({ error: String(err) });
      }
    });

    // 6. Health endpoint
    this.app.get('/health', async () => ({
      status: 'ok',
      service: 'secureyeoman-mcp',
      version: MCP_VERSION,
      transport: this.config.transport,
    }));

    // 7. Auto-register with core
    if (this.config.autoRegister) {
      try {
        await this.autoReg.register();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Log but don't crash
        process.stderr.write(`[secureyeoman-mcp] Auto-registration warning: ${msg}\n`);
      }
    }

    // 8. Start listening
    await this.app.listen({ host: this.config.host, port: this.config.port });
  }

  /**
   * Restore SSH private keys from encrypted SecretsManager entries.
   *
   * On container restart ~/.ssh/ is empty.  Any GITHUB_SSH_* secrets stored
   * during a previous session are fetched from core, decrypted with the shared
   * tokenSecret, and written back to ~/.ssh/yeoman_github_ed25519 (the last one
   * stored wins — there is normally only one active key at a time).
   *
   * The matching ~/.ssh/config block is also restored so git can push/pull.
   * Failures are non-fatal — we just log a warning.
   */
  /** Paths of SSH key files written by this process, cleaned up on exit. */
  private sshKeyPaths: string[] = [];
  private sshCleanupRegistered = false;

  /**
   * Remove SSH key files written by restoreSshKeys().
   * Called on process exit / SIGTERM / SIGINT to avoid leaving plaintext
   * private keys on disk after the MCP service stops.
   */
  private cleanupSshKeys(): void {
    // Synchronous best-effort cleanup (process 'exit' handlers can't be async)
    for (const p of this.sshKeyPaths) {
      try {
        unlinkSync(p);
      } catch {
        // best-effort — file may already be gone
      }
    }
    this.sshKeyPaths = [];
  }

  private registerSshCleanupHandlers(): void {
    if (this.sshCleanupRegistered) return;
    this.sshCleanupRegistered = true;

    const cleanup = () => {
      this.cleanupSshKeys();
    };
    process.on('exit', cleanup);
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
  }

  private async restoreSshKeys(): Promise<void> {
    const tokenSecret = this.config.tokenSecret;
    if (!tokenSecret) return; // no token → can't decrypt; skip

    const sshDir = `${homedir()}/.ssh`;
    const keyPath = `${sshDir}/yeoman_github_ed25519`;

    // Clean up stale key files from previous runs before writing new ones
    try {
      await unlink(keyPath);
    } catch {
      // File didn't exist — that's fine
    }

    try {
      const result = await this.coreClient.get<{
        keys: { name: string; ciphertext: string }[];
      }>('/api/v1/internal/ssh-keys');
      if (!result?.keys?.length) return;

      await mkdir(sshDir, { recursive: true });

      for (const { name, ciphertext } of result.keys) {
        try {
          const privateKey = decryptSshKey(ciphertext, tokenSecret);
          await writeFile(keyPath, privateKey, { mode: 0o600 });

          // Track for cleanup on exit
          if (!this.sshKeyPaths.includes(keyPath)) {
            this.sshKeyPaths.push(keyPath);
          }
          this.registerSshCleanupHandlers();

          // Restore ~/.ssh/config block if not already present
          const configPath = `${sshDir}/config`;
          const configEntry =
            '\n# --- SecureYeoman managed — do not edit this block manually ---\n' +
            `Host github.com\n  IdentityFile ${keyPath}\n  IdentitiesOnly yes\n  StrictHostKeyChecking accept-new\n` +
            '# --- end SecureYeoman managed ---\n';
          let existing = '';
          try {
            existing = await readFile(configPath, 'utf8');
          } catch {
            /* first run */
          }
          if (!existing.includes('SecureYeoman managed')) {
            await writeFile(configPath, existing + configEntry, { mode: 0o600 });
          }
          process.stderr.write(
            `[secureyeoman-mcp] Restored SSH key from secret ${name} → ${keyPath}\n`
          );
        } catch (err) {
          process.stderr.write(
            `[secureyeoman-mcp] Failed to restore SSH key ${name}: ${err instanceof Error ? err.message : String(err)}\n`
          );
        }
      }
    } catch (err) {
      // Core may not have SSH keys or the route may not be registered yet — non-fatal
      process.stderr.write(
        `[secureyeoman-mcp] restoreSshKeys: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }

  async stop(): Promise<void> {
    // Clean up rate limiter prune timer
    if (this.rateLimiterPruneTimer) {
      clearInterval(this.rateLimiterPruneTimer);
      this.rateLimiterPruneTimer = null;
    }
    // Clean up SSH keys written to disk
    this.cleanupSshKeys();
    // Shutdown browser pool if active
    await shutdownBrowserPool();
    // Clean up module-level timers and sessions
    shutdownNetworkTools();
    shutdownTwingateTools();
    // Deregister from core
    await this.autoReg.deregister();
    // Close MCP server
    await this.mcpServer.server.close();
    // Close Fastify
    await this.app.close();
  }

  getApp(): FastifyInstance {
    return this.app;
  }

  getMcpServer(): McpServer {
    return this.mcpServer;
  }

  getCoreClient(): CoreApiClient {
    return this.coreClient;
  }

  getAuth(): ProxyAuth {
    return this.auth;
  }
}

export function createMcpServiceServer(opts: McpServiceServerOptions): McpServiceServer {
  return new McpServiceServer(opts);
}
