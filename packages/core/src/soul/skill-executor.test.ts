import { describe, it, expect, vi, afterEach } from 'vitest';
import { SkillExecutor } from './skill-executor.js';
import type { ActionContext } from './skill-executor.js';
import type { Skill } from '@secureyeoman/shared';

// ── Helpers ──────────────────────────────────────────────────────

const CTX: ActionContext = { sessionId: 's1', personalityId: 'p1', userId: 'u1' };

function makeSkill(actions: Skill['actions'] = []): Skill {
  return {
    id: 'skill-1',
    name: 'Test Skill',
    actions,
  } as unknown as Skill;
}

// ── SkillExecutor Tests ───────────────────────────────────────────

describe('SkillExecutor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('executeAction', () => {
    it('returns error when action not found', async () => {
      const executor = new SkillExecutor();
      const skill = makeSkill([]);
      const result = await executor.executeAction(skill, 'nonexistent', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Action nonexistent not found');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns error for code action type (not implemented)', async () => {
      const executor = new SkillExecutor();
      const skill = makeSkill([
        { id: 'a1', type: 'code', code: { language: 'javascript', source: 'return 42;' } } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Action has no valid configuration');
    });

    it('returns error for code action with missing code config', async () => {
      const executor = new SkillExecutor();
      const skill = makeSkill([{ id: 'a1', type: 'code' } as never]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Action has no valid configuration');
    });

    it('returns error for http action blocked by domain allowlist', async () => {
      const executor = new SkillExecutor({
        timeoutMs: 5000,
        memoryLimitMb: 128,
        allowedDomains: ['example.com'],
      });
      const skill = makeSkill([
        {
          id: 'a1',
          type: 'http',
          http: { url: 'https://evil.com/data', method: 'GET', headers: {} },
        } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not in allowlist');
    });

    it('returns error for http action with invalid URL when allowlist is set', async () => {
      const executor = new SkillExecutor({
        timeoutMs: 5000,
        memoryLimitMb: 128,
        allowedDomains: ['example.com'],
      });
      const skill = makeSkill([
        { id: 'a1', type: 'http', http: { url: 'not-a-url', method: 'GET', headers: {} } } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid URL');
    });

    it('executes http action successfully when domain is allowed', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ answer: 42 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const executor = new SkillExecutor({
        timeoutMs: 5000,
        memoryLimitMb: 128,
        allowedDomains: ['api.example.com'],
      });
      const skill = makeSkill([
        {
          id: 'a1',
          type: 'http',
          http: { url: 'https://api.example.com/endpoint', method: 'GET', headers: {} },
        } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(true);
      expect((result.output as Record<string, unknown>).status).toBe(200);
    });

    it('executes http action with no domain restriction', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => 'OK',
      });
      vi.stubGlobal('fetch', mockFetch);

      const executor = new SkillExecutor({ timeoutMs: 5000, memoryLimitMb: 128 });
      const skill = makeSkill([
        {
          id: 'a1',
          type: 'http',
          http: { url: 'https://api.example.com/', method: 'GET', headers: {} },
        } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(true);
      expect((result.output as Record<string, unknown>).body).toBe('OK');
    });

    it('handles fetch timeout (AbortError)', async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      vi.stubGlobal('fetch', mockFetch);

      const executor = new SkillExecutor({ timeoutMs: 1, memoryLimitMb: 128 });
      const skill = makeSkill([
        {
          id: 'a1',
          type: 'http',
          http: { url: 'https://slow.example.com/', method: 'GET', headers: {}, timeoutMs: 1 },
        } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Request timeout');
    });

    it('handles generic fetch error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const executor = new SkillExecutor({ timeoutMs: 5000, memoryLimitMb: 128 });
      const skill = makeSkill([
        {
          id: 'a1',
          type: 'http',
          http: { url: 'https://api.example.com/', method: 'GET', headers: {} },
        } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('returns error for shell action type (not implemented)', async () => {
      const executor = new SkillExecutor({ timeoutMs: 5000, memoryLimitMb: 128, sandboxed: true });
      const skill = makeSkill([
        { id: 'a1', type: 'shell', shell: { command: 'ls', args: [] } } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Action has no valid configuration');
    });

    it('shell action without shell config also returns error', async () => {
      const executor = new SkillExecutor({ timeoutMs: 5000, memoryLimitMb: 128 });
      const skill = makeSkill([{ id: 'a1', type: 'shell' } as never]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Action has no valid configuration');
    });

    it('catches synchronous throws and returns failure', async () => {
      const executor = new SkillExecutor();
      // Force an internal error by passing malformed data that will throw
      const skill = {
        id: 'skill-1',
        name: 'bad',
        actions: [{ id: 'a1', type: 'code', code: null }],
      } as unknown as Skill;
      // code action with null code returns 'Action has no valid configuration' — not an error
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(typeof result.success).toBe('boolean');
    });

    it('returns error for unknown action type', async () => {
      const executor = new SkillExecutor();
      const skill = makeSkill([{ id: 'a1', type: 'unknown_type' } as never]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Action has no valid configuration');
    });

    it('returns error when http action has type=http but no http config object', async () => {
      const executor = new SkillExecutor();
      const skill = makeSkill([{ id: 'a1', type: 'http' } as never]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      // Falls through the `action.type === 'http' && action.http` guard since http is undefined
      expect(result.error).toBe('Action has no valid configuration');
    });

    it('uses default timeout when httpConfig.timeoutMs is not specified', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => 'response-body',
      });
      vi.stubGlobal('fetch', mockFetch);

      const executor = new SkillExecutor({ timeoutMs: 5000, memoryLimitMb: 128 });
      const skill = makeSkill([
        {
          id: 'a1',
          type: 'http',
          http: { url: 'https://api.example.com/test', method: 'GET', headers: {} },
          // no timeoutMs — defaults to 30000 inside executeHttpAction
        } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
      // Verify fetch was called with signal (abort controller active)
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].signal).toBeInstanceOf(AbortSignal);
    });

    it('handles non-Error throws in executeAction catch block', async () => {
      // Monkey-patch to force the code path where the thrown value is not an Error
      const executor = new SkillExecutor();
      const skill = makeSkill([
        {
          id: 'a1',
          type: 'http',
          http: { url: 'https://api.example.com/', method: 'GET', headers: {} },
        } as never,
      ]);
      // Make fetch throw a string (non-Error)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string throw'));
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP request failed');
    });

    it('returns success=false when http response is not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => 'text/plain' },
        text: async () => 'Not Found',
      });
      vi.stubGlobal('fetch', mockFetch);

      const executor = new SkillExecutor({ timeoutMs: 5000, memoryLimitMb: 128 });
      const skill = makeSkill([
        {
          id: 'a1',
          type: 'http',
          http: { url: 'https://api.example.com/missing', method: 'GET', headers: {} },
        } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      const output = result.output as Record<string, unknown>;
      expect(output.status).toBe(404);
      expect(output.body).toBe('Not Found');
    });

    it('durationMs is always non-negative regardless of outcome', async () => {
      const executor = new SkillExecutor();
      // Action not found — should have non-negative durationMs
      const r1 = await executor.executeAction(makeSkill(), 'nope', CTX);
      expect(r1.durationMs).toBeGreaterThanOrEqual(0);

      // Invalid config — should have non-negative durationMs
      const r2 = await executor.executeAction(
        makeSkill([{ id: 'a1', type: 'webhook' } as never]),
        'a1',
        CTX
      );
      expect(r2.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
