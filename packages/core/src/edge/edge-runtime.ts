/**
 * EdgeRuntime — Minimal headless SecureYeoman runtime for edge/IoT devices.
 *
 * Runs only: config, logging, auth, A2A transport, task execution, health endpoint.
 * Skips: brain, soul, spirit, marketplace, dashboard, training, analytics, integrations.
 *
 * Designed for <128 MB RAM and <5s boot on constrained hardware.
 */

import {
  loadConfig,
  validateSecrets,
  getSecret,
  type LoadConfigOptions,
} from '../config/loader.js';
import { initializeLogger, type SecureLogger } from '../logging/logger.js';
import { AuditChain, InMemoryAuditStorage } from '../logging/audit-chain.js';
import { A2AManager } from '../a2a/manager.js';
import { A2AStorage } from '../a2a/storage.js';
import { RemoteDelegationTransport } from '../a2a/transport.js';
import { initPoolFromConfig, getPool, closePool } from '../storage/pg-pool.js';
import { runMigrations } from '../storage/migrations/runner.js';
import type { Config } from '@secureyeoman/shared';
import { VERSION } from '../version.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EdgeRuntimeOptions {
  /** Configuration options */
  config?: LoadConfigOptions;
  /** Parent SY instance URL for registration */
  parentUrl?: string;
  /** Registration token for authenticating with parent */
  registrationToken?: string;
  /** Port override for edge health/A2A endpoints */
  port?: number;
  /** Host override */
  host?: string;
}

export interface EdgeCapabilities {
  /** Unique node identifier */
  nodeId: string;
  /** Human-readable hostname */
  hostname: string;
  /** Architecture (x64, arm64, riscv64) */
  arch: string;
  /** Platform (linux, darwin) */
  platform: string;
  /** Total memory in MB */
  totalMemoryMb: number;
  /** Available CPU cores */
  cpuCores: number;
  /** Whether GPU is available */
  hasGpu: boolean;
  /** Custom capability tags */
  tags: string[];
}

// ─── EdgeRuntime Class ──────────────────────────────────────────────────────

export class EdgeRuntime {
  private config: Config | null = null;
  private logger: SecureLogger | null = null;
  private auditChain: AuditChain | null = null;
  private a2aManager: A2AManager | null = null;
  private server: import('node:http').Server | null = null;
  private readonly options: EdgeRuntimeOptions;
  private startedAt: number | null = null;
  private shutdownRequested = false;

  constructor(options: EdgeRuntimeOptions = {}) {
    this.options = options;
  }

  // ── Initialization ──────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    const initStart = performance.now();

    // Step 1: Load config (edge-minimal subset)
    this.config = loadConfig(this.options.config);

    // Apply port/host overrides
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
    this.logger.info({ version: VERSION }, 'SecureYeoman Edge starting');

    // Step 3: Database (if configured — edge can run SQLite-only)
    const dbConfig = this.config.core?.database;
    if (dbConfig?.host && dbConfig?.database) {
      initPoolFromConfig(dbConfig);
      await runMigrations();
      this.logger.debug('Database initialized');
    }

    // Step 4: Audit chain (in-memory for edge — lightweight)
    const auditStorage = new InMemoryAuditStorage();
    const signingKey = getSecret('SECUREYEOMAN_SIGNING_KEY') ?? `edge-audit-${Date.now()}`;
    this.auditChain = new AuditChain({ storage: auditStorage, signingKey });
    await this.auditChain.initialize();

    // Step 5: A2A transport (the core of edge functionality)
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

    // Step 6: Start HTTP server (health + A2A endpoints only)
    await this.startServer();

    this.startedAt = Date.now();
    const elapsed = (performance.now() - initStart).toFixed(0);
    this.logger.info(
      { elapsedMs: elapsed, port: this.config.gateway.port },
      'SecureYeoman Edge ready'
    );
  }

  // ── HTTP Server (minimal) ─────────────────────────────────────────────

  private async startServer(): Promise<void> {
    const { createServer } = await import('node:http');
    const host = this.config!.gateway.host;
    const port = this.config!.gateway.port;

    this.server = createServer(async (req, res) => {
      const url = req.url ?? '/';

      // Health endpoint
      if (url === '/health' && req.method === 'GET') {
        const body = JSON.stringify({
          status: 'ok',
          mode: 'edge',
          version: VERSION,
          uptime: this.startedAt ? Date.now() - this.startedAt : 0,
          capabilities: this.getCapabilities(),
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(body);
        return;
      }

      // A2A receive endpoint
      if (url === '/api/v1/a2a/receive' && req.method === 'POST') {
        await this.handleA2AReceive(req, res);
        return;
      }

      // A2A capabilities endpoint
      if (url === '/api/v1/a2a/capabilities' && req.method === 'GET') {
        const body = JSON.stringify({ capabilities: this.getCapabilities() });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(body);
        return;
      }

      // 404 for everything else
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

  // ── A2A Message Handler ───────────────────────────────────────────────

  private async handleA2AReceive(
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse
  ): Promise<void> {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

      if (!this.a2aManager) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'A2A not initialized' }));
        return;
      }

      // Log the incoming A2A message — actual delegation handling is wired
      // through the A2AManager's transport layer. For now, acknowledge receipt.
      this.logger?.debug({ type: body.type, from: body.fromPeerId }, 'A2A message received');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, received: body.type }));
    } catch (err) {
      this.logger?.error({ err }, 'A2A receive error');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Bad request' }));
    }
  }

  // ── Registration ──────────────────────────────────────────────────────

  /**
   * Register this edge node with a parent SecureYeoman instance.
   * Sends capabilities and receives peer identity.
   */
  async registerWithParent(parentUrl: string, token?: string): Promise<{ peerId: string }> {
    const capabilities = this.getCapabilities();
    const port = this.config?.gateway.port ?? 18789;
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
        mode: 'edge',
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

  // ── Capabilities ──────────────────────────────────────────────────────

  getCapabilities(): EdgeCapabilities {
    const os = require('node:os') as typeof import('node:os');
    return {
      nodeId: this.getNodeId(),
      hostname: os.hostname(),
      arch: os.arch(),
      platform: os.platform(),
      totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
      cpuCores: os.cpus().length,
      hasGpu: this.detectGpu(),
      tags: this.getCapabilityTags(),
    };
  }

  private getNodeId(): string {
    // Stable node ID from hostname + MAC address
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
    // Check for NVIDIA GPU
    if (existsSync('/dev/nvidia0')) return true;
    // Check for AMD GPU via DRI
    if (existsSync('/dev/dri/renderD128')) return true;
    return false;
  }

  private getCapabilityTags(): string[] {
    const tags: string[] = [];
    const os = require('node:os') as typeof import('node:os');

    if (os.arch() === 'arm64') tags.push('arm64');
    if (os.arch() === 'x64') tags.push('x64');
    if (this.detectGpu()) tags.push('gpu');
    if (os.totalmem() > 4 * 1024 * 1024 * 1024) tags.push('high-memory');
    if (os.cpus().length >= 4) tags.push('multi-core');

    // Check for custom tags in env
    const customTags = process.env.SECUREYEOMAN_EDGE_TAGS;
    if (customTags) {
      tags.push(...customTags.split(',').map((t) => t.trim()));
    }

    return tags;
  }

  // ── Shutdown ──────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    if (this.shutdownRequested) return;
    this.shutdownRequested = true;

    this.logger?.info('SecureYeoman Edge shutting down');

    // Stop A2A heartbeats
    if (this.a2aManager) {
      await this.a2aManager.cleanup();
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

    this.logger?.info('SecureYeoman Edge shutdown complete');
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

export async function createEdgeRuntime(options?: EdgeRuntimeOptions): Promise<EdgeRuntime> {
  const runtime = new EdgeRuntime(options);
  await runtime.initialize();
  return runtime;
}
