/**
 * Tests for creation-tool-executor:
 *   - 'create_task' case — executor executes and returns; does NOT own storage
 *   - 'delete_personality' case — self-deletion guard + deletionProtected guard
 *   - 'delete_custom_role' / 'revoke_role' — RBAC delegation
 *   - 'delete_experiment' — experiment manager delegation
 *   - 'register_dynamic_tool' case
 *   - default case dynamic-tool dispatch
 *
 * Other cases (create_skill, etc.) are exercised by integration
 * tests in soul.test.ts and the per-manager unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCreationTool } from './creation-tool-executor.js';
import type { ToolCall } from '@secureyeoman/shared';

// ── Mock rbac module (used by delete_custom_role, revoke_role, assign_role) ───

const mockRbac = {
  removeRole: vi.fn(),
  revokeUserRole: vi.fn(),
  assignUserRole: vi.fn(),
  defineRole: vi.fn(),
};

vi.mock('../security/rbac.js', () => ({
  getRBAC: vi.fn(() => mockRbac),
}));

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
      deletePersonality: vi.fn().mockResolvedValue(undefined),
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

beforeEach(() => {
  mockRbac.removeRole.mockReset();
  mockRbac.revokeUserRole.mockReset();
  mockRbac.assignUserRole.mockReset();
  mockRbac.defineRole.mockReset();
});

describe('executeCreationTool — create_task', () => {
  describe('without a taskExecutor', () => {
    it('returns a pending task object', async () => {
      const sy = makeSecureYeoman();
      const result = await executeCreationTool(
        makeToolCall('create_task', { name: 'My Task', type: 'execute' }),
        sy as any
      );
      expect(result.isError).toBe(false);
      const task = (result.output as { task: Record<string, unknown> }).task;
      expect(task.name).toBe('My Task');
      expect(task.status).toBe('pending');
    });

    it('does not call getTaskStorage — storage is the caller\'s responsibility', async () => {
      const sy = makeSecureYeoman();
      await executeCreationTool(
        makeToolCall('create_task', { name: 'My Task' }),
        sy as any
      );
      expect(sy.getTaskStorage).not.toHaveBeenCalled();
    });

    it('includes a generated id in the returned task', async () => {
      const sy = makeSecureYeoman();
      const result = await executeCreationTool(
        makeToolCall('create_task', { name: 'Named Task' }),
        sy as any
      );
      const task = (result.output as { task: Record<string, unknown> }).task;
      expect(typeof task.id).toBe('string');
      expect((task.id as string).length).toBeGreaterThan(0);
    });
  });

  describe('with taskExecutor that succeeds', () => {
    it('returns the executorTask from submit()', async () => {
      const executorTask = { id: 'exec-1', name: 'My Task', status: 'pending' };
      const sy = {
        ...makeSecureYeoman(),
        getTaskExecutor: vi.fn().mockReturnValue({
          submit: vi.fn().mockResolvedValue(executorTask),
        }),
      };
      const result = await executeCreationTool(
        makeToolCall('create_task', { name: 'My Task' }),
        sy as any
      );
      expect(result.isError).toBe(false);
      expect((result.output as { task: unknown }).task).toEqual(executorTask);
    });

    it('passes name, description, input, and timeoutMs to submit()', async () => {
      const mockSubmit = vi.fn().mockResolvedValue({ id: 'exec-2', name: 'Typed Task', status: 'pending' });
      const sy = {
        ...makeSecureYeoman(),
        getTaskExecutor: vi.fn().mockReturnValue({ submit: mockSubmit }),
      };
      await executeCreationTool(
        makeToolCall('create_task', {
          name: 'Typed Task',
          description: 'does stuff',
          input: { key: 'value' },
          timeoutMs: 60000,
        }),
        sy as any
      );
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Typed Task',
          description: 'does stuff',
          input: { key: 'value' },
          timeoutMs: 60000,
        }),
        expect.objectContaining({ userId: 'ai', role: 'operator' })
      );
    });
  });

  describe('with taskExecutor that throws', () => {
    it('falls back to returning the local pending task', async () => {
      const sy = {
        ...makeSecureYeoman(),
        getTaskExecutor: vi.fn().mockReturnValue({
          submit: vi.fn().mockRejectedValue(new Error('executor unavailable')),
        }),
      };
      const result = await executeCreationTool(
        makeToolCall('create_task', { name: 'Fallback Task', type: 'execute' }),
        sy as any
      );
      expect(result.isError).toBe(false);
      const task = (result.output as { task: Record<string, unknown> }).task;
      expect(task.name).toBe('Fallback Task');
      expect(task.status).toBe('pending');
    });

    it('does not propagate the executor error', async () => {
      const sy = {
        ...makeSecureYeoman(),
        getTaskExecutor: vi.fn().mockReturnValue({
          submit: vi.fn().mockRejectedValue(new Error('boom')),
        }),
      };
      await expect(
        executeCreationTool(makeToolCall('create_task', { name: 'Task' }), sy as any)
      ).resolves.toMatchObject({ isError: false });
    });
  });
});

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

describe('executeCreationTool — delete_personality', () => {
  it('blocks self-deletion when context.personalityId matches the target id', async () => {
    const sy = makeSecureYeoman();
    const ctx = { personalityId: 'p-self', personalityName: 'FRIDAY' };

    const result = await executeCreationTool(
      makeToolCall('delete_personality', { id: 'p-self' }),
      sy as any,
      ctx
    );

    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/cannot delete itself/i);
  });

  it('does not call soulManager.deletePersonality when self-deletion is blocked', async () => {
    const sy = makeSecureYeoman();
    const soulMgr = sy.getSoulManager();
    const ctx = { personalityId: 'p-self' };

    await executeCreationTool(makeToolCall('delete_personality', { id: 'p-self' }), sy as any, ctx);

    expect(soulMgr.deletePersonality).not.toHaveBeenCalled();
  });

  it('returns isError true when soulManager.deletePersonality throws (e.g. deletionProtected)', async () => {
    const sy = makeSecureYeoman();
    sy.getSoulManager().deletePersonality = vi.fn().mockRejectedValue(
      new Error('This personality is protected from deletion. Disable "Protected from deletion" in its settings first.')
    );

    const result = await executeCreationTool(
      makeToolCall('delete_personality', { id: 'p-other' }),
      sy as any,
      { personalityId: 'p-self' }
    );

    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/protected from deletion/i);
  });

  it('returns { deleted: true, id } on success', async () => {
    const sy = makeSecureYeoman();

    const result = await executeCreationTool(
      makeToolCall('delete_personality', { id: 'p-other' }),
      sy as any,
      { personalityId: 'p-self' }
    );

    expect(result.isError).toBe(false);
    expect(result.output).toEqual({ deleted: true, id: 'p-other' });
  });

  it('allows deletion when no context is provided (no self-deletion risk)', async () => {
    const sy = makeSecureYeoman();

    const result = await executeCreationTool(
      makeToolCall('delete_personality', { id: 'p-some' }),
      sy as any
      // no context
    );

    expect(result.isError).toBe(false);
  });
});

describe('executeCreationTool — delete_custom_role', () => {
  it('returns { deleted: true, roleId } when removeRole returns true', async () => {
    mockRbac.removeRole.mockResolvedValue(true);
    const sy = makeSecureYeoman();

    const result = await executeCreationTool(
      makeToolCall('delete_custom_role', { roleId: 'analyst' }),
      sy as any
    );

    expect(result.isError).toBe(false);
    expect(result.output).toEqual({ deleted: true, roleId: 'analyst' });
  });

  it('returns isError true when removeRole returns false (not found)', async () => {
    mockRbac.removeRole.mockResolvedValue(false);
    const sy = makeSecureYeoman();

    const result = await executeCreationTool(
      makeToolCall('delete_custom_role', { roleId: 'missing-role' }),
      sy as any
    );

    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/not found or cannot be deleted/i);
  });

  it('calls removeRole with the provided roleId', async () => {
    mockRbac.removeRole.mockResolvedValue(true);
    const sy = makeSecureYeoman();

    await executeCreationTool(
      makeToolCall('delete_custom_role', { roleId: 'scanner' }),
      sy as any
    );

    expect(mockRbac.removeRole).toHaveBeenCalledWith('scanner');
  });
});

describe('executeCreationTool — revoke_role', () => {
  it('returns { revoked: true, userId } on success', async () => {
    mockRbac.revokeUserRole.mockResolvedValue(undefined);
    const sy = makeSecureYeoman();

    const result = await executeCreationTool(
      makeToolCall('revoke_role', { userId: 'user-123' }),
      sy as any
    );

    expect(result.isError).toBe(false);
    expect(result.output).toEqual({ revoked: true, userId: 'user-123' });
  });

  it('calls revokeUserRole with the provided userId', async () => {
    mockRbac.revokeUserRole.mockResolvedValue(undefined);
    const sy = makeSecureYeoman();

    await executeCreationTool(
      makeToolCall('revoke_role', { userId: 'user-abc' }),
      sy as any
    );

    expect(mockRbac.revokeUserRole).toHaveBeenCalledWith('user-abc');
  });
});

describe('executeCreationTool — delete_experiment', () => {
  it('returns isError true when experiment manager is not available', async () => {
    const sy = makeSecureYeoman(); // getExperimentManager returns null

    const result = await executeCreationTool(
      makeToolCall('delete_experiment', { id: 'exp-1' }),
      sy as any
    );

    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/experiment manager not available/i);
  });

  it('returns { deleted: true, id } on success', async () => {
    const mockExpManager = { delete: vi.fn().mockResolvedValue(undefined) };
    const sy = {
      ...makeSecureYeoman(),
      getExperimentManager: vi.fn().mockReturnValue(mockExpManager),
    };

    const result = await executeCreationTool(
      makeToolCall('delete_experiment', { id: 'exp-99' }),
      sy as any
    );

    expect(result.isError).toBe(false);
    expect(result.output).toEqual({ deleted: true, id: 'exp-99' });
  });

  it('calls experimentManager.delete with the provided id', async () => {
    const mockExpManager = { delete: vi.fn().mockResolvedValue(undefined) };
    const sy = {
      ...makeSecureYeoman(),
      getExperimentManager: vi.fn().mockReturnValue(mockExpManager),
    };

    await executeCreationTool(
      makeToolCall('delete_experiment', { id: 'exp-42' }),
      sy as any
    );

    expect(mockExpManager.delete).toHaveBeenCalledWith('exp-42');
  });
});
