/**
 * AgentRuntime — Streamlined SecureYeoman runtime for autonomous agents (Tier 2.5).
 *
 * Includes: soul, AI, delegation, auth (delegated), security (subset), A2A transport.
 * Excludes: brain/RAG, training, analytics, simulation, dashboard, marketplace, DLP, TEE.
 *
 * Designed for: <5s boot, 100–200 MB RAM, SQLite storage, headless operation.
 * Follows the same pattern as EdgeRuntime but adds personality-driven AI capabilities.
 */

import { loadConfig, getSecret, type LoadConfigOptions } from '../config/loader.js';
import { initializeLogger, type SecureLogger } from '../logging/logger.js';
import { AuditChain, InMemoryAuditStorage } from '../logging/audit-chain.js';
import { A2AManager } from '../a2a/manager.js';
import { A2AStorage } from '../a2a/storage.js';
import { RemoteDelegationTransport } from '../a2a/transport.js';
import { initPoolFromConfig, closePool } from '../storage/pg-pool.js';
import { runMigrations } from '../storage/migrations/runner.js';
import type { Config, AIRequest } from '@secureyeoman/shared';
import { VERSION } from '../version.js';

// ── Module imports (dynamic to enable tree-shaking) ──────────────────

import { SecurityModule } from '../modules/security-module.js';
import { AuthModule } from '../modules/auth-module.js';
import { AuditModule } from '../modules/audit-module.js';
import { AIModule } from '../modules/ai-module.js';
import { SoulModule } from '../modules/soul-module.js';

// ── Types ────────────────────────────────────────────────────────────

export interface AgentRuntimeOptions {
  /** Configuration options */
  config?: LoadConfigOptions;
  /** Parent SY instance URL for auth delegation / knowledge queries */
  parentUrl?: string;
  /** Registration token for authenticating with parent */
  registrationToken?: string;
  /** Port override */
  port?: number;
  /** Host override */
  host?: string;
  /** Personality name to load at boot (default: auto-detect first) */
  personality?: string;
}

export interface AgentCapabilities {
  nodeId: string;
  hostname: string;
  arch: string;
  platform: string;
  totalMemoryMb: number;
  cpuCores: number;
  hasGpu: boolean;
  mode: 'agent';
  personality: string | null;
  aiProvider: string | null;
  tags: string[];
}

// ── AgentRuntime ─────────────────────────────────────────────────────

export class AgentRuntime {
  private config: Config | null = null;
  private logger: SecureLogger | null = null;
  private auditChain: AuditChain | null = null;
  private a2aManager: A2AManager | null = null;
  private server: import('node:http').Server | null = null;
  private readonly options: AgentRuntimeOptions;
  private startedAt: number | null = null;
  private shutdownRequested = false;

  // Modules
  private securityMod: SecurityModule | null = null;
  private authMod: AuthModule | null = null;
  private auditMod: AuditModule | null = null;
  private aiMod: AIModule | null = null;
  private soulMod: SoulModule | null = null;

  private activePersonality: string | null = null;

  constructor(options: AgentRuntimeOptions = {}) {
    this.options = options;
  }

  // ── Initialization ──────────────────────────────────────────────────

  async initialize(): Promise<void> {
    const initStart = performance.now();

    // Step 1: Load config
    this.config = loadConfig(this.options.config);

    // Apply overrides
    if (this.options.port) this.config.gateway.port = this.options.port;
    if (this.options.host) this.config.gateway.host = this.options.host;

    // Step 2: Logger
    this.logger = initializeLogger(
      this.config.logging ?? {
        level: 'info',
        format: 'json',
        output: [{ type: 'stdout', format: 'json' }],
        audit: { enabled: false },
      }
    );
    this.logger.info({ version: VERSION }, 'SecureYeoman Agent starting');

    // Step 3: Database (optional — agents can run SQLite-only or with PG)
    const dbConfig = this.config.core?.database;
    if (dbConfig?.host && dbConfig?.database) {
      initPoolFromConfig(dbConfig);
      await runMigrations();
      this.logger.debug('Database initialized');
    }

    // Step 4: Audit chain (in-memory — lightweight for agent mode)
    const auditStorage = new InMemoryAuditStorage();
    const signingKey = getSecret('SECUREYEOMAN_SIGNING_KEY') ?? `agent-audit-${Date.now()}`;
    this.auditChain = new AuditChain({ storage: auditStorage, signingKey });
    await this.auditChain.initialize();

    // Step 5: Security module (early phase — keyring, secrets)
    this.securityMod = new SecurityModule();
    await this.securityMod.init({ config: this.config, logger: this.logger });
    await this.securityMod.initEarly();
    this.logger.debug('Security module (early) initialized');

    // Step 6: Auth module (delegated to parent when parentUrl is set)
    const rbac = this.securityMod.getRBAC();
    const rateLimiter = this.securityMod.getRateLimiter();
    this.authMod = new AuthModule({
      auditChain: this.auditChain,
      rbac: rbac!,
      rateLimiter: rateLimiter!,
    });
    await this.authMod.init({ config: this.config, logger: this.logger });
    this.logger.debug('Auth module initialized');

    // Step 7: AI module
    this.aiMod = new AIModule({
      auditChain: this.auditChain,
      getAlertManager: () => null, // Agents don't run alerts
      onConfigUpdate: (updater) => {
        if (this.config) this.config = updater(this.config);
      },
    });
    await this.aiMod.init({ config: this.config, logger: this.logger });
    this.logger.debug('AI module initialized');

    // Step 8: Soul module (personality, skills, spirit)
    this.soulMod = new SoulModule({
      getDepartmentRiskManager: () => null,
    });
    await this.soulMod.init({ config: this.config, logger: this.logger });
    // Skip initEarly (OPA intent — not needed for agents)
    // initCore needs auditChain and brainManager. Agents skip brain,
    // so we pass null where safe.
    await this.soulMod.initCore({
      auditChain: this.auditChain,
      brainManager: null as any, // Brain not available in agent mode
    });
    this.activePersonality = this.options.personality ?? null;
    this.logger.debug({ personality: this.activePersonality }, 'Soul module initialized');

    // Step 9: A2A transport (agent as A2A peer)
    if (this.config.a2a?.enabled) {
      const a2aConfig = this.config.a2a ?? {
        enabled: true,
        discoveryMethod: 'manual' as const,
        trustedPeers: [],
        port: this.config.gateway.port,
        maxPeers: 10,
      };

      const a2aStorage = new A2AStorage();
      const transport = new RemoteDelegationTransport({
        logger: this.logger.child({ component: 'A2ATransport' }),
      });

      this.a2aManager = new A2AManager(a2aConfig, {
        storage: a2aStorage,
        transport,
        logger: this.logger.child({ component: 'A2AManager' }),
        auditChain: this.auditChain,
      });
      await this.a2aManager.initialize();
      this.logger.debug('A2A manager initialized');
    }

    // Step 10: Start HTTP server
    await this.startServer();

    this.startedAt = Date.now();
    const elapsed = (performance.now() - initStart).toFixed(0);
    this.logger.info(
      { elapsedMs: elapsed, port: this.config.gateway.port },
      'SecureYeoman Agent ready'
    );
  }

  // ── HTTP Server ────────────────────────────────────────────────────

  private async startServer(): Promise<void> {
    const { createServer } = await import('node:http');
    const host = this.config!.gateway.host;
    const port = this.config!.gateway.port;

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.server = createServer(async (req, res) => {
      const url = req.url ?? '/';
      const method = req.method ?? 'GET';

      // Health
      if (url === '/health' && method === 'GET') {
        this.sendJson(res, 200, {
          status: 'ok',
          mode: 'agent',
          version: VERSION,
          uptime: this.startedAt ? Date.now() - this.startedAt : 0,
          personality: this.activePersonality,
          capabilities: this.getCapabilities(),
        });
        return;
      }

      // Chat (core agent endpoint)
      if (url === '/api/v1/agent/chat' && method === 'POST') {
        return this.handleChat(req, res);
      }

      // Models list
      if (url === '/api/v1/agent/models' && method === 'GET') {
        this.sendJson(res, 200, {
          defaultModel: this.config?.model?.provider ?? 'unknown',
          defaultModelName: this.config?.model?.model ?? 'unknown',
        });
        return;
      }

      // A2A receive
      if (url === '/api/v1/a2a/receive' && method === 'POST') {
        return this.handleA2AReceive(req, res);
      }

      // A2A capabilities
      if (url === '/api/v1/a2a/capabilities' && method === 'GET') {
        this.sendJson(res, 200, { capabilities: this.getCapabilities() });
        return;
      }

      // Personality info
      if (url === '/api/v1/agent/personality' && method === 'GET') {
        this.sendJson(res, 200, {
          personality: this.activePersonality,
          soulManager: this.soulMod?.getSoulManager() != null,
          spiritManager: this.soulMod?.getSpiritManager() != null,
        });
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(port, host, () => {
        resolve();
      });
      this.server!.once('error', reject);
    });
  }

  // ── Chat Handler ───────────────────────────────────────────────────

  private async handleChat(
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse
  ): Promise<void> {
    try {
      const body = await this.readBody(req);
      const { message, conversationId } = body as {
        message?: string;
        conversationId?: string;
      };

      if (!message || typeof message !== 'string') {
        this.sendJson(res, 400, { error: 'message is required' });
        return;
      }

      const aiClient = this.aiMod?.getAIClient();
      if (!aiClient) {
        this.sendJson(res, 503, { error: 'AI client not available' });
        return;
      }

      // Build system prompt from active personality if available
      let systemPrompt = 'You are a helpful assistant.';
      const soulManager = this.soulMod?.getSoulManager();
      if (soulManager) {
        try {
          const { personalities } = await soulManager.listPersonalities({ limit: 100 });
          const match = personalities.find(
            (p: { name: string }) => p.name.toLowerCase() === this.activePersonality?.toLowerCase()
          );
          // Personality objects store traits, not a single systemPrompt — use name as context
          if (match) {
            systemPrompt = `You are ${match.name}. Be helpful and stay in character.`;
          }
        } catch {
          // Use default
        }
      }

      const chatRequest: AIRequest = {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        stream: false,
      };
      const response = await aiClient.chat(chatRequest);

      this.sendJson(res, 200, {
        response: response.content,
        conversationId: conversationId ?? crypto.randomUUID(),
        model: response.model,
        usage: response.usage,
      });
      return;
    } catch (err) {
      this.logger?.error({ err }, 'Chat handler error');
      this.sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Internal error',
      });
      return;
    }
  }

  // ── A2A Handler ────────────────────────────────────────────────────

  private async handleA2AReceive(
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse
  ): Promise<void> {
    try {
      const body = await this.readBody(req);

      if (!this.a2aManager) {
        this.sendJson(res, 503, { error: 'A2A not initialized' });
        return;
      }

      this.logger?.debug(
        { type: (body as any).type, from: (body as any).fromPeerId },
        'A2A message received'
      );
      this.sendJson(res, 200, { ok: true, received: (body as any).type });
      return;
    } catch (err) {
      this.logger?.error({ err }, 'A2A receive error');
      this.sendJson(res, 400, {
        error: err instanceof Error ? err.message : 'Bad request',
      });
      return;
    }
  }

  // ── Registration ───────────────────────────────────────────────────

  async registerWithParent(parentUrl: string, token?: string): Promise<{ peerId: string }> {
    const capabilities = this.getCapabilities();
    const port = this.config?.gateway.port ?? 8099;
    const host = this.config?.gateway.host ?? '0.0.0.0';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${parentUrl}/api/v1/a2a/peers/local`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: `http://${host}:${port}`,
        name: capabilities.hostname,
        capabilities,
        mode: 'agent',
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Registration failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as { peer?: { id: string } };
    const peerId = data.peer?.id ?? 'unknown';

    this.logger?.info({ parentUrl, peerId }, 'Registered with parent instance');
    return { peerId };
  }

  // ── Capabilities ───────────────────────────────────────────────────

  getCapabilities(): AgentCapabilities {
    const os = require('node:os') as typeof import('node:os');
    return {
      nodeId: this.getNodeId(),
      hostname: os.hostname(),
      arch: os.arch(),
      platform: os.platform(),
      totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
      cpuCores: os.cpus().length,
      hasGpu: this.detectGpu(),
      mode: 'agent',
      personality: this.activePersonality,
      aiProvider: this.config?.model?.provider ?? null,
      tags: this.getCapabilityTags(),
    };
  }

  // ── Getters ────────────────────────────────────────────────────────

  getConfig(): Config | null {
    return this.config;
  }

  getLogger(): SecureLogger | null {
    return this.logger;
  }

  getAIModule(): AIModule | null {
    return this.aiMod;
  }

  getSoulModule(): SoulModule | null {
    return this.soulMod;
  }

  // ── Shutdown ───────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    if (this.shutdownRequested) return;
    this.shutdownRequested = true;

    this.logger?.info('SecureYeoman Agent shutting down');

    // Cleanup modules in reverse init order
    if (this.a2aManager) {
      await this.a2aManager.cleanup();
    }

    if (this.soulMod) {
      await this.soulMod.cleanup();
    }

    if (this.aiMod) {
      await this.aiMod.cleanup();
    }

    if (this.authMod) {
      await this.authMod.cleanup();
    }

    if (this.securityMod) {
      await this.securityMod.cleanup();
    }

    // Close HTTP server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          resolve();
        });
      });
    }

    // Close database pool
    try {
      await closePool();
    } catch {
      // Pool may not have been initialized
    }

    this.logger?.info('SecureYeoman Agent shutdown complete');
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private async readBody(req: import('node:http').IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  }

  private getNodeId(): string {
    const os = require('node:os') as typeof import('node:os');
    const crypto = require('node:crypto') as typeof import('node:crypto');
    const interfaces = os.networkInterfaces();
    let mac = '';
    for (const ifaces of Object.values(interfaces)) {
      for (const iface of ifaces ?? []) {
        if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
          mac = iface.mac;
          break;
        }
      }
      if (mac) break;
    }
    return crypto.createHash('sha256').update(`${os.hostname()}:${mac}`).digest('hex').slice(0, 16);
  }

  private detectGpu(): boolean {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    if (existsSync('/dev/nvidia0')) return true;
    if (existsSync('/dev/dri/renderD128')) return true;
    return false;
  }

  private getCapabilityTags(): string[] {
    const tags: string[] = ['agent'];
    const os = require('node:os') as typeof import('node:os');

    if (os.arch() === 'arm64') tags.push('arm64');
    if (os.arch() === 'x64') tags.push('x64');
    if (this.detectGpu()) tags.push('gpu');
    if (os.totalmem() > 4 * 1024 * 1024 * 1024) tags.push('high-memory');
    if (os.cpus().length >= 4) tags.push('multi-core');

    const customTags = process.env.SECUREYEOMAN_AGENT_TAGS;
    if (customTags) {
      tags.push(...customTags.split(',').map((t) => t.trim()));
    }

    return tags;
  }
}

// ── Factory ──────────────────────────────────────────────────────────

export async function createAgentRuntime(options?: AgentRuntimeOptions): Promise<AgentRuntime> {
  const runtime = new AgentRuntime(options);
  await runtime.initialize();
  return runtime;
}
