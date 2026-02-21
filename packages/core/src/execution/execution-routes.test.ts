import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerExecutionRoutes } from './execution-routes.js';
import { ApprovalRequiredError } from './manager.js';
import type { CodeExecutionManager } from './manager.js';

// ── Mock data ────────────────────────────────────────────────────────

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
  status: 'approved' as const,
  requestedAt: 1000,
};

function makeMockManager(overrides?: Partial<CodeExecutionManager>): CodeExecutionManager {
  return {
    execute: vi.fn().mockResolvedValue(EXECUTION_RESULT),
    listSessions: vi.fn().mockResolvedValue({ sessions: [SESSION], total: 1 }),
    getSession: vi.fn().mockResolvedValue(SESSION),
    terminateSession: vi.fn().mockResolvedValue(true),
    getExecutionHistory: vi.fn().mockResolvedValue({ executions: [EXECUTION_RESULT], total: 1 }),
    approve: vi.fn().mockResolvedValue(APPROVAL),
    reject: vi.fn().mockResolvedValue({ ...APPROVAL, status: 'rejected' }),
    getConfig: vi
      .fn()
      .mockReturnValue({ enabled: true, allowedRuntimes: ['node', 'python', 'shell'] }),
    listPendingApprovals: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as CodeExecutionManager;
}

function buildApp(overrides?: Partial<CodeExecutionManager>) {
  const app = Fastify();
  registerExecutionRoutes(app, { executionManager: makeMockManager(overrides) });
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('POST /api/v1/execution/run', () => {
  it('executes code and returns 202', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/execution/run',
      payload: { runtime: 'node', code: 'console.log("hello")' },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().id).toBe('exec-1');
  });

  it('returns 202 with approvalId when ApprovalRequiredError is thrown', async () => {
    const app = buildApp({
      execute: vi.fn().mockRejectedValue(new ApprovalRequiredError('approval required', 'appr-99')),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/execution/run',
      payload: { runtime: 'node', code: 'console.log("hello")' },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe('pending_approval');
    expect(body.approvalId).toBe('appr-99');
  });

  it('returns 400 on generic error', async () => {
    const app = buildApp({
      execute: vi.fn().mockRejectedValue(new Error('runtime not allowed')),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/execution/run',
      payload: { runtime: 'node', code: 'bad code' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('passes sessionId and timeout to execute', async () => {
    const executeMock = vi.fn().mockResolvedValue(EXECUTION_RESULT);
    const app = buildApp({ execute: executeMock });
    await app.inject({
      method: 'POST',
      url: '/api/v1/execution/run',
      payload: { runtime: 'node', code: 'x', sessionId: 'sess-1', timeout: 5000 },
    });
    expect(executeMock).toHaveBeenCalledWith({
      runtime: 'node',
      code: 'x',
      sessionId: 'sess-1',
      timeout: 5000,
    });
  });
});

describe('GET /api/v1/execution/sessions', () => {
  it('returns list of sessions', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/execution/sessions' });
    expect(res.statusCode).toBe(200);
    expect(res.json().sessions).toHaveLength(1);
    expect(res.json().sessions[0].id).toBe('sess-1');
  });

  it('passes limit and offset query params', async () => {
    const listMock = vi.fn().mockResolvedValue({ sessions: [], total: 0 });
    const app = buildApp({ listSessions: listMock });
    await app.inject({ method: 'GET', url: '/api/v1/execution/sessions?limit=10&offset=20' });
    expect(listMock).toHaveBeenCalledWith({ limit: 10, offset: 20 });
  });
});

describe('GET /api/v1/execution/sessions/:id', () => {
  it('returns session by ID', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/execution/sessions/sess-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('sess-1');
  });

  it('returns 404 when session not found', async () => {
    const app = buildApp({ getSession: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/execution/sessions/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/execution/sessions/:id', () => {
  it('terminates session and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/execution/sessions/sess-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when session not found or not active', async () => {
    const app = buildApp({ terminateSession: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/execution/sessions/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/execution/history', () => {
  it('returns execution history', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/execution/history' });
    expect(res.statusCode).toBe(200);
    expect(res.json().executions).toHaveLength(1);
  });

  it('passes sessionId, limit, offset query params', async () => {
    const historyMock = vi.fn().mockResolvedValue({ executions: [], total: 0 });
    const app = buildApp({ getExecutionHistory: historyMock });
    await app.inject({
      method: 'GET',
      url: '/api/v1/execution/history?sessionId=sess-1&limit=5&offset=0',
    });
    expect(historyMock).toHaveBeenCalledWith({ sessionId: 'sess-1', limit: 5, offset: 0 });
  });
});

describe('POST /api/v1/execution/approve/:id', () => {
  it('approves pending approval', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/execution/approve/req-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().approval.status).toBe('approved');
  });

  it('returns 404 when approval not found', async () => {
    const app = buildApp({ approve: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'POST', url: '/api/v1/execution/approve/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/execution/approve/:id', () => {
  it('rejects pending approval and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/execution/approve/req-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when approval not found', async () => {
    const app = buildApp({ reject: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/execution/approve/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/execution/config', () => {
  it('returns execution config', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/execution/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.enabled).toBe(true);
  });
});
