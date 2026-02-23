/**
 * Tests for the dynamic-tool portions of creation-tool-executor:
 *   - 'register_dynamic_tool' case
 *   - default case dynamic-tool dispatch
 *
 * Other cases (create_skill, create_task, etc.) are exercised by integration
 * tests in soul.test.ts and the per-manager unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCreationTool } from './creation-tool-executor.js';
import type { ToolCall } from '@secureyeoman/shared';

// ── Minimal DynamicToolManager mock ──────────────────────────────────────────

function makeDtm(opts: {
  has?: boolean;
  registerResult?: unknown;
  registerError?: Error;
  executeResult?: { output: unknown; isError: boolean };
} = {}) {
  return {
    has: vi.fn().mockReturnValue(opts.has ?? false),
    register: opts.registerError
      ? vi.fn().mockRejectedValue(opts.registerError)
      : vi.fn().mockResolvedValue(opts.registerResult ?? { id: 'dt-1', name: 'my_tool' }),
    execute: vi.fn().mockResolvedValue(
      opts.executeResult ?? { output: { answer: 42 }, isError: false }
    ),
  };
}

// ── Minimal SecureYeoman mock ─────────────────────────────────────────────────

function makeSecureYeoman(dtm?: ReturnType<typeof makeDtm>) {
  return {
    getDynamicToolManager: vi.fn().mockReturnValue(dtm ?? null),
    // Stub out other managers used by different cases so they don't throw.
    getSoulManager: vi.fn().mockReturnValue({
      createSkill: vi.fn().mockResolvedValue({ id: 's-1', name: 'Skill' }),
      updateSkill: vi.fn().mockResolvedValue({ id: 's-1' }),
      deleteSkill: vi.fn().mockResolvedValue(undefined),
    }),
    getTaskStorage: vi.fn().mockReturnValue(null),
    getTaskExecutor: vi.fn().mockReturnValue(null),
    getSubAgentManager: vi.fn().mockReturnValue(null),
    getSwarmManager: vi.fn().mockReturnValue(null),
    getExperimentManager: vi.fn().mockReturnValue(null),
    getA2AManager: vi.fn().mockReturnValue(null),
    getWorkflowManager: vi.fn().mockReturnValue(null),
  };
}

function makeToolCall(name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id: 'tc-1', name, arguments: args };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('executeCreationTool — register_dynamic_tool', () => {
  describe('when DynamicToolManager is not available', () => {
    it('returns an error result', async () => {
      const sy = makeSecureYeoman(); // dtm is null
      const result = await executeCreationTool(
        makeToolCall('register_dynamic_tool', {
          name: 'my_tool',
          description: 'does stuff',
          parameters: {},
          implementation: 'return 1;',
        }),
        sy as any
      );
      expect(result.isError).toBe(true);
      expect((result.output as { error: string }).error).toMatch(/not enabled/i);
    });

    it('does not call getDynamicToolManager.register', async () => {
      const sy = makeSecureYeoman();
      await executeCreationTool(
        makeToolCall('register_dynamic_tool', { name: 'x', description: '', parameters: {}, implementation: '' }),
        sy as any
      );
      // getDynamicToolManager was called but returned null, so register was never reached
      expect(sy.getDynamicToolManager).toHaveBeenCalled();
    });
  });

  describe('when DynamicToolManager is available', () => {
    it('calls dtm.register with the correct arguments', async () => {
      const dtm = makeDtm();
      const sy = makeSecureYeoman(dtm);
      const ctx = { personalityId: 'p-1', personalityName: 'FRIDAY' };

      await executeCreationTool(
        makeToolCall('register_dynamic_tool', {
          name: 'add_numbers',
          description: 'Adds two numbers',
          parameters: { type: 'object' },
          implementation: 'return args.a + args.b;',
        }),
        sy as any,
        ctx
      );

      expect(dtm.register).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'add_numbers',
          description: 'Adds two numbers',
          parametersSchema: { type: 'object' },
          implementation: 'return args.a + args.b;',
          personalityId: 'p-1',
          createdBy: 'FRIDAY',
        })
      );
    });

    it('returns isError false and the tool on success', async () => {
      const registered = { id: 'dt-99', name: 'my_tool', description: 'desc' };
      const dtm = makeDtm({ registerResult: registered });
      const sy = makeSecureYeoman(dtm);

      const result = await executeCreationTool(
        makeToolCall('register_dynamic_tool', { name: 'my_tool', description: 'desc', parameters: {}, implementation: 'return 1;' }),
        sy as any
      );

      expect(result.isError).toBe(false);
      expect((result.output as { tool: unknown }).tool).toEqual(registered);
    });

    it('returns isError true when dtm.register throws', async () => {
      const dtm = makeDtm({ registerError: new Error('forbidden pattern: eval()') });
      const sy = makeSecureYeoman(dtm);

      const result = await executeCreationTool(
        makeToolCall('register_dynamic_tool', { name: 'bad', description: '', parameters: {}, implementation: 'eval("x")' }),
        sy as any
      );

      expect(result.isError).toBe(true);
      expect((result.output as { error: string }).error).toContain('forbidden pattern');
    });

    it('uses empty string for description when not provided', async () => {
      const dtm = makeDtm();
      const sy = makeSecureYeoman(dtm);

      await executeCreationTool(
        makeToolCall('register_dynamic_tool', { name: 'tool', parameters: {}, implementation: 'return 1;' }),
        sy as any
      );

      expect(dtm.register).toHaveBeenCalledWith(
        expect.objectContaining({ description: '' })
      );
    });

    it('uses null personalityId and "ai" as createdBy when no context', async () => {
      const dtm = makeDtm();
      const sy = makeSecureYeoman(dtm);

      await executeCreationTool(
        makeToolCall('register_dynamic_tool', { name: 'tool', description: '', parameters: {}, implementation: 'return 1;' }),
        sy as any
        // no context argument
      );

      expect(dtm.register).toHaveBeenCalledWith(
        expect.objectContaining({ personalityId: null, createdBy: 'ai' })
      );
    });
  });
});

describe('executeCreationTool — dynamic tool dispatch (default case)', () => {
  describe('when the tool name is not a registered dynamic tool', () => {
    it('returns an "unknown tool" error', async () => {
      const dtm = makeDtm({ has: false });
      const sy = makeSecureYeoman(dtm);

      const result = await executeCreationTool(makeToolCall('completely_unknown_tool'), sy as any);

      expect(result.isError).toBe(true);
      expect((result.output as { error: string }).error).toMatch(/unknown tool/i);
    });

    it('checks dtm.has before reporting unknown', async () => {
      const dtm = makeDtm({ has: false });
      const sy = makeSecureYeoman(dtm);

      await executeCreationTool(makeToolCall('unknown_xyz'), sy as any);

      expect(dtm.has).toHaveBeenCalledWith('unknown_xyz');
    });

    it('does not call dtm.execute when has returns false', async () => {
      const dtm = makeDtm({ has: false });
      const sy = makeSecureYeoman(dtm);

      await executeCreationTool(makeToolCall('unknown_xyz'), sy as any);

      expect(dtm.execute).not.toHaveBeenCalled();
    });
  });

  describe('when getDynamicToolManager returns null', () => {
    it('returns an "unknown tool" error without throwing', async () => {
      const sy = makeSecureYeoman(); // null DTM
      const result = await executeCreationTool(makeToolCall('some_unknown_tool'), sy as any);
      expect(result.isError).toBe(true);
      expect((result.output as { error: string }).error).toMatch(/unknown tool/i);
    });
  });

  describe('when the tool name IS a registered dynamic tool', () => {
    it('calls dtm.execute with the tool name and args', async () => {
      const dtm = makeDtm({ has: true });
      const sy = makeSecureYeoman(dtm);

      await executeCreationTool(
        makeToolCall('my_custom_tool', { x: 10, y: 20 }),
        sy as any
      );

      expect(dtm.execute).toHaveBeenCalledWith('my_custom_tool', { x: 10, y: 20 });
    });

    it('returns the result from dtm.execute on success', async () => {
      const dtm = makeDtm({ has: true, executeResult: { output: { result: 'hello' }, isError: false } });
      const sy = makeSecureYeoman(dtm);

      const result = await executeCreationTool(makeToolCall('my_custom_tool'), sy as any);

      expect(result.isError).toBe(false);
      expect(result.output).toEqual({ result: 'hello' });
    });

    it('propagates isError true from dtm.execute', async () => {
      const dtm = makeDtm({
        has: true,
        executeResult: { output: { error: 'execution failed' }, isError: true },
      });
      const sy = makeSecureYeoman(dtm);

      const result = await executeCreationTool(makeToolCall('my_custom_tool'), sy as any);

      expect(result.isError).toBe(true);
      expect((result.output as { error: string }).error).toBe('execution failed');
    });
  });
});
