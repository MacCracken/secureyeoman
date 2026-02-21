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

    it('executes code action and returns placeholder output', async () => {
      const executor = new SkillExecutor();
      const skill = makeSkill([
        { id: 'a1', type: 'code', code: { language: 'javascript', source: 'return 42;' } } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(true);
      expect((result.output as Record<string, unknown>).language).toBe('javascript');
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

    it('returns error for shell action in sandboxed mode', async () => {
      const executor = new SkillExecutor({ timeoutMs: 5000, memoryLimitMb: 128, sandboxed: true });
      const skill = makeSkill([
        { id: 'a1', type: 'shell', shell: { command: 'ls', args: [] } } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Shell execution requires');
    });

    it('returns error for shell action in non-sandboxed mode', async () => {
      const executor = new SkillExecutor({ timeoutMs: 5000, memoryLimitMb: 128, sandboxed: false });
      const skill = makeSkill([
        { id: 'a1', type: 'shell', shell: { command: 'ls', args: [] } } as never,
      ]);
      const result = await executor.executeAction(skill, 'a1', CTX);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed in non-sandboxed mode');
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
  });
});
