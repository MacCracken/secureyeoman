/**
 * Tests for creation-tool-executor:
 *   - 'create_task' case — executor executes and returns; does NOT own storage
 *   - 'delete_personality' case — self-deletion guard + deletion mode guards
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

function makeApprovalManager() {
  return {
    createApproval: vi.fn().mockResolvedValue({ id: 'appr-1', status: 'pending' }),
  };
}

function makeSecureYeoman(dtm?: ReturnType<typeof makeDtm>) {
  return {
    getDynamicToolManager: vi.fn().mockReturnValue(dtm ?? null),
    // Stub out other managers used by different cases so they don't throw.
    getSoulManager: vi.fn().mockReturnValue({
      createSkill: vi.fn().mockResolvedValue({ id: 's-1', name: 'Skill' }),
      updateSkill: vi.fn().mockResolvedValue({ id: 's-1' }),
      deleteSkill: vi.fn().mockResolvedValue(undefined),
      deletePersonality: vi.fn().mockResolvedValue(undefined),
      getSkill: vi.fn().mockResolvedValue(null),
      getPersonality: vi.fn().mockResolvedValue({
        id: 'p-other',
        body: { resourcePolicy: { deletionMode: 'auto', automationLevel: 'supervised_auto', emergencyStop: false } },
      }),
    }),
    getApprovalManager: vi.fn().mockReturnValue(makeApprovalManager()),
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

  it('blocks AI deletion when deletionMode is manual', async () => {
    const sy = makeSecureYeoman();
    sy.getSoulManager().getPersonality = vi.fn().mockResolvedValue({
      id: 'p-other',
      body: { resourcePolicy: { deletionMode: 'manual' } },
    });

    const result = await executeCreationTool(
      makeToolCall('delete_personality', { id: 'p-other' }),
      sy as any,
      { personalityId: 'p-self' }
    );

    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/mode: manual/i);
    expect(sy.getSoulManager().deletePersonality).not.toHaveBeenCalled();
  });

  it('blocks AI deletion when deletionMode is request (human-only path)', async () => {
    const sy = makeSecureYeoman();
    sy.getSoulManager().getPersonality = vi.fn().mockResolvedValue({
      id: 'p-other',
      body: { resourcePolicy: { deletionMode: 'request' } },
    });

    const result = await executeCreationTool(
      makeToolCall('delete_personality', { id: 'p-other' }),
      sy as any,
      { personalityId: 'p-self' }
    );

    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/mode: suggest/i);
    expect(sy.getSoulManager().deletePersonality).not.toHaveBeenCalled();
  });

  it('returns { deleted: true, id } on success', async () => {
    const sy = makeSecureYeoman();

    const result = await executeCreationTool(
      makeToolCall('delete_personality', { id: 'p-other' }),
      sy as any,
      { personalityId: 'p-self' }
    );

    expect(result.isError).toBe(false);
    expect(result.output).toMatchObject({ deleted: true, id: 'p-other' });
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

// ── Automation Level / Emergency Stop gating ──────────────────────────────────

describe('executeCreationTool — emergencyStop gating', () => {
  it('blocks all mutations when emergencyStop is true', async () => {
    const sy = makeSecureYeoman();
    sy.getSoulManager().getPersonality = vi.fn().mockResolvedValue({
      id: 'p-caller',
      body: { resourcePolicy: { emergencyStop: true, automationLevel: 'supervised_auto', deletionMode: 'auto' } },
    });

    const result = await executeCreationTool(
      makeToolCall('create_skill', { name: 'Test', description: '', instructions: '' }),
      sy as any,
      { personalityId: 'p-caller' }
    );

    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/emergency stop/i);
  });
});

describe('executeCreationTool — automationLevel gating', () => {
  it('queues create_skill when automationLevel is full_manual', async () => {
    const sy = makeSecureYeoman();
    sy.getSoulManager().getPersonality = vi.fn().mockResolvedValue({
      id: 'p-caller',
      body: { resourcePolicy: { emergencyStop: false, automationLevel: 'full_manual', deletionMode: 'auto' } },
    });

    const result = await executeCreationTool(
      makeToolCall('create_skill', { name: 'Queued Skill', description: '', instructions: '' }),
      sy as any,
      { personalityId: 'p-caller' }
    );

    expect(result.isError).toBe(false);
    expect((result.output as { queued: boolean }).queued).toBe(true);
    expect(sy.getApprovalManager().createApproval).toHaveBeenCalledWith(
      'p-caller',
      'create_skill',
      expect.objectContaining({ name: 'Queued Skill' })
    );
  });

  it('queues delete_skill when automationLevel is semi_auto', async () => {
    const sy = makeSecureYeoman();
    sy.getSoulManager().getPersonality = vi.fn().mockResolvedValue({
      id: 'p-caller',
      body: { resourcePolicy: { emergencyStop: false, automationLevel: 'semi_auto', deletionMode: 'auto' } },
    });

    const result = await executeCreationTool(
      makeToolCall('delete_skill', { id: 's-1' }),
      sy as any,
      { personalityId: 'p-caller' }
    );

    expect(result.isError).toBe(false);
    expect((result.output as { queued: boolean }).queued).toBe(true);
  });

  it('allows create_skill when automationLevel is semi_auto (not destructive)', async () => {
    const sy = makeSecureYeoman();
    sy.getSoulManager().getPersonality = vi.fn().mockResolvedValue({
      id: 'p-caller',
      body: { resourcePolicy: { emergencyStop: false, automationLevel: 'semi_auto', deletionMode: 'auto' } },
    });

    const result = await executeCreationTool(
      makeToolCall('create_skill', { name: 'Allowed Skill', description: '', instructions: '' }),
      sy as any,
      { personalityId: 'p-caller' }
    );

    expect(result.isError).toBe(false);
    expect((result.output as { queued?: boolean }).queued).toBeUndefined();
    expect(sy.getSoulManager().createSkill).toHaveBeenCalled();
  });

  it('proceeds without queuing when automationLevel is supervised_auto', async () => {
    const sy = makeSecureYeoman();
    // default mock already has supervised_auto + emergencyStop:false

    const result = await executeCreationTool(
      makeToolCall('delete_skill', { id: 's-1' }),
      sy as any,
      { personalityId: 'p-caller' }
    );

    expect(result.isError).toBe(false);
    expect((result.output as { queued?: boolean }).queued).toBeUndefined();
    expect(sy.getSoulManager().deleteSkill).toHaveBeenCalled();
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
    expect(result.output).toMatchObject({ deleted: true, roleId: 'analyst' });
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
    const mockExpManager = {
      get: vi.fn().mockResolvedValue({ id: 'exp-99', name: 'Test Experiment' }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const sy = {
      ...makeSecureYeoman(),
      getExperimentManager: vi.fn().mockReturnValue(mockExpManager),
    };

    const result = await executeCreationTool(
      makeToolCall('delete_experiment', { id: 'exp-99' }),
      sy as any
    );

    expect(result.isError).toBe(false);
    expect(result.output).toMatchObject({ deleted: true, id: 'exp-99' });
  });

  it('calls experimentManager.delete with the provided id', async () => {
    const mockExpManager = {
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    };
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

// ── create_skill ───────────────────────────────────────────────────────────────

describe('executeCreationTool — create_skill', () => {
  it('returns the created skill on success', async () => {
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(
      makeToolCall('create_skill', { name: 'Port Scanner', description: 'Scans ports', instructions: 'do it' }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect((result.output as { skill: unknown }).skill).toBeDefined();
  });

  it('normalizes skill name from snake_case to Title Case', async () => {
    const sy = makeSecureYeoman();
    const mockCreate = sy.getSoulManager().createSkill;
    await executeCreationTool(
      makeToolCall('create_skill', { name: 'my_new_skill', description: '', instructions: '' }),
      sy as any
    );
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'My New Skill' }));
  });

  it('normalizes skill name from kebab-case to Title Case', async () => {
    const sy = makeSecureYeoman();
    const mockCreate = sy.getSoulManager().createSkill;
    await executeCreationTool(
      makeToolCall('create_skill', { name: 'network-audit-tool', description: '', instructions: '' }),
      sy as any
    );
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Network Audit Tool' }));
  });

  it('scopes skill to calling personalityId', async () => {
    const sy = makeSecureYeoman();
    const mockCreate = sy.getSoulManager().createSkill;
    await executeCreationTool(
      makeToolCall('create_skill', { name: 'Scoped Skill', description: '', instructions: '' }),
      sy as any,
      { personalityId: 'p-abc' }
    );
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ personalityId: 'p-abc' }));
  });

  it('catches skill creation error and returns isError true', async () => {
    const sy = makeSecureYeoman();
    sy.getSoulManager().createSkill = vi.fn().mockRejectedValue(new Error('DB error'));
    const result = await executeCreationTool(
      makeToolCall('create_skill', { name: 'Broken', description: '', instructions: '' }),
      sy as any
    );
    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toContain('DB error');
  });
});

// ── update_skill ───────────────────────────────────────────────────────────────

describe('executeCreationTool — update_skill', () => {
  it('returns the updated skill on success', async () => {
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(
      makeToolCall('update_skill', { id: 's-1', description: 'Updated desc' }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect((result.output as { skill: unknown }).skill).toBeDefined();
    expect(sy.getSoulManager().updateSkill).toHaveBeenCalledWith('s-1', { description: 'Updated desc' });
  });
});

// ── delete_skill ───────────────────────────────────────────────────────────────

describe('executeCreationTool — delete_skill', () => {
  it('returns { deleted: true, id } on success', async () => {
    const sy = makeSecureYeoman();
    sy.getSoulManager().getSkill = vi.fn().mockResolvedValue({ id: 's-1', name: 'Old Skill' });
    const result = await executeCreationTool(
      makeToolCall('delete_skill', { id: 's-1' }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect(result.output).toMatchObject({ deleted: true, id: 's-1', name: 'Old Skill' });
  });

  it('uses skill id as name fallback when skill is not found', async () => {
    const sy = makeSecureYeoman();
    sy.getSoulManager().getSkill = vi.fn().mockResolvedValue(null);
    const result = await executeCreationTool(
      makeToolCall('delete_skill', { id: 's-orphan' }),
      sy as any
    );
    expect((result.output as { name: string }).name).toBe('s-orphan');
  });
});

// ── update_task ────────────────────────────────────────────────────────────────

describe('executeCreationTool — update_task', () => {
  it('returns isError true when taskStorage is not available', async () => {
    const sy = makeSecureYeoman(); // getTaskStorage returns null
    const result = await executeCreationTool(
      makeToolCall('update_task', { id: 't-1', status: 'done' }),
      sy as any
    );
    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/task storage not available/i);
  });

  it('calls taskStorage.updateTask and returns { updated: true, id } on success', async () => {
    const mockUpdateTask = vi.fn();
    const sy = {
      ...makeSecureYeoman(),
      getTaskStorage: vi.fn().mockReturnValue({ updateTask: mockUpdateTask }),
    };
    const result = await executeCreationTool(
      makeToolCall('update_task', { id: 't-42', status: 'completed' }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect(result.output).toMatchObject({ updated: true, id: 't-42' });
    expect(mockUpdateTask).toHaveBeenCalledWith('t-42', { status: 'completed' });
  });
});

// ── create_personality ────────────────────────────────────────────────────────

describe('executeCreationTool — create_personality', () => {
  it('returns the created personality on success', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: 'p-new', name: 'NewBot' });
    const sy = {
      ...makeSecureYeoman(),
      getSoulManager: vi.fn().mockReturnValue({
        ...makeSecureYeoman().getSoulManager(),
        createPersonality: mockCreate,
      }),
    };
    const result = await executeCreationTool(
      makeToolCall('create_personality', { name: 'NewBot', description: 'A bot', systemPrompt: 'You are helpful.' }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect((result.output as { personality: { name: string } }).personality.name).toBe('NewBot');
  });

  it('defaults sex to unspecified for unknown values', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: 'p-new', name: 'Bot' });
    const sy = makeSecureYeoman();
    sy.getSoulManager().createPersonality = mockCreate as any;
    await executeCreationTool(
      makeToolCall('create_personality', { name: 'Bot', sex: 'robot' }),
      sy as any
    );
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ sex: 'unspecified' }));
  });

  it('accepts valid sex values', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: 'p-new', name: 'Bot' });
    const sy = makeSecureYeoman();
    sy.getSoulManager().createPersonality = mockCreate as any;
    await executeCreationTool(
      makeToolCall('create_personality', { name: 'Bot', sex: 'female' }),
      sy as any
    );
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ sex: 'female' }));
  });
});

// ── update_personality ────────────────────────────────────────────────────────

describe('executeCreationTool — update_personality', () => {
  it('calls updatePersonality and returns the result', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ id: 'p-1', name: 'Updated' });
    const sy = makeSecureYeoman();
    sy.getSoulManager().updatePersonality = mockUpdate as any;
    const result = await executeCreationTool(
      makeToolCall('update_personality', { id: 'p-1', name: 'Updated' }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith('p-1', { name: 'Updated' });
  });
});

// ── delegate_task ──────────────────────────────────────────────────────────────

describe('executeCreationTool — delegate_task', () => {
  it('returns isError true when agentManager is not available', async () => {
    const sy = makeSecureYeoman(); // getSubAgentManager returns null
    const result = await executeCreationTool(makeToolCall('delegate_task', { task: 'do stuff' }), sy as any);
    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/sub-agent manager not available/i);
  });

  it('calls agentManager.delegate and returns the delegation', async () => {
    const mockDelegate = vi.fn().mockResolvedValue({ id: 'del-1', status: 'running' });
    const sy = {
      ...makeSecureYeoman(),
      getSubAgentManager: vi.fn().mockReturnValue({ delegate: mockDelegate, list: vi.fn(), getResult: vi.fn() }),
    };
    const result = await executeCreationTool(
      makeToolCall('delegate_task', { profile: 'scanner', task: 'scan network', context: { key: 'val' } }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect((result.output as { delegation: unknown }).delegation).toEqual({ id: 'del-1', status: 'running' });
    expect(mockDelegate).toHaveBeenCalledWith(expect.objectContaining({ profile: 'scanner', task: 'scan network' }));
  });
});

// ── list_sub_agents ────────────────────────────────────────────────────────────

describe('executeCreationTool — list_sub_agents', () => {
  it('returns empty agents array when agentManager is not available', async () => {
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(makeToolCall('list_sub_agents'), sy as any);
    expect(result.isError).toBe(false);
    expect((result.output as { agents: unknown[] }).agents).toEqual([]);
  });

  it('returns agents list from agentManager.list', async () => {
    const agents = [{ id: 'a-1' }, { id: 'a-2' }];
    const sy = {
      ...makeSecureYeoman(),
      getSubAgentManager: vi.fn().mockReturnValue({ list: vi.fn().mockResolvedValue(agents) }),
    };
    const result = await executeCreationTool(makeToolCall('list_sub_agents'), sy as any);
    expect(result.isError).toBe(false);
    expect((result.output as { agents: unknown[] }).agents).toEqual(agents);
  });
});

// ── get_delegation_result ──────────────────────────────────────────────────────

describe('executeCreationTool — get_delegation_result', () => {
  it('returns isError true when agentManager is not available', async () => {
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(
      makeToolCall('get_delegation_result', { delegationId: 'del-1' }),
      sy as any
    );
    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/sub-agent manager not available/i);
  });

  it('calls agentManager.getResult with delegationId', async () => {
    const mockGetResult = vi.fn().mockResolvedValue({ status: 'done', output: 'all clear' });
    const sy = {
      ...makeSecureYeoman(),
      getSubAgentManager: vi.fn().mockReturnValue({ getResult: mockGetResult }),
    };
    const result = await executeCreationTool(
      makeToolCall('get_delegation_result', { delegationId: 'del-99' }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect(mockGetResult).toHaveBeenCalledWith('del-99');
  });
});

// ── create_swarm ───────────────────────────────────────────────────────────────

describe('executeCreationTool — create_swarm', () => {
  it('returns isError true when swarmManager is not available', async () => {
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(
      makeToolCall('create_swarm', { template: 'recon', task: 'scan' }),
      sy as any
    );
    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/swarm manager not available/i);
  });

  it('calls swarmManager.createSwarm and returns the swarm', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: 'sw-1', status: 'running' });
    const sy = {
      ...makeSecureYeoman(),
      getSwarmManager: vi.fn().mockReturnValue({ createSwarm: mockCreate }),
    };
    const result = await executeCreationTool(
      makeToolCall('create_swarm', { template: 'recon', task: 'scan net', tokenBudget: 5000 }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect((result.output as { swarm: { id: string } }).swarm.id).toBe('sw-1');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ template: 'recon', task: 'scan net' }));
  });
});

// ── create_custom_role ─────────────────────────────────────────────────────────

describe('executeCreationTool — create_custom_role', () => {
  it('calls rbac.defineRole and returns created: true', async () => {
    mockRbac.defineRole.mockResolvedValue(undefined);
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(
      makeToolCall('create_custom_role', {
        name: 'Network Scanner',
        description: 'Can scan networks',
        permissions: [{ resource: 'network', actions: ['read'] }],
        inheritFrom: ['viewer'],
      }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect((result.output as { created: boolean; roleId: string }).created).toBe(true);
    expect((result.output as { roleId: string }).roleId).toBe('network_scanner');
    expect(mockRbac.defineRole).toHaveBeenCalledWith(expect.objectContaining({
      id: 'network_scanner',
      name: 'Network Scanner',
      inheritFrom: ['viewer'],
    }));
  });

  it('handles action (singular) alongside actions (plural) in permissions', async () => {
    mockRbac.defineRole.mockResolvedValue(undefined);
    const sy = makeSecureYeoman();
    await executeCreationTool(
      makeToolCall('create_custom_role', {
        name: 'Reader',
        permissions: [{ resource: 'docs', action: 'read' }],
      }),
      sy as any
    );
    expect(mockRbac.defineRole).toHaveBeenCalledWith(expect.objectContaining({
      permissions: [{ resource: 'docs', actions: ['read'] }],
    }));
  });
});

// ── assign_role ────────────────────────────────────────────────────────────────

describe('executeCreationTool — assign_role', () => {
  it('calls rbac.assignUserRole and returns { assigned: true }', async () => {
    mockRbac.assignUserRole.mockResolvedValue(undefined);
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(
      makeToolCall('assign_role', { userId: 'user-1', roleId: 'operator' }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect(result.output).toMatchObject({ assigned: true, userId: 'user-1', roleId: 'operator' });
    expect(mockRbac.assignUserRole).toHaveBeenCalledWith('user-1', 'operator', 'ai');
  });
});

// ── create_experiment ──────────────────────────────────────────────────────────

describe('executeCreationTool — create_experiment', () => {
  it('returns isError true when experimentManager is not available', async () => {
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(
      makeToolCall('create_experiment', { name: 'Test', variants: [] }),
      sy as any
    );
    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/experiment manager not available/i);
  });

  it('calls experimentManager.create and returns the experiment', async () => {
    const mockExpManager = {
      create: vi.fn().mockResolvedValue({ id: 'exp-1', name: 'Test Exp' }),
      get: vi.fn(),
      delete: vi.fn(),
    };
    const sy = {
      ...makeSecureYeoman(),
      getExperimentManager: vi.fn().mockReturnValue(mockExpManager),
    };
    const result = await executeCreationTool(
      makeToolCall('create_experiment', { name: 'Test Exp', description: 'desc', variants: ['A', 'B'] }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect((result.output as { experiment: { name: string } }).experiment.name).toBe('Test Exp');
    expect(mockExpManager.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Test Exp',
      description: 'desc',
      variants: ['A', 'B'],
    }));
  });
});

// ── a2a_connect ────────────────────────────────────────────────────────────────

describe('executeCreationTool — a2a_connect', () => {
  it('returns isError true when a2aManager is not available', async () => {
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(
      makeToolCall('a2a_connect', { agentUrl: 'https://agent.example.com', agentName: 'RemoteAgent' }),
      sy as any
    );
    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/a2a manager not available/i);
  });

  it('calls a2aManager.connect and returns { connected: true }', async () => {
    const mockConnect = vi.fn().mockResolvedValue({ status: 'connected' });
    const sy = {
      ...makeSecureYeoman(),
      getA2AManager: vi.fn().mockReturnValue({ connect: mockConnect, sendMessage: vi.fn() }),
    };
    const result = await executeCreationTool(
      makeToolCall('a2a_connect', { agentUrl: 'https://agent.example.com', agentName: 'Remote' }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect((result.output as { connected: boolean }).connected).toBe(true);
    expect(mockConnect).toHaveBeenCalledWith('https://agent.example.com', 'Remote');
  });
});

// ── a2a_send ───────────────────────────────────────────────────────────────────

describe('executeCreationTool — a2a_send', () => {
  it('returns isError true when a2aManager is not available', async () => {
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(
      makeToolCall('a2a_send', { agentUrl: 'https://agent.example.com', message: 'hello' }),
      sy as any
    );
    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/a2a manager not available/i);
  });

  it('calls a2aManager.sendMessage and returns { sent: true }', async () => {
    const mockSend = vi.fn().mockResolvedValue({ ack: true });
    const sy = {
      ...makeSecureYeoman(),
      getA2AManager: vi.fn().mockReturnValue({ connect: vi.fn(), sendMessage: mockSend }),
    };
    const result = await executeCreationTool(
      makeToolCall('a2a_send', { agentUrl: 'https://agent.example.com', message: 'do recon' }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect((result.output as { sent: boolean }).sent).toBe(true);
    expect(mockSend).toHaveBeenCalledWith('https://agent.example.com', 'do recon');
  });
});

// ── create_workflow ────────────────────────────────────────────────────────────

describe('executeCreationTool — create_workflow', () => {
  it('returns isError true when workflowManager is not available', async () => {
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(
      makeToolCall('create_workflow', { name: 'My Workflow' }),
      sy as any
    );
    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/workflow manager not available/i);
  });

  it('calls workflowManager.createDefinition and returns the workflow', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: 'wf-1', name: 'My Workflow' });
    const sy = {
      ...makeSecureYeoman(),
      getWorkflowManager: vi.fn().mockReturnValue({
        createDefinition: mockCreate,
        updateDefinition: vi.fn(),
        getDefinition: vi.fn(),
        deleteDefinition: vi.fn(),
        triggerRun: vi.fn(),
      }),
    };
    const result = await executeCreationTool(
      makeToolCall('create_workflow', { name: 'My Workflow', description: 'does stuff', steps: [], edges: [] }),
      sy as any,
      { personalityId: 'p-creator' }
    );
    expect(result.isError).toBe(false);
    expect((result.output as { workflow: { id: string } }).workflow.id).toBe('wf-1');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'My Workflow',
      createdBy: 'p-creator',
    }));
  });
});

// ── update_workflow ────────────────────────────────────────────────────────────

describe('executeCreationTool — update_workflow', () => {
  it('returns isError true when workflowManager is not available', async () => {
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(
      makeToolCall('update_workflow', { id: 'wf-1', name: 'Updated' }),
      sy as any
    );
    expect(result.isError).toBe(true);
  });

  it('calls workflowManager.updateDefinition and returns the workflow', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ id: 'wf-1', name: 'Updated Workflow' });
    const sy = {
      ...makeSecureYeoman(),
      getWorkflowManager: vi.fn().mockReturnValue({
        updateDefinition: mockUpdate,
        createDefinition: vi.fn(),
        getDefinition: vi.fn(),
        deleteDefinition: vi.fn(),
        triggerRun: vi.fn(),
      }),
    };
    const result = await executeCreationTool(
      makeToolCall('update_workflow', { id: 'wf-1', name: 'Updated Workflow' }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith('wf-1', { name: 'Updated Workflow' });
  });
});

// ── delete_workflow ────────────────────────────────────────────────────────────

describe('executeCreationTool — delete_workflow', () => {
  it('returns isError true when workflowManager is not available', async () => {
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(makeToolCall('delete_workflow', { id: 'wf-1' }), sy as any);
    expect(result.isError).toBe(true);
  });

  it('returns { deleted: true, id } on success', async () => {
    const mockGet = vi.fn().mockResolvedValue({ id: 'wf-5', name: 'Old Workflow' });
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const sy = {
      ...makeSecureYeoman(),
      getWorkflowManager: vi.fn().mockReturnValue({
        getDefinition: mockGet,
        deleteDefinition: mockDelete,
        createDefinition: vi.fn(),
        updateDefinition: vi.fn(),
        triggerRun: vi.fn(),
      }),
    };
    const result = await executeCreationTool(makeToolCall('delete_workflow', { id: 'wf-5' }), sy as any);
    expect(result.isError).toBe(false);
    expect(result.output).toMatchObject({ deleted: true, id: 'wf-5', name: 'Old Workflow' });
  });
});

// ── trigger_workflow ───────────────────────────────────────────────────────────

describe('executeCreationTool — trigger_workflow', () => {
  it('returns isError true when workflowManager is not available', async () => {
    const sy = makeSecureYeoman();
    const result = await executeCreationTool(makeToolCall('trigger_workflow', { id: 'wf-1' }), sy as any);
    expect(result.isError).toBe(true);
  });

  it('calls workflowManager.triggerRun and returns the run', async () => {
    const mockTrigger = vi.fn().mockResolvedValue({ id: 'run-1', status: 'running' });
    const sy = {
      ...makeSecureYeoman(),
      getWorkflowManager: vi.fn().mockReturnValue({
        triggerRun: mockTrigger,
        createDefinition: vi.fn(),
        updateDefinition: vi.fn(),
        getDefinition: vi.fn(),
        deleteDefinition: vi.fn(),
      }),
    };
    const result = await executeCreationTool(
      makeToolCall('trigger_workflow', { id: 'wf-1', input: { key: 'value' } }),
      sy as any
    );
    expect(result.isError).toBe(false);
    expect((result.output as { run: { id: string } }).run.id).toBe('run-1');
    expect(mockTrigger).toHaveBeenCalledWith('wf-1', expect.objectContaining({
      triggeredBy: 'manual',
      input: { key: 'value' },
    }));
  });
});

// ── gating edge cases ──────────────────────────────────────────────────────────

describe('executeCreationTool — gating edge cases', () => {
  it('falls through when policy fetch throws (fail-safe: allow)', async () => {
    const sy = makeSecureYeoman();
    sy.getSoulManager().getPersonality = vi.fn().mockRejectedValue(new Error('DB gone'));
    const result = await executeCreationTool(
      makeToolCall('create_skill', { name: 'Fallthrough Skill', description: '', instructions: '' }),
      sy as any,
      { personalityId: 'p-caller' }
    );
    // Should fall through and attempt the actual tool execution
    expect(result.isError).toBe(false);
    expect(sy.getSoulManager().createSkill).toHaveBeenCalled();
  });

  it('returns error when approval store is unavailable (full_manual path)', async () => {
    const sy = makeSecureYeoman();
    sy.getSoulManager().getPersonality = vi.fn().mockResolvedValue({
      id: 'p-caller',
      body: { resourcePolicy: { emergencyStop: false, automationLevel: 'full_manual' } },
    });
    sy.getApprovalManager = vi.fn().mockReturnValue({
      createApproval: vi.fn().mockRejectedValue(new Error('store down')),
    });
    const result = await executeCreationTool(
      makeToolCall('create_skill', { name: 'Blocked', description: '', instructions: '' }),
      sy as any,
      { personalityId: 'p-caller' }
    );
    expect(result.isError).toBe(true);
    expect((result.output as { error: string }).error).toMatch(/approval queue is unavailable/i);
  });

  it('skips policy check entirely when no personalityId in context', async () => {
    const sy = makeSecureYeoman();
    // Even though getPersonality is wired, it should not be called
    const result = await executeCreationTool(
      makeToolCall('create_skill', { name: 'NoCtx Skill', description: '', instructions: '' }),
      sy as any
      // no context
    );
    expect(result.isError).toBe(false);
    expect(sy.getSoulManager().getPersonality).not.toHaveBeenCalled();
  });
});
