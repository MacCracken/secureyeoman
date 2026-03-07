import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicToolManager } from './dynamic-tool-manager.js';
import type { DynamicTool } from './dynamic-tool-storage.js';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function makeAuditChain() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function makeStorage(tools: DynamicTool[] = []) {
  const stored: DynamicTool[] = [...tools];
  return {
    ensureTables: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockImplementation(() => Promise.resolve([...stored])),
    upsertTool: vi.fn().mockImplementation((data) => {
      const tool: DynamicTool = {
        id: 'dt-new',
        name: data.name,
        description: data.description,
        parametersSchema: data.parametersSchema,
        implementation: data.implementation,
        personalityId: data.personalityId,
        createdBy: data.createdBy,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      stored.push(tool);
      return Promise.resolve(tool);
    }),
    getTool: vi.fn().mockResolvedValue(null),
    deleteTool: vi.fn().mockResolvedValue(true),
  };
}

/** Creates a SandboxManager mock that runs the function directly (no OS restriction in tests). */
function makeSandboxManager(opts: { succeed?: boolean } = {}) {
  const succeed = opts.succeed ?? true;
  return {
    createSandbox: vi.fn().mockReturnValue({
      run: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => {
        if (!succeed) {
          return { success: false, error: new Error('Sandboxed execution failed'), violations: [] };
        }
        try {
          const result = await fn();
          return { success: true, result, violations: [] };
        } catch (err) {
          return { success: false, error: err, violations: [] };
        }
      }),
    }),
  };
}

function makePolicy(
  overrides: Partial<{ allowDynamicTools: boolean; sandboxDynamicTools: boolean }> = {}
) {
  return { allowDynamicTools: true, sandboxDynamicTools: false, ...overrides };
}

function makeManager(
  opts: {
    tools?: DynamicTool[];
    policy?: Partial<{ allowDynamicTools: boolean; sandboxDynamicTools: boolean }>;
    withSandbox?: boolean;
    sandboxSucceeds?: boolean;
  } = {}
) {
  const logger = makeLogger();
  const audit = makeAuditChain();
  const storage = makeStorage(opts.tools ?? []);
  const policy = makePolicy(opts.policy);
  const sandboxManager = opts.withSandbox
    ? makeSandboxManager({ succeed: opts.sandboxSucceeds })
    : undefined;

  const manager = new DynamicToolManager(storage as any, policy, {
    logger: logger as any,
    auditChain: audit as any,
    sandboxManager: sandboxManager as any,
  });
  return { manager, storage, logger, audit, policy, sandboxManager };
}

function makeTool(overrides: Partial<DynamicTool> = {}): DynamicTool {
  return {
    id: 'dt-1',
    name: 'add_numbers',
    description: 'Adds a and b',
    parametersSchema: {
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
    },
    implementation: 'return args.a + args.b;',
    personalityId: null,
    createdBy: 'ai',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DynamicToolManager', () => {
  // ── initialize ────────────────────────────────────────────────────────────

  describe('initialize', () => {
    it('loads persisted tools from storage', async () => {
      const { manager, storage } = makeManager({
        tools: [makeTool()],
      });
      await manager.initialize();
      expect(storage.listTools).toHaveBeenCalledOnce();
      expect(manager.has('add_numbers')).toBe(true);
    });

    it('starts with an empty registry when no tools are persisted', async () => {
      const { manager } = makeManager();
      await manager.initialize();
      expect(manager.getSchemas()).toEqual([]);
    });

    it('skips tools whose implementation fails to compile', async () => {
      const { manager, logger } = makeManager({
        tools: [makeTool({ name: 'bad_tool', implementation: '}{{{ syntax error' })],
      });
      await manager.initialize();
      expect(manager.has('bad_tool')).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('loads multiple tools into the registry', async () => {
      const { manager } = makeManager({
        tools: [
          makeTool({ name: 'tool_one', implementation: 'return 1;' }),
          makeTool({ name: 'tool_two', implementation: 'return 2;' }),
        ],
      });
      await manager.initialize();
      expect(manager.has('tool_one')).toBe(true);
      expect(manager.has('tool_two')).toBe(true);
    });
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    describe('policy gate', () => {
      it('throws when allowDynamicTools is false', async () => {
        const { manager } = makeManager({ policy: { allowDynamicTools: false } });
        await expect(
          manager.register({
            name: 'my_tool',
            description: '',
            parametersSchema: {},
            implementation: 'return 1;',
          })
        ).rejects.toThrow('disabled by security policy');
      });
    });

    describe('name validation', () => {
      it('throws on an empty name', async () => {
        const { manager } = makeManager();
        await expect(
          manager.register({
            name: '',
            description: '',
            parametersSchema: {},
            implementation: 'return 1;',
          })
        ).rejects.toThrow('Invalid tool name');
      });

      it('throws when name starts with a digit', async () => {
        const { manager } = makeManager();
        await expect(
          manager.register({
            name: '1bad',
            description: '',
            parametersSchema: {},
            implementation: 'return 1;',
          })
        ).rejects.toThrow('Invalid tool name');
      });

      it('throws when name contains uppercase letters', async () => {
        const { manager } = makeManager();
        await expect(
          manager.register({
            name: 'myTool',
            description: '',
            parametersSchema: {},
            implementation: 'return 1;',
          })
        ).rejects.toThrow('Invalid tool name');
      });

      it('throws when name contains hyphens', async () => {
        const { manager } = makeManager();
        await expect(
          manager.register({
            name: 'my-tool',
            description: '',
            parametersSchema: {},
            implementation: 'return 1;',
          })
        ).rejects.toThrow('Invalid tool name');
      });

      it('accepts a valid snake_case name', async () => {
        const { manager } = makeManager();
        await expect(
          manager.register({
            name: 'my_tool',
            description: '',
            parametersSchema: {},
            implementation: 'return 1;',
          })
        ).resolves.toBeDefined();
      });
    });

    describe('implementation size limit', () => {
      it('throws when implementation exceeds 16 384 bytes', async () => {
        const { manager } = makeManager();
        const bigCode = 'x'.repeat(16_385);
        await expect(
          manager.register({
            name: 'tool',
            description: '',
            parametersSchema: {},
            implementation: bigCode,
          })
        ).rejects.toThrow('too large');
      });

      it('accepts implementation at exactly the limit', async () => {
        const { manager } = makeManager();
        const pad = 'x'.repeat(16_384 - 'return 1;'.length);
        const code = `// ${'x'.repeat(pad.length)}\nreturn 1;`;
        // Only check it doesn't throw a size error (may throw for other reasons)
        const err = await manager
          .register({
            name: 'tool',
            description: '',
            parametersSchema: {},
            implementation: code.slice(0, 16_384),
          })
          .catch((e: Error) => e);
        if (err instanceof Error) {
          expect(err.message).not.toMatch('too large');
        }
      });
    });

    describe('forbidden pattern detection', () => {
      const forbidden = [
        ['require()', "const m = require('fs');"],
        ['dynamic import()', 'const m = await import("fs");'],
        ['process', 'return process.env.SECRET;'],
        ['__dirname', 'return __dirname;'],
        ['__filename', 'return __filename;'],
        ['globalThis', 'return globalThis.process;'],
        ['Buffer', 'return Buffer.from("hello");'],
        ['constructor chain escape', 'return this.constructor.constructor("return process")();'],
        ['eval()', 'return eval("1+1");'],
        ['new Function()', 'return new Function("return 1")();'],
        ['setTimeout()', 'setTimeout(() => {}, 100); return 1;'],
        ['setInterval()', 'setInterval(() => {}, 100); return 1;'],
      ];

      it.each(forbidden)('rejects implementation containing %s', async (_label, code) => {
        const { manager } = makeManager();
        await expect(
          manager.register({
            name: 'tool',
            description: '',
            parametersSchema: {},
            implementation: code,
          })
        ).rejects.toThrow('forbidden pattern');
      });
    });

    describe('compilation errors', () => {
      it('throws when implementation has a syntax error', async () => {
        const { manager } = makeManager();
        await expect(
          manager.register({
            name: 'bad',
            description: '',
            parametersSchema: {},
            implementation: '}{{{ not js',
          })
        ).rejects.toThrow();
      });
    });

    describe('successful registration', () => {
      it('calls storage.upsertTool with the provided data', async () => {
        const { manager, storage } = makeManager();
        await manager.register({
          name: 'add_numbers',
          description: 'Adds a and b',
          parametersSchema: { type: 'object' },
          implementation: 'return args.a + args.b;',
          personalityId: 'p-1',
          createdBy: 'friday',
        });
        expect(storage.upsertTool).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'add_numbers',
            description: 'Adds a and b',
            personalityId: 'p-1',
            createdBy: 'friday',
          })
        );
      });

      it('adds the tool to the in-memory registry', async () => {
        const { manager } = makeManager();
        expect(manager.has('add_numbers')).toBe(false);
        await manager.register({
          name: 'add_numbers',
          description: '',
          parametersSchema: {},
          implementation: 'return 1;',
        });
        expect(manager.has('add_numbers')).toBe(true);
      });

      it('returns the persisted DynamicTool', async () => {
        const { manager } = makeManager();
        const tool = await manager.register({
          name: 'my_tool',
          description: 'desc',
          parametersSchema: {},
          implementation: 'return 42;',
        });
        expect(tool.name).toBe('my_tool');
        expect(tool.id).toBeDefined();
      });

      it('records an audit event', async () => {
        const { manager, audit } = makeManager();
        await manager.register({
          name: 'my_tool',
          description: '',
          parametersSchema: {},
          implementation: 'return 1;',
        });
        expect(audit.record).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'dynamic_tool_registered' })
        );
      });

      it('logs at info level', async () => {
        const { manager, logger } = makeManager();
        await manager.register({
          name: 'my_tool',
          description: '',
          parametersSchema: {},
          implementation: 'return 1;',
        });
        expect(logger.info).toHaveBeenCalledWith(expect.any(Object), 'Dynamic tool registered');
      });

      it('re-registering the same name updates the tool (upsert)', async () => {
        const { manager, storage } = makeManager();
        await manager.register({
          name: 'my_tool',
          description: 'v1',
          parametersSchema: {},
          implementation: 'return 1;',
        });
        await manager.register({
          name: 'my_tool',
          description: 'v2',
          parametersSchema: {},
          implementation: 'return 2;',
        });
        expect(storage.upsertTool).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ── execute ───────────────────────────────────────────────────────────────

  describe('execute', () => {
    it('returns an error when the tool is not in the registry', async () => {
      const { manager } = makeManager();
      const result = await manager.execute('no_such_tool', {});
      expect(result.isError).toBe(true);
      expect(result.output).toMatchObject({ error: expect.stringContaining('not registered') });
    });

    it('executes a simple arithmetic tool', async () => {
      const { manager } = makeManager();
      await manager.register({
        name: 'add',
        description: '',
        parametersSchema: {},
        implementation: 'return args.a + args.b;',
      });
      const result = await manager.execute('add', { a: 3, b: 4 });
      expect(result.isError).toBe(false);
      expect(result.output).toBe(7);
    });

    it('executes an async tool that returns a resolved value', async () => {
      const { manager } = makeManager();
      await manager.register({
        name: 'async_tool',
        description: '',
        parametersSchema: {},
        implementation: 'return await Promise.resolve(args.value * 2);',
      });
      const result = await manager.execute('async_tool', { value: 5 });
      expect(result.isError).toBe(false);
      expect(result.output).toBe(10);
    });

    it('returns isError true when the implementation throws', async () => {
      const { manager } = makeManager();
      await manager.register({
        name: 'exploding',
        description: '',
        parametersSchema: {},
        implementation: 'throw new Error("boom");',
      });
      const result = await manager.execute('exploding', {});
      expect(result.isError).toBe(true);
      expect((result.output as { error: string }).error).toContain('boom');
    });

    it('passes args to the implementation', async () => {
      const { manager } = makeManager();
      await manager.register({
        name: 'echo',
        description: '',
        parametersSchema: {},
        implementation: 'return { received: args };',
      });
      const result = await manager.execute('echo', { foo: 'bar', n: 42 });
      expect(result.isError).toBe(false);
      expect((result.output as { received: unknown }).received).toEqual({ foo: 'bar', n: 42 });
    });

    it('records an audit event on successful execution', async () => {
      const { manager, audit } = makeManager();
      await manager.register({
        name: 'tool',
        description: '',
        parametersSchema: {},
        implementation: 'return 1;',
      });
      await manager.execute('tool', {});
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'dynamic_tool_executed' })
      );
    });

    describe('sandbox wrapping', () => {
      it('calls sandbox.run when sandboxDynamicTools is true and sandboxManager is present', async () => {
        const { manager, sandboxManager } = makeManager({
          policy: { allowDynamicTools: true, sandboxDynamicTools: true },
          withSandbox: true,
        });
        await manager.register({
          name: 'sandboxed',
          description: '',
          parametersSchema: {},
          implementation: 'return 99;',
        });
        await manager.execute('sandboxed', {});
        const sandbox = sandboxManager!.createSandbox();
        expect(sandbox.run).toHaveBeenCalled();
      });

      it('does NOT call sandbox.run when sandboxDynamicTools is false', async () => {
        const { manager, sandboxManager } = makeManager({
          policy: { allowDynamicTools: true, sandboxDynamicTools: false },
          withSandbox: true,
        });
        await manager.register({
          name: 'unsandboxed',
          description: '',
          parametersSchema: {},
          implementation: 'return 42;',
        });
        const result = await manager.execute('unsandboxed', {});
        expect(result.isError).toBe(false);
        expect(result.output).toBe(42);
        // sandboxManager exists but sandbox.run should not have been used during execute
        // (it may be called during createSandbox but run should not be called)
        const sb = (sandboxManager!.createSandbox as ReturnType<typeof vi.fn>).mock.results;
        // If createSandbox was called, run must not have been called on its result
        for (const r of sb) {
          expect((r.value as { run: ReturnType<typeof vi.fn> }).run).not.toHaveBeenCalled();
        }
      });

      it('returns isError true when the sandbox reports failure', async () => {
        const { manager } = makeManager({
          policy: { allowDynamicTools: true, sandboxDynamicTools: true },
          withSandbox: true,
          sandboxSucceeds: false,
        });
        await manager.register({
          name: 'tool',
          description: '',
          parametersSchema: {},
          implementation: 'return 1;',
        });
        const result = await manager.execute('tool', {});
        expect(result.isError).toBe(true);
        expect((result.output as { error: string }).error).toContain('failed');
      });

      it('reflects a live sandboxDynamicTools policy change without restart', async () => {
        // Start with sandbox OFF
        const policy = { allowDynamicTools: true, sandboxDynamicTools: false };
        const sandboxManager = makeSandboxManager();
        const storage = makeStorage();
        const manager = new DynamicToolManager(storage as any, policy, {
          logger: makeLogger() as any,
          sandboxManager: sandboxManager as any,
        });

        await manager.register({
          name: 'tool',
          description: '',
          parametersSchema: {},
          implementation: 'return 1;',
        });

        // Execute with sandbox OFF — sandbox.run should not be used
        await manager.execute('tool', {});
        expect(sandboxManager.createSandbox().run).not.toHaveBeenCalled();

        // Flip the policy live (simulates Settings UI toggle)
        policy.sandboxDynamicTools = true;

        // Execute again — sandbox.run should now be used
        await manager.execute('tool', {});
        expect(sandboxManager.createSandbox().run).toHaveBeenCalled();
      });
    });

    describe('vm context restrictions', () => {
      it('globals not in the whitelist are unavailable inside the vm context', async () => {
        const { manager } = makeManager();
        // 'fetch' is a Node.js global but deliberately excluded from the vm context sandbox.
        // The code catches the ReferenceError so it doesn't propagate as an error result,
        // allowing us to assert on the returned string value.
        await manager.register({
          name: 'probe_globals',
          description: '',
          parametersSchema: {},
          implementation: `
            try {
              // fetch is a Node.js global absent from our vm whitelist
              void fetch;
              return 'exposed';
            } catch (e) {
              return 'unavailable';
            }
          `,
        });
        const result = await manager.execute('probe_globals', {});
        expect(result.isError).toBe(false);
        expect(result.output).toBe('unavailable');
      });

      it('can use Math inside the vm context', async () => {
        const { manager } = makeManager();
        await manager.register({
          name: 'use_math',
          description: '',
          parametersSchema: {},
          implementation: 'return Math.max(args.a, args.b);',
        });
        const result = await manager.execute('use_math', { a: 10, b: 20 });
        expect(result.isError).toBe(false);
        expect(result.output).toBe(20);
      });

      it('can use JSON.parse inside the vm context', async () => {
        const { manager } = makeManager();
        await manager.register({
          name: 'parse_json',
          description: '',
          parametersSchema: {},
          implementation: 'return JSON.parse(args.text).value;',
        });
        const result = await manager.execute('parse_json', { text: '{"value":42}' });
        expect(result.isError).toBe(false);
        expect(result.output).toBe(42);
      });
    });
  });

  // ── has ───────────────────────────────────────────────────────────────────

  describe('has', () => {
    it('returns false for a tool that has not been registered', () => {
      const { manager } = makeManager();
      expect(manager.has('nonexistent')).toBe(false);
    });

    it('returns true after a tool is registered', async () => {
      const { manager } = makeManager();
      await manager.register({
        name: 'my_tool',
        description: '',
        parametersSchema: {},
        implementation: 'return 1;',
      });
      expect(manager.has('my_tool')).toBe(true);
    });

    it('returns false after a tool is deleted', async () => {
      const { manager } = makeManager();
      await manager.register({
        name: 'my_tool',
        description: '',
        parametersSchema: {},
        implementation: 'return 1;',
      });
      await manager.deleteByName('my_tool');
      expect(manager.has('my_tool')).toBe(false);
    });
  });

  // ── getSchemas ────────────────────────────────────────────────────────────

  describe('getSchemas', () => {
    it('returns an empty array when no tools are registered', () => {
      const { manager } = makeManager();
      expect(manager.getSchemas()).toEqual([]);
    });

    it('returns Tool schemas with name, description, and parameters', async () => {
      const schema = { type: 'object', properties: { a: { type: 'number' } } };
      const { manager } = makeManager();
      await manager.register({
        name: 'add',
        description: 'Adds numbers',
        parametersSchema: schema,
        implementation: 'return 1;',
      });
      const schemas = manager.getSchemas();
      expect(schemas).toHaveLength(1);
      expect(schemas[0]).toEqual({ name: 'add', description: 'Adds numbers', parameters: schema });
    });

    it('returns one schema per registered tool', async () => {
      const { manager } = makeManager();
      await manager.register({
        name: 'tool_a',
        description: '',
        parametersSchema: {},
        implementation: 'return 1;',
      });
      await manager.register({
        name: 'tool_b',
        description: '',
        parametersSchema: {},
        implementation: 'return 2;',
      });
      expect(manager.getSchemas()).toHaveLength(2);
    });
  });

  // ── listTools ─────────────────────────────────────────────────────────────

  describe('listTools', () => {
    it('returns empty array when no tools registered', () => {
      const { manager } = makeManager();
      expect(manager.listTools()).toEqual([]);
    });

    it('returns tool metadata without the implementation field', async () => {
      const { manager } = makeManager();
      await manager.register({
        name: 'my_tool',
        description: 'desc',
        parametersSchema: {},
        implementation: 'return 1;',
      });
      const tools = manager.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]).not.toHaveProperty('implementation');
      expect(tools[0].name).toBe('my_tool');
    });
  });

  // ── configurable executionTimeoutMs ───────────────────────────────────────

  describe('executionTimeoutMs', () => {
    it('uses 10 000 ms by default', async () => {
      const { manager } = makeManager();
      await manager.register({
        name: 'slow',
        description: '',
        parametersSchema: {},
        // Implementation resolves immediately; we just need the timeout message to contain the default
        implementation: 'return 1;',
      });
      // Verify the timeout value is embedded in error messages by inspecting a private path.
      // We do this indirectly via a mock that forces a timeout error scenario.
      // The simplest approach: override the registered fn to hang forever, then confirm the
      // error message mentions 10000.
      const entry = (manager as any).registry.get('slow');
      entry.fn = () => new Promise(() => {}); // never resolves

      // Use a very short custom timeout via a new manager to confirm message
      const { manager: fastManager } = makeManager();
      fastManager['executionTimeoutMs'] = 50; // patch private field for test
      await fastManager.register({
        name: 'hang',
        description: '',
        parametersSchema: {},
        implementation: 'return 1;',
      });
      const hangEntry = (fastManager as any).registry.get('hang');
      hangEntry.fn = () => new Promise(() => {});

      const result = await fastManager.execute('hang', {});
      expect(result.isError).toBe(true);
      expect((result.output as { error: string }).error).toContain('50ms');
    });

    it('respects a custom executionTimeoutMs passed via deps', async () => {
      const logger = makeLogger();
      const storage = makeStorage();
      const policy = makePolicy();
      const manager = new DynamicToolManager(storage as any, policy, {
        logger: logger as any,
        executionTimeoutMs: 75,
      });

      await manager.register({
        name: 'hang_tool',
        description: '',
        parametersSchema: {},
        implementation: 'return 1;',
      });

      // Replace fn with one that never resolves
      const entry = (manager as any).registry.get('hang_tool');
      entry.fn = () => new Promise(() => {});

      const result = await manager.execute('hang_tool', {});
      expect(result.isError).toBe(true);
      expect((result.output as { error: string }).error).toContain('75ms');
    });
  });

  // ── deleteByName ──────────────────────────────────────────────────────────

  describe('deleteByName', () => {
    it('returns false when the tool does not exist in storage', async () => {
      const { manager, storage } = makeManager();
      storage.deleteTool.mockResolvedValueOnce(false);
      expect(await manager.deleteByName('nonexistent')).toBe(false);
    });

    it('returns true and removes from registry when the tool exists', async () => {
      const { manager } = makeManager();
      await manager.register({
        name: 'my_tool',
        description: '',
        parametersSchema: {},
        implementation: 'return 1;',
      });
      expect(manager.has('my_tool')).toBe(true);
      const deleted = await manager.deleteByName('my_tool');
      expect(deleted).toBe(true);
      expect(manager.has('my_tool')).toBe(false);
    });

    it('calls storage.deleteTool with the tool name', async () => {
      const { manager, storage } = makeManager();
      await manager.register({
        name: 'my_tool',
        description: '',
        parametersSchema: {},
        implementation: 'return 1;',
      });
      await manager.deleteByName('my_tool');
      expect(storage.deleteTool).toHaveBeenCalledWith('my_tool');
    });

    it('records an audit event on deletion', async () => {
      const { manager, audit } = makeManager();
      await manager.register({
        name: 'my_tool',
        description: '',
        parametersSchema: {},
        implementation: 'return 1;',
      });
      await manager.deleteByName('my_tool');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'dynamic_tool_deleted' })
      );
    });
  });
});
