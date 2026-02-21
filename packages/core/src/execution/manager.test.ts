import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodeExecutionManager, ApprovalRequiredError } from './manager.js';
import type { ExecutionConfig } from '@secureyeoman/shared';

// ── Helpers ─────────────────────────────────────────────────────────

const SESSION = {
  id: 'sess-1',
  runtime: 'node' as const,
  createdAt: 1000,
  lastActivity: Date.now(),
  status: 'active' as const,
};

const EXECUTION_RESULT = {
  id: 'exec-1',
  sessionId: 'sess-1',
  exitCode: 0,
  stdout: 'Hello, world!\n',
  stderr: '',
  duration: 50,
  truncated: false,
};

const APPROVAL = {
  id: 'appr-1',
  requestId: 'req-1',
  status: 'pending' as const,
  requestedAt: 1000,
};

function makeMockStorage() {
  return {
    listSessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
    getSession: vi.fn().mockResolvedValue(SESSION),
    createSession: vi.fn().mockResolvedValue(SESSION),
    updateSession: vi.fn().mockResolvedValue(SESSION),
    recordExecution: vi.fn().mockResolvedValue(EXECUTION_RESULT),
    listExecutions: vi.fn().mockResolvedValue({ executions: [EXECUTION_RESULT], total: 1 }),
    createApproval: vi.fn().mockResolvedValue(APPROVAL),
    updateApproval: vi.fn().mockResolvedValue({ ...APPROVAL, status: 'approved' }),
    listPendingApprovals: vi.fn().mockResolvedValue([APPROVAL]),
  };
}

function makeMockLogger() {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function makeMockAuditChain() {
  return {
    record: vi.fn().mockResolvedValue(undefined),
  };
}

const BASE_CONFIG: ExecutionConfig = {
  enabled: true,
  allowedRuntimes: ['node', 'python', 'shell'],
  maxConcurrent: 5,
  sessionTimeout: 3600000,
  approvalPolicy: 'none',
  secretPatterns: [],
};

function buildManager(configOverrides?: Partial<ExecutionConfig>, storageOverrides?: object) {
  const storage = { ...makeMockStorage(), ...storageOverrides };
  const logger = makeMockLogger();
  const auditChain = makeMockAuditChain();
  const config = { ...BASE_CONFIG, ...configOverrides };
  const manager = new CodeExecutionManager(config, {
    storage: storage as any,
    logger: logger as any,
    auditChain: auditChain as any,
  });
  return { manager, storage, logger, auditChain };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('CodeExecutionManager — initialization', () => {
  it('initializes and expires stale sessions', async () => {
    vi.useFakeTimers();
    const staleSession = {
      ...SESSION,
      status: 'active' as const,
      lastActivity: Date.now() - 9999999,
    };
    const { manager, storage } = buildManager(undefined, {
      listSessions: vi.fn().mockResolvedValue({ sessions: [staleSession], total: 1 }),
    });
    await manager.initialize();
    expect(storage.updateSession).toHaveBeenCalledWith(SESSION.id, { status: 'expired' });
    await manager.cleanup();
    vi.useRealTimers();
  });

  it('cleanup stops the expiry timer', async () => {
    vi.useFakeTimers();
    const { manager } = buildManager();
    await manager.initialize();
    await expect(manager.cleanup()).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe('CodeExecutionManager.execute — validation errors', () => {
  it('throws when execution is disabled', async () => {
    const { manager } = buildManager({ enabled: false });
    await expect(manager.execute({ runtime: 'node', code: 'console.log("hi")' })).rejects.toThrow(
      'disabled'
    );
  });

  it('throws when runtime is not allowed', async () => {
    const { manager } = buildManager({ allowedRuntimes: ['python'] });
    await expect(manager.execute({ runtime: 'node', code: 'x' })).rejects.toThrow('not allowed');
  });

  it('throws when code validation fails', async () => {
    const { manager } = buildManager();
    // dangerous Node pattern
    await expect(
      manager.execute({ runtime: 'node', code: "require('child_process')" })
    ).rejects.toThrow('validation failed');
  });
});

describe('CodeExecutionManager.execute — approval policies', () => {
  it('throws ApprovalRequiredError when policy is "always"', async () => {
    const { manager } = buildManager({ approvalPolicy: 'always' });
    await expect(manager.execute({ runtime: 'node', code: 'console.log("safe")' })).rejects.toThrow(
      ApprovalRequiredError
    );
  });

  it('throws ApprovalRequiredError for first-time runtime when policy is "first-time"', async () => {
    const { manager } = buildManager(
      { approvalPolicy: 'first-time' },
      { listSessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }) }
    );
    await expect(manager.execute({ runtime: 'node', code: 'console.log("safe")' })).rejects.toThrow(
      ApprovalRequiredError
    );
  });

  it('does NOT throw for already-used runtime when policy is "first-time"', async () => {
    const existingSession = { ...SESSION, runtime: 'node' as const, status: 'active' as const };
    const storage = makeMockStorage();
    storage.listSessions
      // First call checks sessions for approval (has node session already)
      .mockResolvedValueOnce({ sessions: [existingSession], total: 1 })
      // Second call for creating new session checks concurrent limit
      .mockResolvedValueOnce({ sessions: [], total: 0 });
    storage.createSession.mockResolvedValue(existingSession);

    const manager = new CodeExecutionManager(
      { ...BASE_CONFIG, approvalPolicy: 'first-time' },
      {
        storage: storage as any,
        logger: makeMockLogger() as any,
        auditChain: makeMockAuditChain() as any,
      }
    );

    // Mock the runtime to return output
    const mockRuntime = manager['runtimes'].get('node')!;
    vi.spyOn(mockRuntime, 'execute').mockImplementation(async function* () {
      yield { stream: 'stdout' as const, data: 'Hello\n', timestamp: Date.now() };
    });

    await expect(
      manager.execute({ runtime: 'node', code: 'console.log("safe")' })
    ).resolves.toBeDefined();
  });
});

describe('CodeExecutionManager.execute — session management', () => {
  it('throws when session not found', async () => {
    const { manager } = buildManager(undefined, {
      listSessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
      getSession: vi.fn().mockResolvedValue(null),
    });
    await expect(
      manager.execute({ runtime: 'node', code: 'x', sessionId: 'bad-session' })
    ).rejects.toThrow('not found');
  });

  it('throws when session is not active', async () => {
    const { manager } = buildManager(undefined, {
      getSession: vi.fn().mockResolvedValue({ ...SESSION, status: 'expired' }),
    });
    await expect(
      manager.execute({ runtime: 'node', code: 'x', sessionId: 'sess-1' })
    ).rejects.toThrow('expired');
  });

  it('throws when session runtime mismatches request runtime', async () => {
    const { manager } = buildManager(undefined, {
      getSession: vi.fn().mockResolvedValue({ ...SESSION, runtime: 'python' }),
    });
    await expect(
      manager.execute({ runtime: 'node', code: 'x', sessionId: 'sess-1' })
    ).rejects.toThrow('mismatch');
  });

  it('throws when max concurrent sessions reached (no sessionId)', async () => {
    const activeSessions = Array.from({ length: 5 }, (_, i) => ({ ...SESSION, id: `sess-${i}` }));
    const { manager } = buildManager(
      { maxConcurrent: 5 },
      { listSessions: vi.fn().mockResolvedValue({ sessions: activeSessions, total: 5 }) }
    );
    await expect(manager.execute({ runtime: 'node', code: 'console.log("safe")' })).rejects.toThrow(
      'Maximum concurrent'
    );
  });
});

describe('CodeExecutionManager — session CRUD', () => {
  it('getSession delegates to storage', async () => {
    const { manager, storage } = buildManager();
    await manager.getSession('sess-1');
    expect(storage.getSession).toHaveBeenCalledWith('sess-1');
  });

  it('listSessions delegates to storage', async () => {
    const { manager, storage } = buildManager();
    await manager.listSessions({ limit: 10, offset: 0 });
    expect(storage.listSessions).toHaveBeenCalledWith({ limit: 10, offset: 0 });
  });

  it('createSession throws for disallowed runtime', async () => {
    const { manager } = buildManager({ allowedRuntimes: ['python'] });
    await expect(manager.createSession('node')).rejects.toThrow('not allowed');
  });

  it('createSession creates and returns session', async () => {
    const { manager, storage } = buildManager(undefined, {
      listSessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
    });
    const sess = await manager.createSession('node');
    expect(sess.id).toBe('sess-1');
    expect(storage.createSession).toHaveBeenCalledWith({ runtime: 'node' });
  });

  it('terminateSession returns false when session not found', async () => {
    const { manager } = buildManager(undefined, {
      getSession: vi.fn().mockResolvedValue(null),
    });
    const result = await manager.terminateSession('missing');
    expect(result).toBe(false);
  });

  it('terminateSession returns false when session not active', async () => {
    const { manager } = buildManager(undefined, {
      getSession: vi.fn().mockResolvedValue({ ...SESSION, status: 'expired' }),
    });
    const result = await manager.terminateSession('sess-1');
    expect(result).toBe(false);
  });

  it('terminateSession updates status to terminated', async () => {
    const { manager, storage } = buildManager(undefined, {
      updateSession: vi.fn().mockResolvedValue({ ...SESSION, status: 'terminated' }),
    });
    const result = await manager.terminateSession('sess-1');
    expect(result).toBe(true);
    expect(storage.updateSession).toHaveBeenCalledWith('sess-1', { status: 'terminated' });
  });
});

describe('CodeExecutionManager — approval workflow', () => {
  it('approve updates approval status', async () => {
    const { manager, storage } = buildManager();
    const approval = await manager.approve('req-1');
    expect(approval?.status).toBe('approved');
    expect(storage.updateApproval).toHaveBeenCalledWith('req-1', 'approved');
  });

  it('reject updates approval status', async () => {
    const { manager, storage } = buildManager(undefined, {
      updateApproval: vi.fn().mockResolvedValue({ ...APPROVAL, status: 'rejected' }),
    });
    const approval = await manager.reject('req-1');
    expect(approval?.status).toBe('rejected');
  });

  it('listPendingApprovals returns pending approvals', async () => {
    const { manager } = buildManager();
    const pending = await manager.listPendingApprovals();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.status).toBe('pending');
  });
});

describe('CodeExecutionManager — getConfig', () => {
  it('returns the config', () => {
    const { manager } = buildManager();
    expect(manager.getConfig().enabled).toBe(true);
  });
});

describe('ApprovalRequiredError', () => {
  it('has approvalId property', () => {
    const err = new ApprovalRequiredError('test', 'appr-99');
    expect(err.approvalId).toBe('appr-99');
    expect(err.name).toBe('ApprovalRequiredError');
    expect(err.message).toBe('test');
  });
});
