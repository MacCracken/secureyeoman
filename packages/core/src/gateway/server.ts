/**
 * Gateway Server for SecureYeoman
 *
 * Provides REST API and WebSocket endpoints for the dashboard.
 *
 * Security considerations:
 * - Local network only by default
 * - All endpoints protected by authentication (when enabled)
 * - Rate limiting on all routes
 * - Input validation on all parameters
 */

import { readFileSync, existsSync } from 'node:fs';
import { hostname as osHostname } from 'node:os';
import { getPool } from '../storage/pg-pool.js';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyCompress from '@fastify/compress';
import fastifyMultipart from '@fastify/multipart';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { WebSocket } from 'ws';
import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import { type SecureYeoman } from '../secureyeoman.js';
import type { GatewayConfig } from '@secureyeoman/shared';
import type { AuthService } from '../security/auth.js';
import { createAuthHook, createRbacHook } from './auth-middleware.js';
import { registerAuthRoutes } from './auth-routes.js';
import { registerOAuthRoutes, OAuthService } from './oauth-routes.js';
import { OAuthTokenStorage } from './oauth-token-storage.js';
import { OAuthTokenService } from './oauth-token-service.js';
import { registerSoulRoutes } from '../soul/soul-routes.js';
import { registerStrategyRoutes } from '../soul/strategy-routes.js';
import { registerBrainRoutes } from '../brain/brain-routes.js';
import { registerAuditRoutes } from '../brain/audit/audit-routes.js';
import { registerDocumentRoutes } from '../brain/document-routes.js';
import { registerSpiritRoutes } from '../spirit/spirit-routes.js';
import { registerCommsRoutes } from '../comms/comms-routes.js';
import { registerIntegrationRoutes } from '../integrations/integration-routes.js';
import { WebhookTransformStorage } from '../integrations/webhook-transform-storage.js';
import { OutboundWebhookStorage } from '../integrations/outbound-webhook-storage.js';
import { OutboundWebhookDispatcher } from '../integrations/outbound-webhook-dispatcher.js';
import { registerChatRoutes } from '../ai/chat-routes.js';
import { registerModelRoutes } from '../ai/model-routes.js';
import { _clearDynamicCache as clearModelCache } from '../ai/cost-calculator.js';
import { uuidv7, sha256 } from '../utils/crypto.js';
import { runWithCorrelationId } from '../utils/correlation-context.js';
import { Task, TaskType, TaskStatus } from '@secureyeoman/shared';
import { registerMcpRoutes } from '../mcp/mcp-routes.js';
import { McpCredentialManager } from '../mcp/credential-manager.js';
import { requireSecret } from '../config/loader.js';
import { registerReportRoutes } from '../reporting/report-routes.js';
import { registerDashboardRoutes } from '../dashboard/dashboard-routes.js';
import { registerWorkspaceRoutes } from '../workspace/workspace-routes.js';
import { registerSsoRoutes } from './sso-routes.js';
import { registerExperimentRoutes } from '../experiment/experiment-routes.js';
import { registerMarketplaceRoutes } from '../marketplace/marketplace-routes.js';
import { registerTerminalRoutes } from './terminal-routes.js';
import { registerWorktreeRoutes } from './worktree-routes.js';
import { registerConversationRoutes } from '../chat/conversation-routes.js';
import { registerBranchingRoutes } from '../chat/branching-routes.js';
import { registerAgentRoutes } from '../agents/agent-routes.js';
import { registerSwarmRoutes } from '../agents/swarm-routes.js';
import { registerProfileSkillsRoutes } from '../agents/profile-skills-routes.js';
import { registerTeamRoutes } from '../agents/team-routes.js';
import { registerCouncilRoutes } from '../agents/council-routes.js';
import { registerWorkflowRoutes } from '../workflow/workflow-routes.js';
import { registerExtensionRoutes } from '../extensions/extension-routes.js';
import { registerExecutionRoutes } from '../execution/execution-routes.js';
import { registerA2ARoutes } from '../a2a/a2a-routes.js';
import { registerProactiveRoutes } from '../proactive/proactive-routes.js';
import { registerDiagnosticRoutes } from '../diagnostics/diagnostic-routes.js';
import { registerMultimodalRoutes } from '../multimodal/multimodal-routes.js';
import { registerDesktopRoutes } from '../body/desktop-routes.js';
import { registerCaptureConsentRoutes } from '../body/capture-consent-routes.js';
import { registerBrowserRoutes } from '../browser/browser-routes.js';
import { registerGroupChatRoutes } from '../integrations/group-chat-routes.js';
import { registerRoutingRulesRoutes } from '../integrations/routing-rules-routes.js';
import { registerIntentRoutes } from '../intent/routes.js';
import { registerAutonomyRoutes } from '../security/autonomy-routes.js';
import { registerNotificationRoutes } from '../notifications/notification-routes.js';
import { registerUserNotificationPrefsRoutes } from '../notifications/user-notification-prefs-routes.js';
import { registerRiskAssessmentRoutes } from '../risk-assessment/risk-assessment-routes.js';
import { registerDepartmentRiskRoutes } from '../risk-assessment/department-risk-routes.js';
import { registerProviderAccountRoutes } from '../ai/provider-account-routes.js';
import { registerAthiRoutes } from '../security/athi-routes.js';
import { registerSraRoutes } from '../security/sra-routes.js';
import { registerConstitutionalRoutes } from '../security/constitutional-routes.js';
import { registerTeeRoutes } from '../security/tee-routes.js';
import { TeeAttestationVerifier } from '../security/tee-attestation.js';
import { registerAuditExportRoutes } from '../logging/audit-export-routes.js';
import { SQLiteAuditStorage } from '../logging/sqlite-storage.js';
import { registerBackupRoutes } from '../backup/backup-routes.js';
import { registerTenantRoutes } from '../tenants/tenant-routes.js';
import { registerTrainingRoutes } from '../training/training-routes.js';
import { registerResponsibleAiRoutes } from '../training/responsible-ai-routes.js';
import { registerBatchInferenceRoutes } from '../ai/batch-inference-routes.js';
import { registerContinualLearningRoutes } from '../training/continual-learning-routes.js';
import { registerLicenseRoutes } from '../licensing/license-routes.js';
import { registerFederationRoutes } from '../federation/federation-routes.js';
import { registerGatewayRoutes } from './gateway-routes.js';
import { registerGmailRoutes } from '../integrations/gmail/gmail-routes.js';
import { registerTwitterRoutes } from '../integrations/twitter/twitter-routes.js';
import { registerGithubApiRoutes } from '../integrations/github/github-api-routes.js';
import { CollabManager } from '../soul/collab.js';
import { SoulStorage } from '../soul/storage.js';
import { formatPrometheusMetrics } from './prometheus.js';
import { sendError } from '../utils/errors.js';
import { VERSION } from '../version.js';
import { otelFastifyPlugin } from '../telemetry/otel-fastify-plugin.js';
import { registerAlertRoutes } from '../telemetry/alert-routes.js';
import { registerCicdWebhookRoutes } from '../integrations/cicd/cicd-webhook-routes.js';
import { registerAnalyticsRoutes } from '../analytics/analytics-routes.js';
import { registerScanningRoutes } from '../sandbox/scanning/scanning-routes.js';
import { parsePagination } from '../utils/pagination.js';

/**
 * Check if an IP address belongs to a private/loopback range.
 * Covers 127.0.0.0/8, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.
 */
function isPrivateIP(ip: string): boolean {
  // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:172.20.0.3 → 172.20.0.3)
  const addr = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  if (addr === '127.0.0.1' || addr === '::1' || addr === 'localhost') return true;
  if (addr.startsWith('10.') || addr.startsWith('192.168.')) return true;

  // 172.16.0.0/12 → second octet 16–31
  if (addr.startsWith('172.')) {
    const secondOctet = Number(addr.split('.')[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  return false;
}

interface WebSocketClient {
  ws: WebSocket;
  channels: Set<string>;
  userId?: string;
  role?: string;
  lastPong: number;
}

/** Channel → minimum required RBAC resource:action for WebSocket subscriptions */
const CHANNEL_PERMISSIONS: Record<string, { resource: string; action: string }> = {
  metrics: { resource: 'metrics', action: 'read' },
  audit: { resource: 'audit', action: 'read' },
  tasks: { resource: 'tasks', action: 'read' },
  security: { resource: 'security_events', action: 'read' },
  proactive: { resource: 'proactive', action: 'read' },
  workflows: { resource: 'workflows', action: 'read' },
  soul: { resource: 'soul', action: 'read' },
  group_chat: { resource: 'integrations', action: 'read' },
  notifications: { resource: 'notifications', action: 'read' },
};

export interface GatewayServerOptions {
  config: GatewayConfig;
  secureYeoman: SecureYeoman;
  authService?: AuthService;
  /** Path to the pre-built dashboard dist directory for SPA serving. */
  dashboardDist?: string;
}

export class GatewayServer {
  private readonly config: GatewayConfig;
  private readonly secureYeoman: SecureYeoman;
  private readonly authService: AuthService | undefined;
  private readonly dashboardDist: string | undefined;
  private readonly app: FastifyInstance;
  private readonly clients = new Map<string, WebSocketClient>();
  private readonly collabManager: CollabManager;
  private logger: SecureLogger | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastMetricsJson: string | null = null;

  /**
   * Register an optional route module. Swallows errors when the manager
   * is unavailable, logging at debug level instead of silently dropping.
   */
  private tryRegister(name: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.getLogger().debug(`${name} routes skipped`, {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  constructor(options: GatewayServerOptions) {
    this.config = options.config;
    this.secureYeoman = options.secureYeoman;
    this.authService = options.authService;
    this.dashboardDist = options.dashboardDist;
    this.collabManager = new CollabManager(new SoulStorage());

    // Build HTTPS options when TLS is enabled
    const httpsOpts = this.config.tls.enabled
      ? (() => {
          const certPath = this.config.tls.certPath;
          const keyPath = this.config.tls.keyPath;
          if (!certPath || !keyPath) {
            throw new Error('TLS enabled but certPath/keyPath not configured');
          }
          const opts: Record<string, unknown> = {
            cert: readFileSync(certPath),
            key: readFileSync(keyPath),
          };
          // When a CA path is provided, enable mTLS (client cert verification)
          if (this.config.tls.caPath) {
            opts.ca = readFileSync(this.config.tls.caPath);
            opts.requestCert = true;
            opts.rejectUnauthorized = true;
          }
          return opts;
        })()
      : undefined;

    // Create Fastify instance
    this.app = Fastify({
      logger: false, // We use our own logger
      trustProxy: false, // Security: don't trust proxy headers
      bodyLimit: 1_048_576, // 1 MB max request body
      ...(httpsOpts ? { https: httpsOpts } : {}),
    });

    // Middleware and routes are set up in start()
  }

  /**
   * Initialize the server (register plugins, set up middleware)
   */
  private async init(): Promise<void> {
    await this.setupMiddleware();
    this.setupRoutes();
  }

  private getLogger(): SecureLogger {
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'Gateway' });
      } catch {
        return createNoopLogger();
      }
    }
    return this.logger;
  }

  private async setupMiddleware(): Promise<void> {
    // Register OpenTelemetry tracing plugin (spans + X-Trace-Id header)
    await this.app.register(otelFastifyPlugin);

    // Register compression plugin (gzip/brotli for JSON + text responses)
    await this.app.register(fastifyCompress);

    // Register multipart plugin for avatar uploads (max 2 MB per file)
    await this.app.register(fastifyMultipart, {
      limits: { fileSize: 2 * 1024 * 1024 },
    });

    // Register WebSocket plugin
    await this.app.register(fastifyWebsocket, {
      options: {
        maxPayload: 1048576, // 1MB max message size
      },
    });

    // Local network check middleware
    this.app.addHook('onRequest', async (request, reply) => {
      // Skip check entirely when remote access is explicitly allowed (e.g. enterprise TLS deployment)
      if (this.config.allowRemoteAccess) return;

      const ip = request.ip;

      // Allow localhost and private network ranges (RFC 1918 + loopback)
      const isLocalNetwork = isPrivateIP(ip);

      if (!isLocalNetwork) {
        this.getLogger().warn('Access denied from non-local IP', { ip });
        return sendError(reply, 403, 'Dashboard is only accessible from local network');
      }
    });

    // Correlation ID — attach a UUIDv7 to every request and thread it via AsyncLocalStorage
    this.app.decorateRequest('correlationId', '');
    this.app.addHook('onRequest', function (req, reply, done) {
      const id = (req.headers['x-correlation-id'] as string) || uuidv7();
      (req as any).correlationId = id;
      reply.header('X-Correlation-ID', id);
      runWithCorrelationId(id, done);
    });

    // Security headers
    this.app.addHook('onRequest', async (_request, reply) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      // X-XSS-Protection: 0 intentionally disables the legacy browser XSS auditor.
      // Modern browsers no longer use it, and enabling it can introduce new vulnerabilities.
      // CSP (below) is the correct defence against XSS.
      reply.header('X-XSS-Protection', '0');
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

      // Content-Security-Policy — defence-in-depth against XSS.
      // SECURITY(121): Replace with nonce-based CSP when Vite build supports it
      // 'unsafe-inline' is required for Vite-built React (inline event handlers and styles).
      // script-src 'self' still prevents loading external scripts from untrusted origins.
      // connect-src includes ws:/wss: for WebSocket subscriptions.
      reply.header(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self' ws: wss:",
          "media-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join('; ')
      );

      if (this.config.tls.enabled) {
        // 2-year max-age + preload eligibility
        reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
      }
    });

    // CORS for local development
    this.app.addHook('onRequest', async (request, reply) => {
      const origin = request.headers.origin;

      if (origin && this.config.cors.enabled) {
        const allowedOrigins = this.config.cors.origins;

        if (allowedOrigins.includes('*')) {
          reply.header('Access-Control-Allow-Origin', '*');
          // Do NOT set Allow-Credentials with wildcard origin
        } else if (allowedOrigins.includes(origin)) {
          reply.header('Access-Control-Allow-Origin', origin);
          reply.header('Access-Control-Allow-Credentials', 'true');
          reply.header('Vary', 'Origin');
        }

        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
        }
      }

      if (request.method === 'OPTIONS') {
        return reply.code(204).send();
      }
    });

    // ── CSRF guard ────────────────────────────────────────────────────────────
    // This API is stateless and uses HTTP Bearer tokens (Authorization header)
    // and X-API-Key exclusively. No Set-Cookie headers are emitted anywhere in
    // the authentication flow, so CSRF is architecturally not applicable.
    // See ADR 115 for the full analysis.
    //
    // ⚠️  IF YOU ADD COOKIES (e.g. for SSO refresh, remember-me, or session
    //     management), you MUST also add CSRF protection BEFORE shipping:
    //       1. SameSite=Strict (or SameSite=Lax) on every session cookie.
    //       2. @fastify/csrf-protection with a synchronizer token for all
    //          state-changing endpoints (POST, PUT, DELETE, PATCH).
    //     Failure to do so will reintroduce the CSRF attack surface that the
    //     Bearer-token model eliminates.
    // ─────────────────────────────────────────────────────────────────────────

    // Global rate limiting hook — enforce per-IP limits on all API routes
    {
      const rateLimiter = this.secureYeoman.getRateLimiter();
      if (rateLimiter && 'createFastifyHook' in rateLimiter) {
        this.app.addHook(
          'onRequest',
          (
            rateLimiter as import('../security/rate-limiter.js').RateLimiter
          ).createFastifyHook() as any
        );
      }
    }

    // Auth + RBAC hooks (after CORS, before routes)
    if (this.authService) {
      const logger = this.getLogger();
      this.app.addHook(
        'onRequest',
        createAuthHook({ authService: this.authService, logger, rbac: this.secureYeoman.getRBAC() })
      );
      this.app.addHook(
        'onRequest',
        createRbacHook({
          rbac: this.secureYeoman.getRBAC(),
          auditChain: this.secureYeoman.getAuditChain(),
          logger,
        })
      );
    }

    // Request logging
    this.app.addHook('onResponse', async (request, reply) => {
      this.getLogger().debug('Request completed', {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      });
    });
  }

  private setupRoutes(): void {
    // Global error handler — catches body-parse failures, unhandled throws, etc.
    this.app.setErrorHandler((err, _request, reply) => {
      const statusCode = (err as any).statusCode ?? 500;
      const message = statusCode < 500 ? (err as Error).message : 'An unexpected error occurred';
      sendError(reply, statusCode, message);
    });

    // Auth routes
    if (this.authService) {
      registerAuthRoutes(this.app, {
        authService: this.authService,
        rateLimiter: this.secureYeoman.getRateLimiter(),
        rbac: this.secureYeoman.getRBAC(),
      });
    }

    // SSO routes
    try {
      const ssoManager = this.secureYeoman.getSsoManager();
      const ssoStorage = this.secureYeoman.getSsoStorage();
      if (ssoManager && ssoStorage) {
        const scheme = this.config.tls.enabled ? 'https' : 'http';
        const host = this.config.host === '0.0.0.0' ? 'localhost' : this.config.host;
        const dashboardUrl = `${scheme}://${host}:${this.config.port}`;
        registerSsoRoutes(this.app, {
          ssoManager,
          ssoStorage,
          dashboardUrl,
          secureYeoman: this.secureYeoman,
        });
      }
    } catch {
      // SSO manager may not be available — skip routes
    }

    // OAuth routes
    if (this.authService) {
      const oauthService = new OAuthService();
      const scheme = this.config.tls.enabled ? 'https' : 'http';
      const defaultBaseUrl = `${scheme}://${this.config.host === '0.0.0.0' ? 'localhost' : this.config.host}:${this.config.port}`;
      const baseUrl = this.config.externalUrl || defaultBaseUrl;
      // publicUrl = the origin registered in OAuth app consoles; may differ from baseUrl in dev
      // (e.g. Vite proxy at port 3000 vs core API at port 18789).
      const oauthPublicUrl = this.config.oauthRedirectBaseUrl || undefined;

      // Unified OAuth token service — persists Google tokens across restarts
      const oauthTokenStorage = new OAuthTokenStorage();
      const googleClientId =
        process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GMAIL_OAUTH_CLIENT_ID;
      const googleClientSecret =
        process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.GMAIL_OAUTH_CLIENT_SECRET;
      const githubClientId = process.env.GITHUB_OAUTH_CLIENT_ID;
      const githubClientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
      const oauthTokenService = new OAuthTokenService({
        storage: oauthTokenStorage,
        logger: this.logger ?? createNoopLogger(),
        googleCredentials:
          googleClientId && googleClientSecret
            ? { clientId: googleClientId, clientSecret: googleClientSecret }
            : undefined,
        githubCredentials:
          githubClientId && githubClientSecret
            ? { clientId: githubClientId, clientSecret: githubClientSecret }
            : undefined,
      });

      registerOAuthRoutes(this.app, {
        authService: this.authService,
        oauthService,
        baseUrl,
        publicUrl: oauthPublicUrl,
        oauthTokenService,
      });

      // Wire token service to integration manager so adapters can use it
      try {
        const integrationManager = this.secureYeoman.getIntegrationManager();
        integrationManager.setOAuthTokenService(oauthTokenService);
      } catch {
        // Integration manager may not be available — skip wiring
      }

      // Gmail API proxy routes — uses stored OAuth tokens; respects personality integrationAccess mode
      try {
        let gmailSoulManager;
        try {
          gmailSoulManager = this.secureYeoman.getSoulManager();
        } catch {
          /* optional */
        }
        registerGmailRoutes(this.app, { oauthTokenService, soulManager: gmailSoulManager });
      } catch {
        // Gmail routes are optional — skip on error
      }

      // GitHub API proxy routes — uses stored OAuth tokens; respects personality integrationAccess mode
      try {
        let githubSoulManager;
        try {
          githubSoulManager = this.secureYeoman.getSoulManager();
        } catch {
          /* optional */
        }
        registerGithubApiRoutes(this.app, { oauthTokenService, soulManager: githubSoulManager });
      } catch {
        // GitHub routes are optional — skip on error
      }
    }

    // Soul routes
    try {
      const soulManager = this.secureYeoman.getSoulManager();
      let approvalManager;
      try {
        approvalManager = this.secureYeoman.getApprovalManager();
      } catch {
        /* optional */
      }
      let soulValidator;
      try {
        soulValidator = this.secureYeoman.getValidator();
      } catch {
        /* optional */
      }
      let soulAuditChain;
      try {
        soulAuditChain = this.secureYeoman.getAuditChain();
      } catch {
        /* optional */
      }
      let soulDataDir: string | undefined;
      try {
        soulDataDir = this.secureYeoman.getDataDir();
      } catch {
        /* optional */
      }
      registerSoulRoutes(this.app, {
        soulManager,
        approvalManager,
        broadcast: (payload) => {
          this.broadcast('soul', payload);
        },
        heartbeatManager: this.secureYeoman.getHeartbeatManager(),
        validator: soulValidator,
        auditChain: soulAuditChain,
        dataDir: soulDataDir,
        personalityVersionManager: this.secureYeoman.getPersonalityVersionManager(),
      });
    } catch {
      // Soul manager may not be available — skip routes
    }

    // Strategy routes (Phase 107-A)
    try {
      const strategyStorage = this.secureYeoman.getStrategyStorage();
      let strategyValidator;
      try {
        strategyValidator = this.secureYeoman.getValidator();
      } catch {
        /* optional */
      }
      let strategyAuditChain;
      try {
        strategyAuditChain = this.secureYeoman.getAuditChain();
      } catch {
        /* optional */
      }
      registerStrategyRoutes(this.app, {
        strategyStorage,
        validator: strategyValidator,
        auditChain: strategyAuditChain,
      });
    } catch {
      // Strategy storage may not be available — skip routes
    }

    // Spirit routes
    try {
      const spiritManager = this.secureYeoman.getSpiritManager();
      registerSpiritRoutes(this.app, { spiritManager });
    } catch {
      // Spirit manager may not be available — skip routes
    }

    // Brain routes
    try {
      const brainManager = this.secureYeoman.getBrainManager();
      const heartbeatManager = this.secureYeoman.getHeartbeatManager() ?? undefined;
      const externalSync = this.secureYeoman.getExternalBrainSync() ?? undefined;
      let soulManager;
      try {
        soulManager = this.secureYeoman.getSoulManager();
      } catch {
        /* may not be available */
      }
      const heartbeatLogStorage = this.secureYeoman.getHeartbeatLogStorage() ?? undefined;
      registerBrainRoutes(this.app, {
        brainManager,
        heartbeatManager,
        heartbeatLogStorage,
        externalSync,
        soulManager,
        cognitiveMemoryManager: this.secureYeoman.getCognitiveMemoryManager() ?? undefined,
        cognitiveStorage: this.secureYeoman.getCognitiveMemoryStorage() ?? undefined,
      });

      try {
        const documentManager = this.secureYeoman.getDocumentManager();
        const brainStorage = this.secureYeoman.getBrainStorage() ?? undefined;
        registerDocumentRoutes(this.app, {
          documentManager,
          brainManager,
          brainStorage,
          broadcast: (channel, payload) => this.broadcast(channel, payload),
        });
      } catch {
        // Document manager may not be available — skip routes
      }

      // Memory Audit routes (Phase 118)
      const auditScheduler = this.secureYeoman.getMemoryAuditScheduler();
      if (auditScheduler) {
        const auditStorage = this.secureYeoman.getMemoryAuditStorage();
        if (auditStorage) {
          registerAuditRoutes(this.app, { auditScheduler, auditStorage });
        }
      }
    } catch {
      // Brain manager may not be available — skip routes
    }

    // Comms routes
    this.tryRegister('Comms', () => {
      const agentComms = this.secureYeoman.getAgentComms();
      if (agentComms) registerCommsRoutes(this.app, { agentComms });
    });

    // Integration routes
    try {
      const integrationManager = this.secureYeoman.getIntegrationManager();
      const integrationStorage = this.secureYeoman.getIntegrationStorage();
      const webhookTransformStorage = new WebhookTransformStorage();
      const outboundWebhookStorage = new OutboundWebhookStorage();
      const outboundDispatcher = new OutboundWebhookDispatcher(
        outboundWebhookStorage,
        this.getLogger().child({ component: 'outbound-webhook-dispatcher' })
      );
      integrationManager.setOutboundWebhookDispatcher(outboundDispatcher);
      // Wire dispatcher into message router if it exposes the setter
      const messageRouter = this.secureYeoman.getMessageRouter?.();
      messageRouter?.setOutboundWebhookDispatcher?.(outboundDispatcher);
      registerIntegrationRoutes(this.app, {
        integrationManager,
        integrationStorage,
        webhookTransformStorage,
        outboundWebhookStorage,
      });
    } catch {
      // Integration manager may not be available — skip routes
    }

    // Twitter API proxy routes — uses stored integration credentials; respects personality integrationAccess mode
    try {
      const twitterIntegrationManager = this.secureYeoman.getIntegrationManager();
      let twitterSoulManager;
      try {
        twitterSoulManager = this.secureYeoman.getSoulManager();
      } catch {
        /* optional */
      }
      registerTwitterRoutes(this.app, {
        integrationManager: twitterIntegrationManager,
        soulManager: twitterSoulManager,
      });
    } catch {
      // Twitter routes are optional — skip on error
    }

    // Diagnostic routes (Phase 39 — Channel B: sub-agent reporting + integration ping)
    try {
      const soulManager = this.secureYeoman.getSoulManager();
      const integrationManager = this.secureYeoman.getIntegrationManager();
      const mcpClientManager = this.secureYeoman.getMcpClientManager() ?? undefined;
      registerDiagnosticRoutes(this.app, { soulManager, integrationManager, mcpClientManager });
    } catch {
      // Optional — skip if managers unavailable
    }

    // Chat routes
    registerChatRoutes(this.app, { secureYeoman: this.secureYeoman });

    // Model info + switch routes
    registerModelRoutes(this.app, { secureYeoman: this.secureYeoman });

    // MCP routes
    try {
      const mcpStorage = this.secureYeoman.getMcpStorage();
      const mcpClient = this.secureYeoman.getMcpClientManager();
      const mcpServer = this.secureYeoman.getMcpServer();
      if (mcpStorage && mcpClient && mcpServer) {
        const tokenSecret = requireSecret(this.config.auth.tokenSecret);
        const credentialManager = new McpCredentialManager(
          mcpStorage,
          this.getLogger(),
          tokenSecret
        );
        registerMcpRoutes(this.app, {
          mcpStorage,
          mcpClient,
          mcpServer,
          credentialManager,
          getNetBoxWriteAllowed: () =>
            this.secureYeoman.getConfig().security.allowNetBoxWrite ?? false,
        });
        this.getLogger().info('MCP routes registered');
      } else {
        this.getLogger().warn('MCP routes skipped — MCP system not initialized');
      }
    } catch (err) {
      this.getLogger().error('MCP routes failed to register', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Report routes
    this.tryRegister('Report', () => {
      const reportGenerator = this.secureYeoman.getReportGenerator();
      if (reportGenerator) registerReportRoutes(this.app, { reportGenerator });
    });

    // Dashboard routes
    this.tryRegister('Dashboard', () => {
      const dashboardManager = this.secureYeoman.getDashboardManager();
      if (dashboardManager) registerDashboardRoutes(this.app, { dashboardManager });
    });

    // Workspace routes
    this.tryRegister('Workspace', () => {
      const workspaceManager = this.secureYeoman.getWorkspaceManager();
      if (workspaceManager && this.authService) {
        registerWorkspaceRoutes(this.app, { workspaceManager, authService: this.authService });
      }
    });

    // Experiment routes
    this.tryRegister('Experiment', () => {
      const experimentManager = this.secureYeoman.getExperimentManager();
      if (experimentManager) registerExperimentRoutes(this.app, { experimentManager });
    });

    // Marketplace routes
    this.tryRegister('Marketplace', () => {
      const marketplaceManager = this.secureYeoman.getMarketplaceManager();
      if (marketplaceManager) {
        registerMarketplaceRoutes(this.app, {
          marketplaceManager,
          getConfig: () => this.secureYeoman.getConfig(),
          ensureDelegationReady: () => this.secureYeoman.ensureDelegationReady(),
        });
      }
    });

    // Terminal routes (always available)
    registerTerminalRoutes(this.app);
    registerWorktreeRoutes(this.app);

    // Conversation routes
    this.tryRegister('Conversation', () => {
      const conversationStorage = this.secureYeoman.getConversationStorage();
      if (conversationStorage) registerConversationRoutes(this.app, { conversationStorage });
    });

    // Branching & replay routes (Phase 99)
    this.tryRegister('Branching', () => {
      const branchingManager = this.secureYeoman.getBranchingManager();
      if (branchingManager) registerBranchingRoutes(this.app, { branchingManager });
    });

    // Agent delegation routes
    this.tryRegister('Agent', () => {
      const subAgentManager = this.secureYeoman.getSubAgentManager();
      if (subAgentManager) registerAgentRoutes(this.app, { subAgentManager });
    });

    // Swarm routes
    this.tryRegister('Swarm', () => {
      const swarmManager = this.secureYeoman.getSwarmManager();
      if (swarmManager) registerSwarmRoutes(this.app, { swarmManager });
    });

    // Profile skills routes (Phase 89)
    this.tryRegister('ProfileSkills', () => {
      const swarmStorage = this.secureYeoman.getSwarmStorage();
      const subAgentStorage = this.secureYeoman.getSubAgentStorage();
      if (swarmStorage && subAgentStorage) {
        registerProfileSkillsRoutes(this.app, { swarmStorage, subAgentStorage });
      }
    });

    // Team routes
    this.tryRegister('Team', () => {
      const teamManager = this.secureYeoman.getTeamManager();
      if (teamManager) registerTeamRoutes(this.app, { teamManager });
    });

    // Council routes
    this.tryRegister('Council', () => {
      const councilManager = this.secureYeoman.getCouncilManager();
      if (councilManager) registerCouncilRoutes(this.app, { councilManager });
    });

    // Workflow routes
    try {
      const workflowManager = this.secureYeoman.getWorkflowManager();
      if (workflowManager) {
        registerWorkflowRoutes(this.app, {
          workflowManager,
          workflowVersionManager: this.secureYeoman.getWorkflowVersionManager(),
        });
        this.getLogger().info('Workflow routes registered');

        // CI/CD inbound webhook normalizer (Phase 90) — public endpoint with HMAC gate
        try {
          registerCicdWebhookRoutes(this.app, { workflowManager, secureYeoman: this.secureYeoman });
          this.getLogger().info('CI/CD webhook routes registered');
        } catch (err) {
          this.getLogger().debug('CI/CD webhook routes skipped', {
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      this.getLogger().debug('Workflow routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Intent routes (org intent documents — Phase 48)
    try {
      const intentManager = this.secureYeoman.getIntentManager();
      if (intentManager) {
        let intentAuditChain;
        try {
          intentAuditChain = this.secureYeoman.getAuditChain();
        } catch {
          /* optional */
        }
        registerIntentRoutes(this.app, { intentManager, auditChain: intentAuditChain });
        this.getLogger().info('Intent routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Intent routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Autonomy audit routes (Phase 49)
    try {
      const autonomyAuditManager = this.secureYeoman.getAutonomyAuditManager();
      if (autonomyAuditManager) {
        let autonomyAuditChain;
        try {
          autonomyAuditChain = this.secureYeoman.getAuditChain();
        } catch {
          /* optional */
        }
        registerAutonomyRoutes(this.app, {
          autonomyAuditManager,
          auditChain: autonomyAuditChain,
          getAllowWorkflows: () => this.secureYeoman.getConfig().security?.allowWorkflows ?? false,
        });
        this.getLogger().info('Autonomy audit routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Autonomy audit routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Notification routes (Phase 51 + 55)
    try {
      const notificationManager = this.secureYeoman.getNotificationManager();
      if (notificationManager) {
        // Wire the broadcast callback so server-persisted notifications reach WS clients.
        // This is done here (rather than at init) because broadcast() requires the gateway
        // to be fully constructed.
        notificationManager.setBroadcast((payload: unknown) => {
          this.broadcast('notifications', payload);
        });
        registerNotificationRoutes(this.app, { notificationManager });
        this.getLogger().info('Notification routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Notification routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // User notification prefs routes (Phase 55)
    this.tryRegister('UserNotificationPrefs', () => {
      const userNotificationPrefsStorage = this.secureYeoman.getUserNotificationPrefsStorage();
      if (userNotificationPrefsStorage) {
        registerUserNotificationPrefsRoutes(this.app, { userNotificationPrefsStorage });
      }
    });

    // Risk Assessment routes (Phase 53)
    this.tryRegister('RiskAssessment', () => {
      const riskAssessmentManager = this.secureYeoman.getRiskAssessmentManager();
      if (riskAssessmentManager) registerRiskAssessmentRoutes(this.app, { riskAssessmentManager });
    });

    // Department Risk Register routes (Phase 111)
    this.tryRegister('DepartmentRisk', () => {
      const departmentRiskManager = this.secureYeoman.getDepartmentRiskManager();
      if (departmentRiskManager) registerDepartmentRiskRoutes(this.app, { departmentRiskManager });
    });

    // Provider Account routes (Phase 112)
    this.tryRegister('ProviderAccount', () => {
      const providerAccountManager = this.secureYeoman.getProviderAccountManager();
      if (providerAccountManager) registerProviderAccountRoutes(this.app, { providerAccountManager });
    });

    // ATHI Threat Governance routes (Phase 107-F)
    this.tryRegister('ATHI', () => {
      const athiManager = this.secureYeoman.getAthiManager();
      if (athiManager) registerAthiRoutes(this.app, { athiManager });
    });

    // SRA Security Reference Architecture routes (Phase 123)
    this.tryRegister('SRA', () => {
      const sraManager = this.secureYeoman.getSraManager();
      if (sraManager) registerSraRoutes(this.app, { sraManager });
    });

    // Constitutional AI routes
    this.tryRegister('Constitutional', () => {
      registerConstitutionalRoutes(this.app, this.secureYeoman);
    });

    // TEE / Confidential Computing routes (Phase 129)
    try {
      const teeConfig = this.secureYeoman.getConfig().security?.tee;
      const teeVerifier = new TeeAttestationVerifier(
        {
          enabled: teeConfig?.enabled ?? false,
          providerLevel: teeConfig?.providerLevel ?? 'off',
          attestationStrategy: teeConfig?.attestationStrategy ?? 'none',
          attestationCacheTtlMs: teeConfig?.attestationCacheTtlMs ?? 3_600_000,
          failureAction: teeConfig?.failureAction ?? 'block',
        },
        this.getLogger(),
      );
      registerTeeRoutes(this.app, { teeVerifier });
      this.getLogger().info('TEE confidential computing routes registered');
    } catch (err) {
      this.getLogger().debug('TEE routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Extension routes
    try {
      const extensionManager = this.secureYeoman.getExtensionManager();
      if (extensionManager) {
        registerExtensionRoutes(this.app, { extensionManager });
        this.getLogger().info('Extension routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Extension routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Code execution routes
    try {
      const executionManager = this.secureYeoman.getExecutionManager();
      if (executionManager) {
        registerExecutionRoutes(this.app, { executionManager });
        this.getLogger().info('Execution routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Execution routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // A2A protocol routes
    try {
      const a2aManager = this.secureYeoman.getA2AManager();
      if (a2aManager) {
        registerA2ARoutes(this.app, { a2aManager });
        this.getLogger().info('A2A routes registered');
      }
    } catch (err) {
      this.getLogger().debug('A2A routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Proactive assistance routes
    try {
      const proactiveManager = this.secureYeoman.getProactiveManager();
      if (proactiveManager) {
        const heartbeatLogStorage = this.secureYeoman.getHeartbeatLogStorage() ?? undefined;
        registerProactiveRoutes(this.app, { proactiveManager, logStorage: heartbeatLogStorage });
        this.getLogger().info('Proactive routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Proactive routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Multimodal I/O routes
    try {
      const multimodalManager = this.secureYeoman.getMultimodalManager();
      if (multimodalManager) {
        // Security policy gate: block multimodal requests when disabled
        this.app.addHook('onRequest', async (request, reply) => {
          if (request.url.startsWith('/api/v1/multimodal/')) {
            const config = this.secureYeoman.getConfig();
            if (!config.security.allowMultimodal) {
              return sendError(
                reply,
                403,
                'Forbidden: Multimodal I/O is disabled by security policy'
              );
            }
          }
        });
        registerMultimodalRoutes(this.app, { multimodalManager });
        this.getLogger().info('Multimodal routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Multimodal routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Desktop Control routes
    try {
      registerDesktopRoutes(this.app, {
        getAllowDesktopControl: () =>
          this.secureYeoman.getConfig().security.allowDesktopControl ?? false,
        getAllowCamera: () => this.secureYeoman.getConfig().security.allowCamera ?? false,
        getAllowMultimodal: () => this.secureYeoman.getConfig().security.allowMultimodal ?? false,
        getCaptureAuditLogger: () => this.secureYeoman.getCaptureAuditLogger(),
        getTrainingBridge: () => this.secureYeoman.getDesktopTrainingBridge(),
      });
      this.getLogger().info('Desktop control routes registered');
    } catch (err) {
      this.getLogger().debug('Desktop control routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Capture Consent routes (Phase 108-D)
    try {
      registerCaptureConsentRoutes(this.app, {
        getConsentManager: () => {
          try {
            const { getConsentManager } = require('../body/consent-manager.js');
            return getConsentManager();
          } catch {
            return null;
          }
        },
      });
      this.getLogger().info('Capture consent routes registered');
    } catch (err) {
      this.getLogger().debug('Capture consent routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Browser Automation Session routes
    try {
      const browserSessionStorage = this.secureYeoman.getBrowserSessionStorage();
      if (browserSessionStorage) {
        // Security policy gate: block browser session requests when disabled
        this.app.addHook('onRequest', async (request, reply) => {
          if (request.url.startsWith('/api/v1/browser/')) {
            const currentMcpStorage = this.secureYeoman.getMcpStorage();
            const currentCfg = currentMcpStorage ? await currentMcpStorage.getConfig() : null;
            if (!currentCfg?.exposeBrowser) {
              return sendError(reply, 403, 'Forbidden: Browser automation is disabled');
            }
          }
        });
        // browserConfig is fetched at request time via the /api/v1/browser/config route
        registerBrowserRoutes(this.app, {
          browserSessionStorage,
          browserConfig: { exposeBrowser: true },
        });
        this.getLogger().info('Browser automation routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Browser automation routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Group Chat View routes
    try {
      const groupChatStorage = this.secureYeoman.getGroupChatStorage();
      const integrationManager = (() => {
        try {
          return this.secureYeoman.getIntegrationManager();
        } catch {
          return null;
        }
      })();
      if (groupChatStorage && integrationManager) {
        registerGroupChatRoutes(this.app, { groupChatStorage, integrationManager });
        this.getLogger().info('Group chat routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Group chat routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Routing Rules routes
    try {
      const routingRulesStorage = this.secureYeoman.getRoutingRulesStorage();
      const routingRulesManager = this.secureYeoman.getRoutingRulesManager();
      if (routingRulesStorage && routingRulesManager) {
        registerRoutingRulesRoutes(this.app, {
          storage: routingRulesStorage,
          manager: routingRulesManager,
        });
        this.getLogger().info('Routing rules routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Routing rules routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Audit Log Export routes (Phase 61)
    try {
      const auditStorage = this.secureYeoman.getAuditStorage();
      if (auditStorage instanceof SQLiteAuditStorage) {
        registerAuditExportRoutes(this.app, {
          auditStorage,
          hostname: osHostname(),
        });
        this.getLogger().info('Audit export routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Audit export routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Backup & DR routes (Phase 61)
    try {
      const backupManager = this.secureYeoman.getBackupManager();
      if (backupManager) {
        registerBackupRoutes(this.app, { backupManager });
        this.getLogger().info('Backup routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Backup routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Tenant Management routes (Phase 61)
    try {
      const tenantManager = this.secureYeoman.getTenantManager();
      if (tenantManager) {
        registerTenantRoutes(this.app, { tenantManager, secureYeoman: this.secureYeoman });
        this.getLogger().info('Tenant routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Tenant routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Training dataset export routes
    try {
      registerTrainingRoutes(this.app, { secureYeoman: this.secureYeoman });
      registerResponsibleAiRoutes(this.app, { secureYeoman: this.secureYeoman });
      registerBatchInferenceRoutes(this.app, { secureYeoman: this.secureYeoman });
      registerContinualLearningRoutes(this.app, { secureYeoman: this.secureYeoman });
      registerLicenseRoutes(this.app, { secureYeoman: this.secureYeoman });
      this.getLogger().info('Training routes registered');
    } catch (err) {
      this.getLogger().debug('Training routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Federation routes (Phase 79)
    try {
      const federationManager = this.secureYeoman.getFederationManager();
      if (federationManager) {
        const brainManager = (() => {
          try {
            return this.secureYeoman.getBrainManager();
          } catch {
            return undefined;
          }
        })();
        const marketplaceManager = this.secureYeoman.getMarketplaceManager() ?? undefined;
        const soulManager = (() => {
          try {
            return this.secureYeoman.getSoulManager();
          } catch {
            return undefined;
          }
        })();
        const federationStorage = (federationManager as any)
          .storage as import('../federation/federation-storage.js').FederationStorage;
        registerFederationRoutes(this.app, {
          federationManager,
          federationStorage,
          brainManager,
          marketplaceManager: marketplaceManager as any,
          soulManager: soulManager as any,
        });
        this.getLogger().info('Federation routes registered');
      }
    } catch (err) {
      this.getLogger().debug('Federation routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Gateway routes (Phase 80)
    try {
      const authStorage = this.secureYeoman.getAuthStorage();
      registerGatewayRoutes(this.app, {
        secureYeoman: this.secureYeoman,
        authStorage,
      });
      this.getLogger().info('Gateway routes registered');
    } catch (err) {
      this.getLogger().debug('Gateway routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Alert rules routes (Phase 83)
    {
      const alertManager = this.secureYeoman.getAlertManager?.();
      if (alertManager) {
        registerAlertRoutes(this.app, { alertManager, secureYeoman: this.secureYeoman });
        this.getLogger().debug('Alert routes registered');
      }
    }

    // Conversation Analytics routes (Phase 96)
    try {
      registerAnalyticsRoutes(this.app, { secureYeoman: this.secureYeoman });
      this.getLogger().debug('Analytics routes registered');
    } catch (err) {
      this.getLogger().debug('Analytics routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Sandbox Scanning routes (Phase 116)
    try {
      const scanHistoryStore = this.secureYeoman.getScanHistoryStore();
      const quarantineStorage = this.secureYeoman.getQuarantineStorage();
      const externalizationGate = this.secureYeoman.getExternalizationGate();
      const scanningPolicy = this.secureYeoman.getConfig().security?.sandboxArtifactScanning;
      let scanningAuditChain;
      try {
        scanningAuditChain = this.secureYeoman.getAuditChain();
      } catch {
        /* optional */
      }
      registerScanningRoutes(this.app, {
        scanHistoryStore,
        quarantineStorage,
        pipeline: (externalizationGate as any)?.deps?.pipeline ?? null,
        policy: scanningPolicy ?? null,
        auditChain: scanningAuditChain
          ? {
              record: async (
                event: string,
                level: string,
                message: string,
                metadata?: Record<string, unknown>
              ): Promise<void> => {
                await scanningAuditChain!.record({
                  event,
                  level: level as 'info' | 'warn' | 'error' | 'security' | 'debug' | 'trace',
                  message,
                  metadata,
                });
              },
            }
          : null,
      });
      this.getLogger().info('Sandbox scanning routes registered');
    } catch (err) {
      this.getLogger().debug('Sandbox scanning routes skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Standard Prometheus scrape endpoint /metrics (unauthenticated, public)
    this.app.get('/metrics', async (_request, reply) => {
      try {
        const metrics = await this.secureYeoman.getMetrics();
        const text = formatPrometheusMetrics(metrics);
        return reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8').send(text);
      } catch {
        return reply.code(500).send('# Error collecting metrics\n');
      }
    });

    // Prometheus metrics endpoint (legacy path — also unauthenticated)
    this.app.get('/prom/metrics', async (_request, reply) => {
      try {
        const metrics = await this.secureYeoman.getMetrics();
        const text = formatPrometheusMetrics(metrics);
        return reply.type('text/plain; version=0.0.4; charset=utf-8').send(text);
      } catch {
        return reply.code(500).send('# Error collecting metrics\n');
      }
    });

    // ── Health probes ──────────────────────────────────────────────────────────
    // Three levels following Kubernetes probe conventions:
    //   /health/live  — liveness: is the process alive? (fast, no I/O)
    //   /health/ready — readiness: can the process serve traffic? (DB ping)
    //   /health/deep  — diagnostics: full component status (for ops tooling)
    //   /health       — backward-compat alias for /health/ready

    this.app.get('/health/live', async (_request, reply) => {
      reply.code(200);
      return { status: 'ok', version: VERSION };
    });

    this.app.get('/health/ready', async (_request, reply) => {
      const state = this.secureYeoman.getState();
      const checks: Record<string, boolean> = {};

      // Database ping — actual round-trip to verify connectivity
      try {
        const pool = getPool();
        await pool.query('SELECT 1');
        checks.database = true;
      } catch (err) {
        // Skip check when pool is not initialized (e.g. unit tests)
        if (!(err instanceof Error && err.message.includes('not initialized'))) {
          checks.database = false;
        }
      }

      // Application state
      checks.application = state.healthy;

      // Audit chain — non-blocking: just check it's initialized
      try {
        const auditChain = this.secureYeoman.getAuditChain();
        checks.auditChain = !!auditChain;
      } catch {
        checks.auditChain = false;
      }

      const allHealthy = Object.values(checks).every(Boolean);
      reply.code(allHealthy ? 200 : 503);

      return {
        status: allHealthy ? 'ok' : 'degraded',
        version: VERSION,
        uptime: state.startedAt ? Date.now() - state.startedAt : 0,
        checks,
      };
    });

    this.app.get('/health/deep', async (_request, reply) => {
      const state = this.secureYeoman.getState();
      const components: Record<string, { ok: boolean; detail?: string }> = {};

      // Database — full ping with latency measurement
      try {
        const pool = getPool();
        const start = Date.now();
        await pool.query('SELECT 1');
        components.database = { ok: true, detail: `${Date.now() - start}ms` };
      } catch (err) {
        components.database = {
          ok: false,
          detail: err instanceof Error ? err.message : 'Unknown error',
        };
      }

      // Audit chain count
      try {
        const auditChain = this.secureYeoman.getAuditChain();
        components.auditChain = { ok: true, detail: 'initialized' };
        void auditChain; // satisfy no-unused
      } catch (err) {
        components.auditChain = {
          ok: false,
          detail: err instanceof Error ? err.message : 'Not available',
        };
      }

      // Auth service
      components.auth = {
        ok: !!this.authService,
        detail: this.authService ? 'active' : 'disabled',
      };

      // WebSocket clients
      components.websocket = {
        ok: true,
        detail: `${this.clients.size} client(s) connected`,
      };

      // Intent / governance manager
      try {
        const intentManager = this.secureYeoman.getIntentManager?.();
        components.intent = {
          ok: !!intentManager,
          detail: intentManager ? 'active' : 'not configured',
        };
      } catch {
        components.intent = { ok: false, detail: 'unavailable' };
      }

      const allOk = Object.values(components).every((c) => c.ok);
      reply.code(allOk ? 200 : 207); // 207 Multi-Status if partial

      return {
        status: allOk ? 'ok' : 'partial',
        version: VERSION,
        uptime: state.startedAt ? Date.now() - state.startedAt : 0,
        components,
      };
    });

    // Backward-compatible alias — same semantics as /health/ready
    this.app.get('/health', async (_request, reply) => {
      const state = this.secureYeoman.getState();
      const checks: Record<string, boolean> = {};

      try {
        const pool = getPool();
        await pool.query('SELECT 1');
        checks.database = true;
      } catch (err) {
        // Skip check when pool is not initialized (e.g. unit tests)
        if (!(err instanceof Error && err.message.includes('not initialized'))) {
          checks.database = false;
        }
      }

      checks.application = state.healthy;

      try {
        checks.auditChain = !!this.secureYeoman.getAuditChain();
      } catch {
        checks.auditChain = false;
      }

      const allHealthy = Object.values(checks).every(Boolean);
      reply.code(allHealthy ? 200 : 503);

      const isLoopback = this.config.host === '127.0.0.1' || this.config.host === 'localhost';
      const networkMode = isLoopback ? 'local' : this.config.tls.enabled ? 'public' : 'lan';

      return {
        status: allHealthy ? 'ok' : 'error',
        version: VERSION,
        uptime: state.startedAt ? Date.now() - state.startedAt : 0,
        networkMode,
        checks,
      };
    });

    // Metrics endpoint
    this.app.get('/api/v1/metrics', async () => {
      return this.secureYeoman.getMetrics();
    });

    // Personality activity heatmap — hourly per-personality request counts (Phase 83)
    this.app.get(
      '/api/v1/metrics/personality-activity',
      async (
        request: FastifyRequest<{
          Querystring: { days?: string };
        }>
      ) => {
        const usageStorage = this.secureYeoman.getUsageStorage();
        if (!usageStorage) {
          return { heatmap: [], personalities: [] };
        }

        const days = Math.min(Math.max(Number(request.query.days) || 7, 1), 30);
        const from = Date.now() - days * 86_400_000;

        const records = await usageStorage.queryHistory({
          from,
          groupBy: 'hour',
        });

        // Build heatmap: { hour → { personalityId → requests } }
        const hourMap = new Map<string, Map<string, number>>();
        const personalitySet = new Set<string>();

        for (const r of records) {
          const pid = r.personalityId ?? '_none';
          personalitySet.add(pid);
          let bucket = hourMap.get(r.date);
          if (!bucket) {
            bucket = new Map();
            hourMap.set(r.date, bucket);
          }
          bucket.set(pid, (bucket.get(pid) ?? 0) + r.calls);
        }

        const personalities = [...personalitySet].sort();
        const heatmap = [...hourMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([hour, pMap]) => ({
            hour,
            counts: Object.fromEntries(pMap),
          }));

        return { heatmap, personalities };
      }
    );

    // Cost breakdown endpoint
    this.app.get('/api/v1/costs/breakdown', async () => {
      const aiStats = this.secureYeoman.getAiUsageStats();
      return {
        byProvider: aiStats?.byProvider ?? {},
        recommendations: [],
      };
    });

    // Cost history endpoint
    this.app.get(
      '/api/v1/costs/history',
      async (
        request: FastifyRequest<{
          Querystring: {
            from?: string;
            to?: string;
            provider?: string;
            model?: string;
            personalityId?: string;
            groupBy?: string;
          };
        }>
      ) => {
        const usageStorage = this.secureYeoman.getUsageStorage();
        if (!usageStorage) {
          return {
            records: [],
            totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
          };
        }

        const q = request.query;
        const parseNum = (v?: string): number | undefined => {
          if (!v) return undefined;
          const n = Number(v);
          return Number.isNaN(n) ? undefined : n;
        };

        const records = await usageStorage.queryHistory({
          from: parseNum(q.from),
          to: parseNum(q.to),
          provider: q.provider || undefined,
          model: q.model || undefined,
          personalityId: q.personalityId || undefined,
          groupBy: q.groupBy === 'hour' ? 'hour' : 'day',
        });

        const totals = records.reduce(
          (acc, r) => {
            acc.inputTokens += r.inputTokens;
            acc.outputTokens += r.outputTokens;
            acc.totalTokens += r.totalTokens;
            acc.costUsd += r.costUsd;
            acc.calls += r.calls;
            return acc;
          },
          { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 }
        );

        return { records, totals };
      }
    );

    // Reset a usage stat counter (errors or latency) to zero
    this.app.post(
      '/api/v1/costs/reset',
      async (request: FastifyRequest<{ Body: { stat: string } }>, reply: FastifyReply) => {
        const { stat } = request.body ?? {};
        if (stat !== 'errors' && stat !== 'latency') {
          return sendError(reply, 400, 'stat must be "errors" or "latency"');
        }
        try {
          await this.secureYeoman.resetUsageStat(stat);
          return { success: true, stat };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          return sendError(reply, 500, message);
        }
      }
    );

    // Tasks endpoints
    this.app.get(
      '/api/v1/tasks',
      async (
        request: FastifyRequest<{
          Querystring: {
            status?: string;
            type?: string;
            from?: string;
            to?: string;
            limit?: string;
            offset?: string;
          };
        }>
      ) => {
        try {
          const taskStorage = this.secureYeoman.getTaskStorage();
          const q = request.query;
          const parseTimestamp = (val?: string): number | undefined => {
            if (!val) return undefined;
            const num = Number(val);
            if (!Number.isNaN(num)) return num;
            const ms = new Date(val).getTime();
            return Number.isNaN(ms) ? undefined : ms;
          };

          return taskStorage.listTasks({
            status: q.status,
            type: q.type,
            from: parseTimestamp(q.from),
            to: parseTimestamp(q.to),
            ...parsePagination(q, { defaultLimit: 50 }),
          });
        } catch {
          return { tasks: [], total: 0 };
        }
      }
    );

    this.app.get(
      '/api/v1/tasks/:id',
      async (
        request: FastifyRequest<{
          Params: { id: string };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const taskStorage = this.secureYeoman.getTaskStorage();
          const task = await taskStorage.getTask(request.params.id);
          if (!task) {
            return sendError(reply, 404, 'Task not found');
          }
          return task;
        } catch {
          return sendError(reply, 500, 'Task storage not available');
        }
      }
    );

    // Update task
    this.app.put(
      '/api/v1/tasks/:id',
      async (
        request: FastifyRequest<{
          Params: { id: string };
          Body: { name?: string; type?: string; description?: string };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const taskStorage = this.secureYeoman.getTaskStorage();
          const task = await taskStorage.getTask(request.params.id);
          if (!task) {
            return sendError(reply, 404, 'Task not found');
          }
          const { name, type, description } = request.body;
          await taskStorage.updateTaskMetadata(request.params.id, { name, type, description });
          return taskStorage.getTask(request.params.id);
        } catch {
          return sendError(reply, 500, 'Failed to update task');
        }
      }
    );

    // Delete task
    this.app.delete(
      '/api/v1/tasks/:id',
      async (
        request: FastifyRequest<{
          Params: { id: string };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const taskStorage = this.secureYeoman.getTaskStorage();
          const task = await taskStorage.getTask(request.params.id);
          if (!task) {
            return sendError(reply, 404, 'Task not found');
          }
          await taskStorage.deleteTask(request.params.id);
          return { success: true };
        } catch {
          return sendError(reply, 500, 'Failed to delete task');
        }
      }
    );

    // Create task
    this.app.post(
      '/api/v1/tasks',
      async (
        request: FastifyRequest<{
          Body: {
            type?: string;
            name: string;
            description?: string;
            input?: unknown;
            timeoutMs?: number;
            correlationId?: string;
            parentTaskId?: string;
          };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const taskStorage = this.secureYeoman.getTaskStorage();
          const taskExecutor = this.secureYeoman.getTaskExecutor();

          const {
            name,
            type = 'execute',
            description,
            input,
            timeoutMs,
            correlationId,
            parentTaskId,
          } = request.body;

          if (!name) {
            return sendError(reply, 400, 'Task name is required');
          }

          if (taskExecutor) {
            try {
              const executorTask = await taskExecutor.submit(
                {
                  type: type as TaskType,
                  name,
                  description,
                  input,
                  timeoutMs,
                  correlationId,
                  parentTaskId,
                },
                { userId: 'api', role: 'operator' }
              );
              return reply.code(201).send(executorTask);
            } catch (err) {
              this.getLogger().warn('Task execution failed', { error: String(err) });
              return sendError(reply, 500, 'Task execution failed');
            }
          }

          // No executor available: store as a pending record only
          const task: Task = {
            id: uuidv7(),
            type: type as TaskType,
            name,
            description,
            status: TaskStatus.PENDING,
            createdAt: Date.now(),
            inputHash: sha256(JSON.stringify(input ?? {})),
            securityContext: { userId: 'api', role: 'operator', permissionsUsed: [] },
            timeoutMs: timeoutMs ?? 300000,
            correlationId,
            parentTaskId,
          };
          taskStorage.storeTask(task);
          return reply.code(201).send(task);
        } catch (err) {
          this.getLogger().error('Failed to create task', { error: String(err) });
          return sendError(reply, 500, 'Failed to create task');
        }
      }
    );

    // Sandbox status
    this.app.get('/api/v1/sandbox/status', async () => {
      try {
        const sandboxManager = this.secureYeoman.getSandboxManager();
        return sandboxManager.getStatus();
      } catch {
        return {
          enabled: false,
          technology: 'none',
          capabilities: {
            landlock: false,
            seccomp: false,
            namespaces: false,
            rlimits: false,
            platform: process.platform,
          },
          sandboxType: 'NoopSandbox',
        };
      }
    });

    // Security events
    //
    // Returns security-relevant audit log entries filtered by event type.
    // Security events are a curated subset of the full audit trail, limited
    // to events that indicate authentication, authorisation, rate limiting,
    // or injection activity. This powers the SecurityEvents panel in the
    // React dashboard.
    //
    // Query parameters:
    //   severity – Comma-separated list of severity levels to include.
    //              Maps to audit entry "level" field. When omitted, all
    //              security-relevant levels are returned (warn, error,
    //              security).
    //   type     – Comma-separated list of security event type names
    //              (e.g. "auth_failure,rate_limit"). When omitted, all
    //              known security event types are included.
    //   from     – Unix timestamp (ms) lower bound (inclusive).
    //   to       – Unix timestamp (ms) upper bound (inclusive).
    //   limit    – Maximum number of events to return (default 50, max 1000).
    //   offset   – Pagination offset (default 0).
    //
    // The response shape matches the audit query result but with the key
    // renamed to "events" for semantic clarity on the client side.
    this.app.get(
      '/api/v1/security/events',
      async (
        request: FastifyRequest<{
          Querystring: {
            severity?: string;
            type?: string;
            from?: string;
            to?: string;
            limit?: string;
            offset?: string;
          };
        }>
      ) => {
        try {
          const q = request.query;

          // These are the audit event names that qualify as "security events".
          // They align with the SecurityEventType enum in @secureyeoman/shared and
          // cover authentication, authorisation, rate limiting, injection
          // detection, sandbox violations, and configuration changes.
          const SECURITY_EVENT_TYPES = [
            'auth_success',
            'auth_failure',
            'rate_limit',
            'injection_attempt',
            'permission_denied',
            'anomaly',
            'sandbox_violation',
            'config_change',
            'secret_access',
            'ai_request',
            'ai_response',
          ];

          // Allow the caller to narrow by specific event types; fall back to
          // all known security types when the parameter is omitted.
          const eventFilter = q.type
            ? q.type.split(',').filter((t) => SECURITY_EVENT_TYPES.includes(t))
            : SECURITY_EVENT_TYPES;

          // Map the optional severity query param to audit "level" values.
          // The audit chain uses levels (warn, error, security) rather than
          // the SecurityEvent severity enum, so this provides a useful filter
          // without requiring a schema change.
          const levelFilter = q.severity ? q.severity.split(',') : undefined;

          const result = await this.secureYeoman.queryAuditLog({
            event: eventFilter,
            level: levelFilter,
            from: q.from ? Number(q.from) : undefined,
            to: q.to ? Number(q.to) : undefined,
            ...parsePagination(q, { defaultLimit: 50 }),
          });

          // Return with "events" key for semantic clarity — the dashboard
          // SecurityEvents component expects this shape.
          return {
            events: result.entries,
            total: result.total,
            limit: result.limit,
            offset: result.offset,
          };
        } catch {
          // If audit storage doesn't support querying (e.g. InMemoryAuditStorage
          // not wired up), return an empty result rather than a 500 so the
          // dashboard degrades gracefully.
          return {
            events: [],
            total: 0,
            limit: 50,
            offset: 0,
          };
        }
      }
    );

    // Security policy — exposes security toggles relevant to the dashboard
    this.app.get('/api/v1/security/policy', async () => {
      const config = this.secureYeoman.getConfig();
      return {
        allowSubAgents: config.security.allowSubAgents,
        allowA2A: config.security.allowA2A,
        allowSwarms: config.security.allowSwarms,
        allowExtensions: config.security.allowExtensions,
        allowExecution: config.security.allowExecution,
        allowProactive: config.security.allowProactive,
        allowWorkflows: config.security.allowWorkflows,
        allowExperiments: config.security.allowExperiments,
        allowStorybook: config.security.allowStorybook,
        allowMultimodal: config.security.allowMultimodal,
        allowDesktopControl: config.security.allowDesktopControl,
        allowCamera: config.security.allowCamera,
        allowDynamicTools: config.security.allowDynamicTools,
        sandboxDynamicTools: config.security.sandboxDynamicTools,
        allowAnomalyDetection: config.security.allowAnomalyDetection,
        sandboxGvisor: config.security.sandboxGvisor,
        sandboxWasm: config.security.sandboxWasm,
        sandboxCredentialProxy: config.security.sandboxCredentialProxy,
        allowCommunityGitFetch: config.security.allowCommunityGitFetch,
        communityGitUrl: config.security.communityGitUrl,
        allowNetworkTools: config.security.allowNetworkTools,
        allowNetBoxWrite: config.security.allowNetBoxWrite,
        allowTwingate: config.security.allowTwingate,
        allowOrgIntent: config.security.allowOrgIntent,
        allowIntentEditor: config.security.allowIntentEditor,
        allowCodeEditor: config.security.allowCodeEditor,
        allowAdvancedEditor: config.security.allowAdvancedEditor,
        allowTrainingExport: config.security.allowTrainingExport,
        promptGuardMode: config.security.promptGuard.mode,
        responseGuardMode: config.security.responseGuard.mode,
        jailbreakThreshold: config.security.inputValidation?.jailbreakThreshold,
        jailbreakAction: config.security.inputValidation?.jailbreakAction,
        strictSystemPromptConfidentiality: config.security.strictSystemPromptConfidentiality,
        abuseDetectionEnabled: config.security.abuseDetection?.enabled,
        contentGuardrailsEnabled: config.security.contentGuardrails?.enabled ?? false,
        contentGuardrailsPiiMode: config.security.contentGuardrails?.piiMode ?? 'disabled',
        contentGuardrailsToxicityEnabled:
          config.security.contentGuardrails?.toxicityEnabled ?? false,
        contentGuardrailsToxicityMode: config.security.contentGuardrails?.toxicityMode ?? 'warn',
        contentGuardrailsToxicityClassifierUrl:
          config.security.contentGuardrails?.toxicityClassifierUrl,
        contentGuardrailsToxicityThreshold:
          config.security.contentGuardrails?.toxicityThreshold ?? 0.7,
        contentGuardrailsBlockList: config.security.contentGuardrails?.blockList ?? [],
        contentGuardrailsBlockedTopics: config.security.contentGuardrails?.blockedTopics ?? [],
        contentGuardrailsGroundingEnabled:
          config.security.contentGuardrails?.groundingEnabled ?? false,
        contentGuardrailsGroundingMode: config.security.contentGuardrails?.groundingMode ?? 'flag',
      };
    });

    // Security policy — update toggles
    this.app.patch(
      '/api/v1/security/policy',
      async (
        request: FastifyRequest<{
          Body: {
            allowSubAgents?: boolean;
            allowA2A?: boolean;
            allowSwarms?: boolean;
            allowExtensions?: boolean;
            allowExecution?: boolean;
            allowProactive?: boolean;
            allowWorkflows?: boolean;
            allowExperiments?: boolean;
            allowStorybook?: boolean;
            allowMultimodal?: boolean;
            allowDesktopControl?: boolean;
            allowCamera?: boolean;
            allowDynamicTools?: boolean;
            sandboxDynamicTools?: boolean;
            allowAnomalyDetection?: boolean;
            sandboxGvisor?: boolean;
            sandboxWasm?: boolean;
            sandboxCredentialProxy?: boolean;
            allowCommunityGitFetch?: boolean;
            communityGitUrl?: string;
            allowNetworkTools?: boolean;
            allowNetBoxWrite?: boolean;
            allowTwingate?: boolean;
            allowOrgIntent?: boolean;
            allowIntentEditor?: boolean;
            allowCodeEditor?: boolean;
            allowAdvancedEditor?: boolean;
            allowTrainingExport?: boolean;
            promptGuardMode?: 'block' | 'warn' | 'disabled';
            responseGuardMode?: 'block' | 'warn' | 'disabled';
            jailbreakThreshold?: number;
            jailbreakAction?: 'block' | 'warn' | 'audit_only';
            strictSystemPromptConfidentiality?: boolean;
            abuseDetectionEnabled?: boolean;
            contentGuardrailsEnabled?: boolean;
            contentGuardrailsPiiMode?: 'disabled' | 'detect_only' | 'redact';
            contentGuardrailsToxicityEnabled?: boolean;
            contentGuardrailsToxicityMode?: 'block' | 'warn' | 'audit_only';
            contentGuardrailsToxicityClassifierUrl?: string;
            contentGuardrailsToxicityThreshold?: number;
            contentGuardrailsBlockList?: string[];
            contentGuardrailsBlockedTopics?: string[];
            contentGuardrailsGroundingEnabled?: boolean;
            contentGuardrailsGroundingMode?: 'flag' | 'block';
          };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const {
            allowSubAgents,
            allowA2A,
            allowSwarms,
            allowExtensions,
            allowExecution,
            allowProactive,
            allowWorkflows,
            allowExperiments,
            allowStorybook,
            allowMultimodal,
            allowDesktopControl,
            allowCamera,
            allowDynamicTools,
            sandboxDynamicTools,
            allowAnomalyDetection,
            sandboxGvisor,
            sandboxWasm,
            sandboxCredentialProxy,
            allowCommunityGitFetch,
            communityGitUrl,
            allowNetworkTools,
            allowNetBoxWrite,
            allowTwingate,
            allowOrgIntent,
            allowIntentEditor,
            allowCodeEditor,
            allowAdvancedEditor,
            allowTrainingExport,
            promptGuardMode,
            responseGuardMode,
            jailbreakThreshold,
            jailbreakAction,
            strictSystemPromptConfidentiality,
            abuseDetectionEnabled,
            contentGuardrailsEnabled,
            contentGuardrailsPiiMode,
            contentGuardrailsToxicityEnabled,
            contentGuardrailsToxicityMode,
            contentGuardrailsToxicityClassifierUrl,
            contentGuardrailsToxicityThreshold,
            contentGuardrailsBlockList,
            contentGuardrailsBlockedTopics,
            contentGuardrailsGroundingEnabled,
            contentGuardrailsGroundingMode,
          } = request.body;
          if (
            allowSubAgents === undefined &&
            allowA2A === undefined &&
            allowSwarms === undefined &&
            allowExtensions === undefined &&
            allowExecution === undefined &&
            allowProactive === undefined &&
            allowWorkflows === undefined &&
            allowExperiments === undefined &&
            allowStorybook === undefined &&
            allowMultimodal === undefined &&
            allowDesktopControl === undefined &&
            allowCamera === undefined &&
            allowDynamicTools === undefined &&
            sandboxDynamicTools === undefined &&
            allowAnomalyDetection === undefined &&
            sandboxGvisor === undefined &&
            sandboxWasm === undefined &&
            sandboxCredentialProxy === undefined &&
            allowCommunityGitFetch === undefined &&
            communityGitUrl === undefined &&
            allowNetworkTools === undefined &&
            allowNetBoxWrite === undefined &&
            allowTwingate === undefined &&
            allowOrgIntent === undefined &&
            allowIntentEditor === undefined &&
            allowCodeEditor === undefined &&
            allowAdvancedEditor === undefined &&
            allowTrainingExport === undefined &&
            promptGuardMode === undefined &&
            responseGuardMode === undefined &&
            jailbreakThreshold === undefined &&
            jailbreakAction === undefined &&
            strictSystemPromptConfidentiality === undefined &&
            abuseDetectionEnabled === undefined &&
            contentGuardrailsEnabled === undefined &&
            contentGuardrailsPiiMode === undefined &&
            contentGuardrailsToxicityEnabled === undefined &&
            contentGuardrailsToxicityMode === undefined &&
            contentGuardrailsToxicityClassifierUrl === undefined &&
            contentGuardrailsToxicityThreshold === undefined &&
            contentGuardrailsBlockList === undefined &&
            contentGuardrailsBlockedTopics === undefined &&
            contentGuardrailsGroundingEnabled === undefined &&
            contentGuardrailsGroundingMode === undefined
          ) {
            return sendError(reply, 400, 'No valid fields provided');
          }
          this.secureYeoman.updateSecurityPolicy({
            allowSubAgents,
            allowA2A,
            allowSwarms,
            allowExtensions,
            allowExecution,
            allowProactive,
            allowWorkflows,
            allowExperiments,
            allowStorybook,
            allowMultimodal,
            allowDesktopControl,
            allowCamera,
            allowDynamicTools,
            sandboxDynamicTools,
            allowAnomalyDetection,
            sandboxGvisor,
            sandboxWasm,
            sandboxCredentialProxy,
            allowCommunityGitFetch,
            communityGitUrl,
            allowNetworkTools,
            allowNetBoxWrite,
            allowTwingate,
            allowOrgIntent,
            allowIntentEditor,
            allowCodeEditor,
            allowAdvancedEditor,
            allowTrainingExport,
            promptGuardMode,
            responseGuardMode,
            jailbreakThreshold,
            jailbreakAction,
            strictSystemPromptConfidentiality,
            abuseDetectionEnabled,
            contentGuardrailsEnabled,
            contentGuardrailsPiiMode,
            contentGuardrailsToxicityEnabled,
            contentGuardrailsToxicityMode,
            contentGuardrailsToxicityClassifierUrl,
            contentGuardrailsToxicityThreshold,
            contentGuardrailsBlockList,
            contentGuardrailsBlockedTopics,
            contentGuardrailsGroundingEnabled,
            contentGuardrailsGroundingMode,
          });

          // Audit the policy change
          try {
            const changedKeys = Object.keys(request.body).filter(
              (k) => (request.body as Record<string, unknown>)[k] !== undefined
            );
            void this.secureYeoman.getAuditChain().record({
              event: 'config_change',
              level: 'info',
              message: 'Security policy updated via dashboard',
              userId: request.authUser?.userId,
              metadata: { changes: changedKeys },
            });
          } catch {
            // Audit is best-effort
          }
          const config = this.secureYeoman.getConfig();
          return {
            allowSubAgents: config.security.allowSubAgents,
            allowA2A: config.security.allowA2A,
            allowSwarms: config.security.allowSwarms,
            allowExtensions: config.security.allowExtensions,
            allowExecution: config.security.allowExecution,
            allowProactive: config.security.allowProactive,
            allowWorkflows: config.security.allowWorkflows,
            allowExperiments: config.security.allowExperiments,
            allowStorybook: config.security.allowStorybook,
            allowMultimodal: config.security.allowMultimodal,
            allowDesktopControl: config.security.allowDesktopControl,
            allowCamera: config.security.allowCamera,
            allowDynamicTools: config.security.allowDynamicTools,
            sandboxDynamicTools: config.security.sandboxDynamicTools,
            allowAnomalyDetection: config.security.allowAnomalyDetection,
            sandboxGvisor: config.security.sandboxGvisor,
            sandboxWasm: config.security.sandboxWasm,
            sandboxCredentialProxy: config.security.sandboxCredentialProxy,
            allowCommunityGitFetch: config.security.allowCommunityGitFetch,
            communityGitUrl: config.security.communityGitUrl,
            allowNetworkTools: config.security.allowNetworkTools,
            allowNetBoxWrite: config.security.allowNetBoxWrite,
            allowTwingate: config.security.allowTwingate,
            allowOrgIntent: config.security.allowOrgIntent,
            allowIntentEditor: config.security.allowIntentEditor,
            allowCodeEditor: config.security.allowCodeEditor,
            allowAdvancedEditor: config.security.allowAdvancedEditor,
            allowTrainingExport: config.security.allowTrainingExport,
            promptGuardMode: config.security.promptGuard.mode,
            responseGuardMode: config.security.responseGuard.mode,
            jailbreakThreshold: config.security.inputValidation?.jailbreakThreshold,
            jailbreakAction: config.security.inputValidation?.jailbreakAction,
            strictSystemPromptConfidentiality: config.security.strictSystemPromptConfidentiality,
            abuseDetectionEnabled: config.security.abuseDetection?.enabled,
            contentGuardrailsEnabled: config.security.contentGuardrails?.enabled ?? false,
            contentGuardrailsPiiMode: config.security.contentGuardrails?.piiMode ?? 'disabled',
            contentGuardrailsToxicityEnabled:
              config.security.contentGuardrails?.toxicityEnabled ?? false,
            contentGuardrailsToxicityMode:
              config.security.contentGuardrails?.toxicityMode ?? 'warn',
            contentGuardrailsToxicityClassifierUrl:
              config.security.contentGuardrails?.toxicityClassifierUrl,
            contentGuardrailsToxicityThreshold:
              config.security.contentGuardrails?.toxicityThreshold ?? 0.7,
            contentGuardrailsBlockList: config.security.contentGuardrails?.blockList ?? [],
            contentGuardrailsBlockedTopics: config.security.contentGuardrails?.blockedTopics ?? [],
            contentGuardrailsGroundingEnabled:
              config.security.contentGuardrails?.groundingEnabled ?? false,
            contentGuardrailsGroundingMode:
              config.security.contentGuardrails?.groundingMode ?? 'flag',
          };
        } catch (err) {
          this.getLogger().error('Failed to update security policy', {
            error: err instanceof Error ? err.message : String(err),
          });
          return sendError(reply, 500, 'Failed to update security policy');
        }
      }
    );

    // ML Security Summary — aggregates ML-relevant events, computes a risk score,
    // and buckets events into a trend chart.  No ML model is required; the risk
    // score is a deterministic weighted sum based on event counts.
    this.app.get(
      '/api/v1/security/ml/summary',
      async (request: FastifyRequest<{ Querystring: { period?: string } }>) => {
        const ML_EVENT_TYPES = [
          'anomaly',
          'injection_attempt',
          'sandbox_violation',
          'secret_access',
        ] as const;
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

        const rawPeriod = request.query.period;
        const period: '24h' | '7d' | '30d' =
          rawPeriod === '24h' || rawPeriod === '7d' || rawPeriod === '30d' ? rawPeriod : '7d';

        const now = Date.now();
        const periodMs =
          period === '24h'
            ? 24 * 60 * 60 * 1000
            : period === '7d'
              ? 7 * 24 * 60 * 60 * 1000
              : 30 * 24 * 60 * 60 * 1000;
        const from = now - periodMs;

        const zeroedResponse = (enabled: boolean) => ({
          enabled,
          period,
          riskScore: 0,
          riskLevel: 'low' as const,
          detections: {
            anomaly: 0,
            injectionAttempt: 0,
            sandboxViolation: 0,
            secretAccess: 0,
            total: 0,
          },
          trend: [] as { bucket: string; timestamp: number; count: number }[],
        });

        try {
          const config = this.secureYeoman.getConfig();
          const enabled = config.security.allowAnomalyDetection ?? false;

          const result = await this.secureYeoman.queryAuditLog({
            event: [...ML_EVENT_TYPES],
            from,
            to: now,
            limit: 10000,
            offset: 0,
          });

          const entries = result.entries;

          // Count detections by category
          let anomalyCount = 0;
          let injectionCount = 0;
          let sandboxCount = 0;
          let secretAccessCount = 0;
          for (const e of entries) {
            if (e.event === 'anomaly') anomalyCount++;
            else if (e.event === 'injection_attempt') injectionCount++;
            else if (e.event === 'sandbox_violation') sandboxCount++;
            else if (e.event === 'secret_access') secretAccessCount++;
          }

          // Deterministic risk score (0-100)
          const riskScore = Math.min(
            100,
            clamp(anomalyCount * 10, 0, 30) +
              clamp(injectionCount * 15, 0, 40) +
              clamp(sandboxCount * 20, 0, 30) +
              clamp(secretAccessCount * 5, 0, 20)
          );
          const riskLevel: 'low' | 'medium' | 'high' | 'critical' =
            riskScore < 25
              ? 'low'
              : riskScore < 50
                ? 'medium'
                : riskScore < 75
                  ? 'high'
                  : 'critical';

          // Bucket events by time (hourly for 24h, daily otherwise)
          const bucketMs = period === '24h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
          const bucketCount = period === '24h' ? 24 : period === '7d' ? 7 : 30;
          const buckets = new Map<number, number>();
          for (let i = 0; i < bucketCount; i++) {
            buckets.set(from + i * bucketMs, 0);
          }
          for (const e of entries) {
            const idx = Math.floor((e.timestamp - from) / bucketMs);
            const key = from + idx * bucketMs;
            if (buckets.has(key)) {
              buckets.set(key, (buckets.get(key) ?? 0) + 1);
            }
          }

          const trend = Array.from(buckets.entries())
            .sort(([a], [b]) => a - b)
            .map(([timestamp, count]) => {
              const d = new Date(timestamp);
              const pad = (n: number) => String(n).padStart(2, '0');
              const dateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
              const bucket = period === '24h' ? `${dateStr}T${pad(d.getUTCHours())}:00` : dateStr;
              return { bucket, timestamp, count };
            });

          return {
            enabled,
            period,
            riskScore,
            riskLevel,
            detections: {
              anomaly: anomalyCount,
              injectionAttempt: injectionCount,
              sandboxViolation: sandboxCount,
              secretAccess: secretAccessCount,
              total: entries.length,
            },
            trend,
          };
        } catch {
          // Graceful fallback — same pattern as /api/v1/security/events
          try {
            const config = this.secureYeoman.getConfig();
            return zeroedResponse(config.security.allowAnomalyDetection ?? false);
          } catch {
            return zeroedResponse(false);
          }
        }
      }
    );

    // Audit log query
    this.app.get(
      '/api/v1/audit',
      async (
        request: FastifyRequest<{
          Querystring: {
            from?: string;
            to?: string;
            level?: string;
            event?: string;
            userId?: string;
            taskId?: string;
            limit?: string;
            offset?: string;
          };
        }>
      ) => {
        const q = request.query;
        return this.secureYeoman.queryAuditLog({
          from: q.from ? Number(q.from) : undefined,
          to: q.to ? Number(q.to) : undefined,
          level: q.level ? q.level.split(',') : undefined,
          event: q.event ? q.event.split(',') : undefined,
          userId: q.userId,
          taskId: q.taskId,
          ...parsePagination(q),
        });
      }
    );

    // Audit chain verification
    this.app.post('/api/v1/audit/verify', async () => {
      return this.secureYeoman.verifyAuditChain();
    });

    // Re-sign chain after a hash-function change (e.g. JSONB metadata key ordering fix)
    this.app.post('/api/v1/audit/repair', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await this.secureYeoman.repairAuditChain();
        return result;
      } catch {
        return sendError(reply, 500, 'Failed to repair audit chain');
      }
    });

    // Audit stats
    this.app.get('/api/v1/audit/stats', async () => {
      const stats = await this.secureYeoman.getAuditStats();
      return stats;
    });

    // Enforce audit retention
    this.app.post(
      '/api/v1/audit/retention',
      async (
        request: FastifyRequest<{
          Body: { maxAgeDays?: number; maxEntries?: number };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const { maxAgeDays, maxEntries } = request.body;
          if (maxAgeDays !== undefined && (maxAgeDays < 1 || maxAgeDays > 3650)) {
            return sendError(reply, 400, 'maxAgeDays must be between 1 and 3650');
          }
          if (maxEntries !== undefined && (maxEntries < 100 || maxEntries > 10_000_000)) {
            return sendError(reply, 400, 'maxEntries must be between 100 and 10,000,000');
          }
          const deleted = this.secureYeoman.enforceAuditRetention({ maxAgeDays, maxEntries });
          const stats = await this.secureYeoman.getAuditStats();
          return { deleted, ...stats };
        } catch {
          return sendError(reply, 500, 'Failed to enforce retention');
        }
      }
    );

    // Export audit log as compressed JSON
    this.app.get(
      '/api/v1/audit/export',
      async (
        request: FastifyRequest<{
          Querystring: { from?: string; to?: string; limit?: string };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const q = request.query;
          const entries = await this.secureYeoman.exportAuditLog({
            from: q.from ? Number(q.from) : undefined,
            to: q.to ? Number(q.to) : undefined,
            limit: parsePagination(q, { defaultLimit: 100_000, maxLimit: 100_000 }).limit,
          });
          const filename = `secureyeoman-audit-${new Date().toISOString().slice(0, 10)}.json`;
          return reply
            .header('Content-Type', 'application/json')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(
              JSON.stringify(
                { exportedAt: new Date().toISOString(), count: entries.length, entries },
                null,
                2
              )
            );
        } catch {
          return sendError(reply, 500, 'Failed to export audit log');
        }
      }
    );

    // ── Phase 41: Secrets Management Routes ─────────────────────────────────

    // GET /api/v1/secrets — list all stored secret names (never values)
    this.app.get('/api/v1/secrets', async (_request, reply) => {
      const sm = this.secureYeoman.getSecretsManager();
      if (!sm) return sendError(reply, 503, 'Secrets manager not available');
      try {
        const keys = await sm.keys();
        return { keys };
      } catch (err) {
        this.getLogger().error('Failed to list secrets', {
          error: err instanceof Error ? err.message : String(err),
        });
        return sendError(reply, 500, 'Failed to list secrets');
      }
    });

    // GET /api/v1/secrets/:name — check existence only (value is never returned)
    this.app.get(
      '/api/v1/secrets/:name',
      async (request: FastifyRequest<{ Params: { name: string } }>, reply) => {
        const sm = this.secureYeoman.getSecretsManager();
        if (!sm) return sendError(reply, 503, 'Secrets manager not available');
        const { name } = request.params;
        if (!name || !/^[A-Z0-9_]+$/.test(name)) {
          return sendError(reply, 400, 'Secret name must be uppercase alphanumeric/underscore');
        }
        try {
          const exists = await sm.has(name);
          if (!exists) return sendError(reply, 404, 'Secret not found');
          return { name, exists: true };
        } catch (err) {
          this.getLogger().error('Failed to check secret', {
            name,
            error: err instanceof Error ? err.message : String(err),
          });
          return sendError(reply, 500, 'Failed to check secret');
        }
      }
    );

    // PUT /api/v1/secrets/:name — create or update a secret
    this.app.put(
      '/api/v1/secrets/:name',
      async (
        request: FastifyRequest<{
          Params: { name: string };
          Body: { value: string };
        }>,
        reply
      ) => {
        const sm = this.secureYeoman.getSecretsManager();
        if (!sm) return sendError(reply, 503, 'Secrets manager not available');
        const { name } = request.params;
        if (!name || !/^[A-Z0-9_]+$/.test(name)) {
          return sendError(reply, 400, 'Secret name must be uppercase alphanumeric/underscore');
        }
        const { value } = request.body ?? {};
        if (typeof value !== 'string' || value.length === 0) {
          return sendError(reply, 400, 'Secret value is required');
        }
        try {
          await sm.set(name, value);
          clearModelCache();
          await this.secureYeoman.getAuditChain().record({
            event: 'secret_access',
            level: 'security',
            message: `Secret '${name}' updated`,
            metadata: { operation: 'set', name },
          });
          reply.code(204);
          return;
        } catch (err) {
          this.getLogger().error('Failed to set secret', {
            name,
            error: err instanceof Error ? err.message : String(err),
          });
          return sendError(reply, 500, 'Failed to set secret');
        }
      }
    );

    // DELETE /api/v1/secrets/:name — remove a secret
    this.app.delete(
      '/api/v1/secrets/:name',
      async (request: FastifyRequest<{ Params: { name: string } }>, reply) => {
        const sm = this.secureYeoman.getSecretsManager();
        if (!sm) return sendError(reply, 503, 'Secrets manager not available');
        const { name } = request.params;
        if (!name || !/^[A-Z0-9_]+$/.test(name)) {
          return sendError(reply, 400, 'Secret name must be uppercase alphanumeric/underscore');
        }
        try {
          const deleted = await sm.delete(name);
          if (!deleted) return sendError(reply, 404, 'Secret not found');
          clearModelCache();
          await this.secureYeoman.getAuditChain().record({
            event: 'secret_access',
            level: 'security',
            message: `Secret '${name}' deleted`,
            metadata: { operation: 'delete', name },
          });
          reply.code(204);
          return;
        } catch (err) {
          this.getLogger().error('Failed to delete secret', {
            name,
            error: err instanceof Error ? err.message : String(err),
          });
          return sendError(reply, 500, 'Failed to delete secret');
        }
      }
    );

    // ── Internal SSH key store — MCP-only; returns ciphertext for GITHUB_SSH_ secrets ──
    // The MCP service stores AES-256-GCM encrypted SSH private keys under GITHUB_SSH_* names
    // in the SecretsManager.  On container restart, MCP calls this endpoint to retrieve
    // ciphertexts it can decrypt locally (core never sees the plaintext private key material).
    this.app.get('/api/v1/internal/ssh-keys', async (_request, reply) => {
      const sm = this.secureYeoman.getSecretsManager();
      if (!sm) return sendError(reply, 503, 'Secrets manager not available');
      try {
        const allKeys = await sm.keys();
        const sshKeys = allKeys.filter((k) => k.startsWith('GITHUB_SSH_'));
        const entries: { name: string; ciphertext: string }[] = [];
        for (const name of sshKeys) {
          const val = await sm.get(name);
          if (val) entries.push({ name, ciphertext: val });
        }
        return { keys: entries };
      } catch (err) {
        this.getLogger().error('Failed to list internal SSH keys', {
          error: err instanceof Error ? err.message : String(err),
        });
        return sendError(reply, 500, 'Failed to list SSH keys');
      }
    });

    // ── Phase 42: TLS Certificate Routes ────────────────────────────────────

    // GET /api/v1/security/tls — TLS cert status for dashboard display
    this.app.get('/api/v1/security/tls', async (_request, reply) => {
      const tlsMgr = this.secureYeoman.getTlsManager();
      if (!tlsMgr) return sendError(reply, 503, 'TLS manager not available');
      try {
        const status = await tlsMgr.getCertStatus();
        return status;
      } catch (err) {
        this.getLogger().error('Failed to get TLS status', {
          error: err instanceof Error ? err.message : String(err),
        });
        return sendError(reply, 500, 'Failed to get TLS status');
      }
    });

    // POST /api/v1/security/tls/generate — trigger cert regeneration (dev only)
    this.app.post('/api/v1/security/tls/generate', async (_request, reply) => {
      const config = this.secureYeoman.getConfig();
      if (config.core.environment === 'production') {
        return sendError(reply, 403, 'Cert auto-generation is not allowed in production');
      }
      const tlsMgr = this.secureYeoman.getTlsManager();
      if (!tlsMgr) return sendError(reply, 503, 'TLS manager not available');
      try {
        const paths = await tlsMgr.ensureCerts();
        return { generated: true, paths };
      } catch (err) {
        this.getLogger().error('Failed to generate TLS cert', {
          error: err instanceof Error ? err.message : String(err),
        });
        return sendError(reply, 500, 'Failed to generate TLS certificate');
      }
    });

    // SPA static serving (must be last — any non-API route falls through to index.html)
    const distPath = this.resolveDashboardDist();
    if (distPath) {
      // decorateReply must remain true (the default) so reply.sendFile() is available
      // inside the setNotFoundHandler below.
      void this.app.register(fastifyStatic, {
        root: distPath,
        prefix: '/',
      });
      // Pre-read the SPA shell so we can serve it from setNotFoundHandler without
      // depending on reply.sendFile() which is unreliable inside a callNotFound context.
      const indexHtml = readFileSync(join(distPath, 'index.html'), 'utf-8');

      // SPA fallback: serve index.html for SPA routes; JSON 404 for everything else.
      this.app.setNotFoundHandler((_request, reply) => {
        // Strip query string before all prefix/extension checks
        const pathname = _request.url.split('?')[0] ?? _request.url;
        // API and WebSocket routes always return JSON 404
        if (pathname.startsWith('/api/') || pathname.startsWith('/ws/')) {
          return sendError(reply, 404, 'Not found');
        }
        // Static asset requests (URL contains a file extension in the last segment)
        // return JSON 404 rather than the SPA shell — serving index.html as a .js
        // or .css file causes parse errors in the browser.
        if (/\.[^/]+$/.test(pathname)) {
          return sendError(reply, 404, 'Not found');
        }
        // All other routes are SPA routes — serve the app shell
        return reply.type('text/html').send(indexHtml);
      });
      this.getLogger().info('Dashboard SPA serving enabled', { distPath });
    }

    // WebSocket endpoint — auth via Sec-WebSocket-Protocol header (preferred) or ?token= query param (fallback)
    this.app.get('/ws/metrics', { websocket: true }, async (socket, request) => {
      // Extract token: prefer Sec-WebSocket-Protocol subprotocol, fall back to query param
      let authUser: { userId: string; role: string } | undefined;
      if (this.authService) {
        const url = new URL(request.url, `http://${request.hostname}`);
        const protocols = request.headers['sec-websocket-protocol'];
        const protocolToken =
          typeof protocols === 'string'
            ? protocols
                .split(',')
                .map((p) => p.trim())
                .find((p) => p.startsWith('token.'))
                ?.slice(6)
            : undefined;
        const queryToken = url.searchParams.get('token');
        const token = protocolToken ?? queryToken;

        if (queryToken && !protocolToken) {
          this.getLogger().warn(
            'WebSocket auth via query param is deprecated, use Sec-WebSocket-Protocol',
            {
              ip: request.ip,
            }
          );
        }

        if (!token) {
          socket.close(4401, 'Missing authentication token');
          return;
        }
        try {
          const user = await this.authService.validateToken(token);
          authUser = { userId: user.userId, role: user.role };
        } catch {
          socket.close(4401, 'Invalid authentication token');
          return;
        }
      }

      // Evict the oldest idle client when the cap is reached
      if (this.clients.size >= this.config.maxWsClients) {
        let oldestId: string | null = null;
        let oldestPong = Infinity;
        for (const [id, c] of this.clients) {
          if (c.lastPong < oldestPong) {
            oldestPong = c.lastPong;
            oldestId = id;
          }
        }
        if (oldestId) {
          const evicted = this.clients.get(oldestId);
          evicted?.ws.close(1008, 'Connection limit reached');
          this.clients.delete(oldestId);
          this.getLogger().warn('WebSocket client evicted (cap reached)', {
            evictedId: oldestId,
            cap: this.config.maxWsClients,
          });
        }
      }

      const clientId = `client_${uuidv7()}`;

      const client: WebSocketClient = {
        ws: socket,
        channels: new Set(),
        userId: authUser?.userId,
        role: authUser?.role,
        lastPong: Date.now(),
      };

      this.clients.set(clientId, client);

      this.getLogger().debug('WebSocket client connected', { clientId, userId: authUser?.userId });

      socket.on('pong', () => {
        client.lastPong = Date.now();
      });

      socket.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString()) as {
            type: string;
            payload?: { channels?: string[] };
          };

          if (data.type === 'subscribe' && data.payload?.channels) {
            // Cap channel subscriptions to prevent memory exhaustion
            const maxChannels = 50;
            const channelsToProcess = data.payload.channels.slice(0, maxChannels);
            const subscribed: string[] = [];
            for (const channel of channelsToProcess) {
              const perm = CHANNEL_PERMISSIONS[channel];
              if (perm) {
                // Fail-secure: if channel requires a permission and client has no role, deny
                if (!client.role) continue;
                const result = this.secureYeoman.getRBAC().checkPermission(client.role, perm);
                if (!result.granted) continue;
              }
              client.channels.add(channel);
              subscribed.push(channel);
            }
            socket.send(
              JSON.stringify({
                type: 'ack',
                channel: 'system',
                payload: { subscribed },
                timestamp: Date.now(),
                sequence: 0,
              })
            );
          }

          if (data.type === 'unsubscribe' && data.payload?.channels) {
            for (const channel of data.payload.channels) {
              client.channels.delete(channel);
            }
          }
        } catch (error) {
          this.getLogger().error('Failed to parse WebSocket message', {
            clientId,
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
      });

      socket.on('close', () => {
        this.clients.delete(clientId);
        this.getLogger().debug('WebSocket client disconnected', { clientId });
      });

      socket.on('error', (error: Error) => {
        this.getLogger().error('WebSocket error', {
          clientId,
          error: error.message,
        });
      });
    });

    // ── Collaborative editing endpoint (Yjs binary protocol) ────────────
    // Path: /ws/collab/:docId — auth via Sec-WebSocket-Protocol (preferred) or ?token= (fallback)
    // docId format: "personality:<uuid>" | "skill:<uuid>"
    this.app.get(
      '/ws/collab/:docId',
      { websocket: true },
      async (socket, request: FastifyRequest<{ Params: { docId: string } }>) => {
        const { docId } = request.params;

        // Auth — prefer Sec-WebSocket-Protocol subprotocol, fall back to query param
        let authUser: { userId: string; role: string; displayName: string } | undefined;
        if (this.authService) {
          const url = new URL(request.url, `http://${request.hostname}`);
          const protocols = request.headers['sec-websocket-protocol'];
          const protocolToken =
            typeof protocols === 'string'
              ? protocols
                  .split(',')
                  .map((p) => p.trim())
                  .find((p) => p.startsWith('token.'))
                  ?.slice(6)
              : undefined;
          const queryToken = url.searchParams.get('token');
          const token = protocolToken ?? queryToken;

          if (queryToken && !protocolToken) {
            this.getLogger().warn(
              'WebSocket auth via query param is deprecated, use Sec-WebSocket-Protocol',
              {
                ip: request.ip,
              }
            );
          }

          if (!token) {
            socket.close(4401, 'Missing authentication token');
            return;
          }
          try {
            const user = await this.authService.validateToken(token);
            // Resolve display name: try soul users, fall back to role label
            let displayName = user.role === 'admin' ? 'Admin' : 'User';
            try {
              const soulManager = this.secureYeoman.getSoulManager();
              const soulUser = await soulManager.getUser(user.userId);
              if (soulUser?.name) displayName = soulUser.name;
            } catch {
              // Non-fatal: user may not have a soul profile
            }
            authUser = { userId: user.userId, role: user.role, displayName };
          } catch {
            socket.close(4401, 'Invalid authentication token');
            return;
          }
        } else {
          // No auth service configured (dev mode) — allow with placeholder identity
          authUser = { userId: 'dev', role: 'admin', displayName: 'Dev' };
        }

        // Validate docId format
        if (!/^(personality|skill):[0-9a-f-]{36}$/.test(docId)) {
          socket.close(4400, 'Invalid docId format');
          return;
        }

        socket.binaryType = 'arraybuffer';

        const clientId = `collab_${uuidv7()}`;

        // Resolve initial content from the soul manager so new rooms converge
        // immediately to the current REST-persisted value.
        let initialContent: string | undefined;
        try {
          const soulManager = this.secureYeoman.getSoulManager();
          if (docId.startsWith('personality:')) {
            const id = docId.slice('personality:'.length);
            const p = await soulManager.getPersonality(id);
            initialContent = p?.systemPrompt;
          } else if (docId.startsWith('skill:')) {
            const id = docId.slice('skill:'.length);
            const s = await soulManager.getSkill(id);
            initialContent = s?.instructions;
          }
        } catch {
          // Non-fatal
        }

        await this.collabManager.join(
          docId,
          clientId,
          socket,
          authUser.userId,
          authUser.displayName,
          initialContent
        );

        socket.on('message', (message: Buffer) => {
          const data = new Uint8Array(message instanceof ArrayBuffer ? message : message.buffer);
          this.collabManager.handleMessage(docId, clientId, data);
        });

        socket.on('close', () => {
          this.collabManager.leave(docId, clientId);
          this.getLogger().debug('Collab client disconnected', { clientId, docId });
        });

        socket.on('error', (error: Error) => {
          this.getLogger().error('Collab WebSocket error', {
            clientId,
            docId,
            error: error.message,
          });
        });
      }
    );
  }

  /**
   * Resolve the dashboard dist path from options, env var, or conventional locations.
   * Returns null if no built dashboard is found (dev mode).
   */
  private resolveDashboardDist(): string | null {
    const candidates = [
      this.dashboardDist,
      this.config.dashboardDist,
      join(dirname(fileURLToPath(import.meta.url)), '../../../dashboard/dist'),
      '/usr/share/secureyeoman/dashboard',
    ].filter(Boolean) as string[];

    for (const p of candidates) {
      if (existsSync(join(p, 'index.html'))) {
        return p;
      }
    }
    return null;
  }

  /**
   * Broadcast a message to all clients subscribed to a channel
   */
  broadcast(channel: string, payload: unknown): void {
    const message = JSON.stringify({
      type: 'update',
      channel,
      payload,
      timestamp: Date.now(),
      sequence: Date.now(), // Simple sequence number
    });

    for (const [clientId, client] of this.clients) {
      if (client.channels.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
        } catch (error) {
          this.getLogger().error('Failed to send WebSocket message', {
            clientId,
            channel,
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
      }
    }
  }

  /**
   * Check if any connected client is subscribed to the given channel
   */
  hasSubscribers(channel: string): boolean {
    for (const [, client] of this.clients) {
      if (client.channels.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        return true;
      }
    }
    return false;
  }

  /**
   * Start periodic metrics broadcast
   */
  private startMetricsBroadcast(): void {
    const intervalMs = 5000; // Every 5 seconds (matches dashboard polling)

    this.metricsInterval = setInterval(() => {
      void (async () => {
        try {
          // Skip when no clients are subscribed to metrics
          if (!this.hasSubscribers('metrics')) {
            return;
          }

          const metrics = await this.secureYeoman.getMetrics();
          const json = JSON.stringify(metrics);

          // Skip re-broadcast if payload hasn't changed
          if (json === this.lastMetricsJson) {
            return;
          }
          this.lastMetricsJson = json;

          this.broadcast('metrics', metrics);

          // Evaluate alert rules against current snapshot (fire-and-forget)
          const alertManager = this.secureYeoman.getAlertManager?.();
          if (alertManager) {
            void alertManager.evaluate(metrics as Record<string, unknown>);
          }
        } catch (error) {
          this.getLogger().error('Failed to broadcast metrics', {
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
      })();
    }, intervalMs);

    this.metricsInterval.unref();
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    // Initialize plugins and routes
    await this.init();

    const host = this.config.host;
    const port = this.config.port;

    try {
      await this.app.listen({ host, port });

      const scheme = this.config.tls.enabled ? 'https' : 'http';
      this.getLogger().info('Gateway server started', {
        host,
        port,
        url: `${scheme}://${host}:${port}`,
        tls: this.config.tls.enabled,
        mtls: !!(this.config.tls.enabled && this.config.tls.caPath),
      });

      // Start metrics broadcast
      this.startMetricsBroadcast();

      // Start WebSocket heartbeat (ping every 30s, terminate after 60s without pong)
      this.heartbeatInterval = setInterval(() => {
        const now = Date.now();
        for (const [id, client] of this.clients) {
          try {
            if (now - client.lastPong > 60_000) {
              client.ws.terminate();
              this.clients.delete(id);
            } else {
              client.ws.ping();
            }
          } catch {
            // Socket may already be closed/invalid — clean up silently
            this.clients.delete(id);
          }
        }
      }, 30_000);
      this.heartbeatInterval.unref();
    } catch (error) {
      this.getLogger().error('Failed to start gateway server', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Stop metrics broadcast
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    // Close all WebSocket connections
    for (const [_clientId, client] of this.clients) {
      try {
        client.ws.close(1000, 'Server shutting down');
      } catch {
        // Ignore close errors
      }
    }
    this.clients.clear();

    // Close Fastify
    await this.app.close();

    this.getLogger().info('Gateway server stopped');
  }

  /**
   * Get the number of connected clients
   */
  getConnectedClients(): number {
    return this.clients.size;
  }
}

/**
 * Create and start a gateway server
 */
export function createGatewayServer(options: GatewayServerOptions): GatewayServer {
  return new GatewayServer(options);
}
