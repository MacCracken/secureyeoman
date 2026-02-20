/**
 * CodeExecutionManager — Manages sandboxed code execution sessions,
 * runtime dispatch, secrets filtering, and approval workflow.
 */

import type { ExecutionConfig } from '@secureyeoman/shared';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';
import { ExecutionStorage } from './storage.js';
import type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionSession,
  ApprovalRecord,
  RuntimeType,
} from './types.js';
import { NodeRuntime, PythonRuntime, ShellRuntime, type RuntimeAdapter } from './runtimes.js';
import { createSecretsFilter } from './secrets-filter.js';
import { uuidv7 } from '../utils/crypto.js';

export interface CodeExecutionManagerDeps {
  storage: ExecutionStorage;
  logger: SecureLogger;
  auditChain: AuditChain;
}

const DEFAULT_TIMEOUT = 30_000;
const MAX_OUTPUT_LENGTH = 1_000_000; // 1 MB

export class CodeExecutionManager {
  private readonly config: ExecutionConfig;
  private readonly deps: CodeExecutionManagerDeps;
  private readonly runtimes = new Map<RuntimeType, RuntimeAdapter>();
  private readonly secretsFilter: (line: string) => string;
  private expiryTimer: NodeJS.Timeout | null = null;

  constructor(config: ExecutionConfig, deps: CodeExecutionManagerDeps) {
    this.config = config;
    this.deps = deps;

    // Register runtime adapters
    this.runtimes.set('node', new NodeRuntime());
    this.runtimes.set('python', new PythonRuntime());
    this.runtimes.set('shell', new ShellRuntime());

    // Build secrets filter from config patterns
    this.secretsFilter = createSecretsFilter(config.secretPatterns);
  }

  async initialize(): Promise<void> {
    // Expire any sessions that outlived their timeout from a previous run
    const { sessions } = await this.deps.storage.listSessions();
    const now = Date.now();
    for (const session of sessions) {
      if (session.status === 'active' && now - session.lastActivity > this.config.sessionTimeout) {
        await this.deps.storage.updateSession(session.id, { status: 'expired' });
        this.deps.logger.debug('Expired stale session on startup', {
          component: 'execution',
          taskId: session.id,
        });
      }
    }

    // Start periodic expiry check (every 60 seconds)
    this.expiryTimer = setInterval(() => {
      void this.expireStaleSessions();
    }, 60_000);

    this.deps.logger.debug('CodeExecutionManager initialized', {
      component: 'execution',
    });
  }

  // ── Execution ───────────────────────────────────────────────────

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!this.config.enabled) {
      throw new Error('Code execution is disabled');
    }

    // Validate runtime is allowed
    if (!this.config.allowedRuntimes.includes(request.runtime)) {
      throw new Error(
        `Runtime '${request.runtime}' is not allowed. Allowed: ${this.config.allowedRuntimes.join(', ')}`
      );
    }

    const adapter = this.runtimes.get(request.runtime);
    if (!adapter) {
      throw new Error(`No runtime adapter for '${request.runtime}'`);
    }

    // Validate code safety
    const validation = adapter.validateCode(request.code);
    if (!validation.valid) {
      throw new Error(`Code validation failed: ${validation.errors.join('; ')}`);
    }

    // Check approval policy
    if (this.config.approvalPolicy === 'always') {
      const approval = await this.deps.storage.createApproval({
        requestId: uuidv7(),
      });
      throw new ApprovalRequiredError('Execution requires approval', approval.id);
    }

    if (this.config.approvalPolicy === 'first-time') {
      // Check if this runtime has been used in any session before
      const { sessions } = await this.deps.storage.listSessions();
      const hasUsedRuntime = sessions.some(
        (s) => s.runtime === request.runtime && s.status !== 'terminated'
      );
      if (!hasUsedRuntime) {
        const approval = await this.deps.storage.createApproval({
          requestId: uuidv7(),
        });
        throw new ApprovalRequiredError(
          `First-time execution of '${request.runtime}' runtime requires approval`,
          approval.id
        );
      }
    }

    // Get or create session
    let session: ExecutionSession;
    if (request.sessionId) {
      const existing = await this.deps.storage.getSession(request.sessionId);
      if (!existing) {
        throw new Error(`Session '${request.sessionId}' not found`);
      }
      if (existing.status !== 'active') {
        throw new Error(`Session '${request.sessionId}' is ${existing.status}`);
      }
      if (existing.runtime !== request.runtime) {
        throw new Error(
          `Session runtime mismatch: expected '${existing.runtime}', got '${request.runtime}'`
        );
      }
      session = existing;
    } else {
      // Check concurrent session limit
      const { sessions: allSessions } = await this.deps.storage.listSessions();
      const activeSessions = allSessions.filter((s) => s.status === 'active');
      if (activeSessions.length >= this.config.maxConcurrent) {
        throw new Error(`Maximum concurrent sessions (${this.config.maxConcurrent}) reached`);
      }
      session = await this.deps.storage.createSession({
        runtime: request.runtime,
      });
    }

    // Execute code via the runtime adapter
    const timeout = request.timeout ?? DEFAULT_TIMEOUT;
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let truncated = false;

    try {
      for await (const chunk of adapter.execute(request.code, session, {
        timeout,
      })) {
        const filtered = this.secretsFilter(chunk.data);
        if (chunk.stream === 'stdout') {
          stdout += filtered;
        } else {
          stderr += filtered;
        }

        // Truncate if output exceeds max
        if (stdout.length + stderr.length > MAX_OUTPUT_LENGTH) {
          truncated = true;
          stdout = stdout.slice(0, MAX_OUTPUT_LENGTH / 2);
          stderr = stderr.slice(0, MAX_OUTPUT_LENGTH / 2);
          break;
        }
      }
    } catch (err) {
      exitCode = 1;
      stderr += err instanceof Error ? err.message : 'Execution failed';
    }

    const duration = Date.now() - startTime;

    // Update session last activity
    await this.deps.storage.updateSession(session.id, {
      lastActivity: Date.now(),
    });

    // Record execution in history
    const result = await this.deps.storage.recordExecution({
      sessionId: session.id,
      exitCode,
      stdout,
      stderr,
      duration,
      truncated,
    });

    // Audit trail
    await this.auditRecord('code_executed', {
      executionId: result.id,
      sessionId: session.id,
      runtime: request.runtime,
      exitCode,
      duration,
      truncated,
      codeLength: request.code.length,
    });

    return result;
  }

  // ── Session management ──────────────────────────────────────────

  async createSession(runtime: RuntimeType): Promise<ExecutionSession> {
    if (!this.config.allowedRuntimes.includes(runtime)) {
      throw new Error(
        `Runtime '${runtime}' is not allowed. Allowed: ${this.config.allowedRuntimes.join(', ')}`
      );
    }

    const { sessions: allSessions } = await this.deps.storage.listSessions();
    const activeSessions = allSessions.filter((s) => s.status === 'active');
    if (activeSessions.length >= this.config.maxConcurrent) {
      throw new Error(`Maximum concurrent sessions (${this.config.maxConcurrent}) reached`);
    }

    const session = await this.deps.storage.createSession({ runtime });

    await this.auditRecord('session_created', {
      sessionId: session.id,
      runtime,
    });

    return session;
  }

  async getSession(id: string): Promise<ExecutionSession | null> {
    return this.deps.storage.getSession(id);
  }

  async listSessions(opts?: { limit?: number; offset?: number }): Promise<{ sessions: ExecutionSession[]; total: number }> {
    return this.deps.storage.listSessions(opts);
  }

  async terminateSession(id: string): Promise<boolean> {
    const session = await this.deps.storage.getSession(id);
    if (!session) return false;
    if (session.status !== 'active') return false;

    const adapter = this.runtimes.get(session.runtime);
    if (adapter) {
      await adapter.cleanup(session);
    }

    const updated = await this.deps.storage.updateSession(id, {
      status: 'terminated',
    });

    if (updated) {
      await this.auditRecord('session_terminated', { sessionId: id });
    }

    return updated !== null;
  }

  // ── Approval workflow ───────────────────────────────────────────

  async approve(requestId: string): Promise<ApprovalRecord | null> {
    const approval = await this.deps.storage.updateApproval(requestId, 'approved');

    if (approval) {
      await this.auditRecord('execution_approved', {
        approvalId: approval.id,
        requestId: approval.requestId,
      });
    }

    return approval;
  }

  async reject(requestId: string): Promise<ApprovalRecord | null> {
    const approval = await this.deps.storage.updateApproval(requestId, 'rejected');

    if (approval) {
      await this.auditRecord('execution_rejected', {
        approvalId: approval.id,
        requestId: approval.requestId,
      });
    }

    return approval;
  }

  async listPendingApprovals(): Promise<ApprovalRecord[]> {
    return this.deps.storage.listPendingApprovals();
  }

  // ── Execution history ───────────────────────────────────────────

  async getExecutionHistory(filter?: {
    sessionId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ executions: ExecutionResult[]; total: number }> {
    return this.deps.storage.listExecutions(filter);
  }

  // ── Config ──────────────────────────────────────────────────────

  getConfig(): ExecutionConfig {
    return this.config;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  async cleanup(): Promise<void> {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
      this.expiryTimer = null;
    }
    this.deps.logger.debug('CodeExecutionManager cleaned up', {
      component: 'execution',
    });
  }

  // ── Private helpers ─────────────────────────────────────────────

  private async expireStaleSessions(): Promise<void> {
    try {
      const { sessions } = await this.deps.storage.listSessions();
      const now = Date.now();
      for (const session of sessions) {
        if (
          session.status === 'active' &&
          now - session.lastActivity > this.config.sessionTimeout
        ) {
          await this.deps.storage.updateSession(session.id, {
            status: 'expired',
          });
          this.deps.logger.debug('Expired stale session', {
            component: 'execution',
            taskId: session.id,
          });
        }
      }
    } catch (err) {
      this.deps.logger.warn('Failed to expire stale sessions', {
        component: 'execution',
      });
    }
  }

  private async auditRecord(event: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      await this.deps.auditChain.record({
        event,
        level: 'info',
        message: `Code execution: ${event}`,
        metadata,
      });
    } catch {
      this.deps.logger.warn('Failed to record execution audit event', {
        component: 'execution',
      });
    }
  }
}

export class ApprovalRequiredError extends Error {
  public readonly approvalId: string;

  constructor(message: string, approvalId: string) {
    super(message);
    this.name = 'ApprovalRequiredError';
    this.approvalId = approvalId;
  }
}
