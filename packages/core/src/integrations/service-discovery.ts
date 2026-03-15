/**
 * ServiceDiscoveryManager — connection-driven lifecycle for ecosystem services.
 *
 * Instead of auto-generating API keys at startup, keys are generated on-demand
 * when a user enables an integration via the dashboard. The flow:
 *   1. User enables service toggle -> probe() checks health endpoint
 *   2. If reachable -> enable() generates keys, stores in SecretsManager
 *   3. If not reachable -> returns error status, no keys generated
 *   4. User disables -> disable() clears keys from SecretsManager
 */

import { randomBytes } from 'node:crypto';
import type { SecretsManager } from '../security/secrets-manager.js';
import type { SecureLogger } from '../logging/logger.js';
import { getSecret } from '../config/loader.js';
import { errorToString } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EcosystemServiceId =
  | 'agnostic'
  | 'agnos'
  | 'synapse'
  | 'delta'
  | 'bullshift'
  | 'photisnadi'
  | 'aequi'
  | 'shruti'
  | 'rasa'
  | 'mneme'
  | 'edge';

export type EcosystemServiceStatus =
  | 'disconnected' // never connected
  | 'connected' // fully operational
  | 'unreachable' // health check failed
  | 'error'; // provisioning failed

export interface EcosystemServiceInfo {
  id: EcosystemServiceId;
  displayName: string;
  description: string;
  url: string;
  healthUrl: string;
  status: EcosystemServiceStatus;
  enabled: boolean;
  lastProbeAt: number | null;
  lastProbeLatencyMs: number | null;
  error: string | null;
  requiredSecrets: string[];
  secretsProvisioned: boolean;
}

// ---------------------------------------------------------------------------
// Service registry (static definitions)
// ---------------------------------------------------------------------------

interface ServiceDefinition {
  id: EcosystemServiceId;
  displayName: string;
  description: string;
  urlEnv: string;
  defaultUrl: string;
  healthPath: string;
  requiredSecrets: string[];
  mcpConfigKey: string;
}

const SERVICE_REGISTRY: readonly ServiceDefinition[] = [
  {
    id: 'agnostic',
    displayName: 'Agnostic Agentic System',
    description:
      'Multi-agent orchestration platform — autonomous task execution, code generation, research, security auditing, and custom agent workflows',
    urlEnv: 'AGNOSTIC_URL',
    defaultUrl: 'http://127.0.0.1:8000',
    healthPath: '/health',
    requiredSecrets: ['AGNOSTIC_API_KEY', 'AGNOSTIC_WEBHOOK_SECRET'],
    mcpConfigKey: 'exposeAgnosticTools',
  },
  {
    id: 'agnos',
    displayName: 'AGNOS Runtime',
    description: 'Agent runtime with LLM gateway and policy enforcement',
    urlEnv: 'AGNOS_RUNTIME_URL',
    defaultUrl: 'http://127.0.0.1:8090',
    healthPath: '/v1/health',
    requiredSecrets: ['AGNOS_GATEWAY_API_KEY', 'AGNOS_RUNTIME_API_KEY'],
    mcpConfigKey: 'exposeAgnosTools',
  },
  {
    id: 'synapse',
    displayName: 'Synapse LLM Controller',
    description: 'Local LLM model management, inference, and training job orchestration',
    urlEnv: 'SYNAPSE_API_URL',
    defaultUrl: 'http://127.0.0.1:8420',
    healthPath: '/health',
    requiredSecrets: [],
    mcpConfigKey: 'exposeSynapseTools',
  },
  {
    id: 'delta',
    displayName: 'Delta Code Forge',
    description: 'Self-hosted git hosting, CI/CD pipelines, and artifact registry',
    urlEnv: 'DELTA_URL',
    defaultUrl: 'http://127.0.0.1:8070',
    healthPath: '/health',
    requiredSecrets: ['DELTA_API_TOKEN'],
    mcpConfigKey: 'exposeDeltaTools',
  },
  {
    id: 'bullshift',
    displayName: 'BullShift Trading',
    description: 'Algorithmic trading platform with portfolio management and market analysis',
    urlEnv: 'BULLSHIFT_API_URL',
    defaultUrl: 'http://127.0.0.1:8787',
    healthPath: '/health',
    requiredSecrets: [],
    mcpConfigKey: 'exposeBullshiftTools',
  },
  {
    id: 'photisnadi',
    displayName: 'Photisnadi',
    description: 'Kanban task management with daily rituals and focus tracking',
    urlEnv: 'PHOTISNADI_URL',
    defaultUrl: 'http://127.0.0.1:8080',
    healthPath: '/api/v1/health',
    requiredSecrets: ['PHOTISNADI_SUPABASE_URL', 'PHOTISNADI_SUPABASE_KEY'],
    mcpConfigKey: 'exposePhotisnadiTools',
  },
  {
    id: 'aequi',
    displayName: 'Aequi Accounting',
    description:
      'Self-employed accounting platform with double-entry bookkeeping and tax automation',
    urlEnv: 'AEQUI_URL',
    defaultUrl: 'http://127.0.0.1:8060',
    healthPath: '/health',
    requiredSecrets: [],
    mcpConfigKey: 'exposeAequiTools',
  },
  {
    id: 'shruti',
    displayName: 'Shruti DAW',
    description:
      'Rust-native digital audio workstation with AI-assisted music production, mixing, and analysis',
    urlEnv: 'SHRUTI_URL',
    defaultUrl: 'http://127.0.0.1:8050',
    healthPath: '/health',
    requiredSecrets: ['SHRUTI_API_KEY'],
    mcpConfigKey: 'exposeShrutiTools',
  },
  {
    id: 'rasa',
    displayName: 'Rasa Image Editor',
    description:
      'AI-native image editor with GPU-accelerated rendering, generative AI, and MCP tool integration',
    urlEnv: 'RASA_URL',
    defaultUrl: 'http://127.0.0.1:8080',
    healthPath: '/health',
    requiredSecrets: [],
    mcpConfigKey: 'exposeRasaTools',
  },
  {
    id: 'mneme',
    displayName: 'Mneme Knowledge Base',
    description:
      'AI-native personal knowledge base with semantic search, auto-linking, and RAG over personal documents',
    urlEnv: 'MNEME_URL',
    defaultUrl: 'http://127.0.0.1:3838',
    healthPath: '/health',
    requiredSecrets: [],
    mcpConfigKey: 'exposeMnemeTools',
  },
  {
    id: 'edge',
    displayName: 'Edge Fleet',
    description:
      'IoT/edge node fleet management with OTA updates, deployments, and health monitoring',
    urlEnv: 'SECUREYEOMAN_EDGE_HUB_URL',
    defaultUrl: 'http://127.0.0.1:0',
    healthPath: '/health',
    requiredSecrets: [],
    mcpConfigKey: 'exposeEdgeTools',
  },
] as const;

// ---------------------------------------------------------------------------
// Internal state per service
// ---------------------------------------------------------------------------

interface ServiceState {
  status: EcosystemServiceStatus;
  enabled: boolean;
  lastProbeAt: number | null;
  lastProbeLatencyMs: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// ServiceDiscoveryManager
// ---------------------------------------------------------------------------

export class ServiceDiscoveryManager {
  private readonly secretsManager: SecretsManager;
  private readonly logger: SecureLogger;
  private readonly state = new Map<EcosystemServiceId, ServiceState>();

  constructor(deps: { secretsManager: SecretsManager; logger: SecureLogger }) {
    this.secretsManager = deps.secretsManager;
    this.logger = deps.logger;

    // Initialize state for each registered service
    for (const def of SERVICE_REGISTRY) {
      this.state.set(def.id, {
        status: 'disconnected',
        enabled: false,
        lastProbeAt: null,
        lastProbeLatencyMs: null,
        error: null,
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  /** Returns current info for all registered ecosystem services. */
  getServices(): EcosystemServiceInfo[] {
    return SERVICE_REGISTRY.map((def) => this.buildInfo(def));
  }

  /** Returns info for a single service, or undefined if not in the registry. */
  getService(id: EcosystemServiceId): EcosystemServiceInfo | undefined {
    const def = SERVICE_REGISTRY.find((d) => d.id === id);
    if (!def) return undefined;
    return this.buildInfo(def);
  }

  /** Probe a service's health endpoint without changing enabled state. */
  async probe(id: EcosystemServiceId): Promise<EcosystemServiceInfo> {
    const def = this.requireDef(id);
    const state = this.state.get(id)!;
    const url = this.resolveUrl(def);
    const healthUrl = `${url}${def.healthPath}`;

    const start = Date.now();
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;

      state.lastProbeAt = Date.now();
      state.lastProbeLatencyMs = latency;

      if (response.ok) {
        // Only upgrade to connected if enabled; otherwise stay disconnected
        if (state.enabled) {
          state.status = 'connected';
        }
        state.error = null;
        this.logger.info({ service: id, latencyMs: latency }, 'Ecosystem service probe succeeded');
      } else {
        state.status = 'unreachable';
        state.error = `Health check returned ${String(response.status)}`;
        this.logger.warn(
          { service: id, statusCode: response.status },
          'Ecosystem service probe failed'
        );
      }
    } catch (err) {
      const latency = Date.now() - start;
      state.lastProbeAt = Date.now();
      state.lastProbeLatencyMs = latency;
      state.status = 'unreachable';
      state.error = errorToString(err);
      this.logger.warn({ service: id, error: state.error }, 'Ecosystem service probe failed');
    }

    return this.buildInfo(def);
  }

  /** Enable a service: probe, generate keys if reachable, store in SecretsManager. */
  async enable(id: EcosystemServiceId): Promise<EcosystemServiceInfo> {
    const def = this.requireDef(id);
    const state = this.state.get(id)!;

    // Probe first
    await this.probe(id);

    if (state.status === 'unreachable') {
      // Cannot enable an unreachable service
      return this.buildInfo(def);
    }

    try {
      // Generate and store keys for any secrets not already present
      for (const secretKey of def.requiredSecrets) {
        if (!getSecret(secretKey)) {
          const generated = randomBytes(32).toString('base64url');
          await this.secretsManager.set(secretKey, generated);
          this.logger.info(
            { service: id, secret: secretKey },
            'Generated integration secret on enable'
          );
        }
      }

      state.enabled = true;
      state.status = 'connected';
      state.error = null;
      this.logger.info({ service: id }, 'Ecosystem service enabled');
    } catch (err) {
      state.status = 'error';
      state.error = errorToString(err);
      this.logger.error({ service: id, error: state.error }, 'Failed to enable ecosystem service');
    }

    return this.buildInfo(def);
  }

  /** Disable a service: delete secrets from SecretsManager, set status to disconnected. */
  async disable(id: EcosystemServiceId): Promise<EcosystemServiceInfo> {
    const def = this.requireDef(id);
    const state = this.state.get(id)!;

    try {
      for (const secretKey of def.requiredSecrets) {
        await this.secretsManager.delete(secretKey);
      }
      this.logger.info({ service: id }, 'Ecosystem service disabled and secrets cleared');
    } catch (err) {
      this.logger.warn(
        { service: id, error: errorToString(err) },
        'Error clearing secrets during disable (non-fatal)'
      );
    }

    state.enabled = false;
    state.status = 'disconnected';
    state.error = null;

    return this.buildInfo(def);
  }

  // ── Internals ──────────────────────────────────────────────────────

  private requireDef(id: EcosystemServiceId): ServiceDefinition {
    const def = SERVICE_REGISTRY.find((d) => d.id === id);
    if (!def) {
      throw new Error(`Unknown ecosystem service: ${id}`);
    }
    return def;
  }

  private resolveUrl(def: ServiceDefinition): string {
    return process.env[def.urlEnv] ?? def.defaultUrl;
  }

  private buildInfo(def: ServiceDefinition): EcosystemServiceInfo {
    const state = this.state.get(def.id)!;
    const url = this.resolveUrl(def);

    // Check if all required secrets exist
    const secretsProvisioned = def.requiredSecrets.every((k) => !!getSecret(k));

    return {
      id: def.id,
      displayName: def.displayName,
      description: def.description,
      url,
      healthUrl: `${url}${def.healthPath}`,
      status: state.status,
      enabled: state.enabled,
      lastProbeAt: state.lastProbeAt,
      lastProbeLatencyMs: state.lastProbeLatencyMs,
      error: state.error,
      requiredSecrets: def.requiredSecrets,
      secretsProvisioned,
    };
  }
}
