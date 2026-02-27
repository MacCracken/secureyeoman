import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicToolStorage } from './dynamic-tool-storage.js';

// ── Mock pg-pool ─────────────────────────────────────────────────────────────

const mockQuery = vi.fn();

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

// ── Row factory ───────────────────────────────────────────────────────────────

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dt-1',
    name: 'add_numbers',
    description: 'Adds two numbers',
    parameters_schema: {
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
    },
    implementation: 'return args.a + args.b;',
    personality_id: null,
    created_by: 'ai',
    created_at: '1700000000000',
    updated_at: '1700000000000',
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function queryReturns(rows: unknown[]) {
  mockQuery.mockResolvedValueOnce({ rows, rowCount: rows.length });
}

function executeReturns(rowCount: number) {
  mockQuery.mockResolvedValueOnce({ rows: [], rowCount });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DynamicToolStorage', () => {
  let storage: DynamicToolStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DynamicToolStorage();
  });

  it('can be instantiated', () => {
    expect(storage).toBeInstanceOf(DynamicToolStorage);
  });

  // ── ensureTables ────────────────────────────────────────────────────────────

  describe('ensureTables', () => {
    it('issues a CREATE TABLE IF NOT EXISTS statement', async () => {
      executeReturns(0);
      await storage.ensureTables();
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS/i);
      expect(sql).toMatch(/soul\.dynamic_tools/i);
    });

    it('includes all required columns', async () => {
      executeReturns(0);
      await storage.ensureTables();
      const sql = mockQuery.mock.calls[0][0] as string;
      for (const col of [
        'id',
        'name',
        'description',
        'parameters_schema',
        'implementation',
        'personality_id',
        'created_by',
        'created_at',
        'updated_at',
      ]) {
        expect(sql).toContain(col);
      }
    });
  });

  // ── upsertTool ──────────────────────────────────────────────────────────────

  describe('upsertTool', () => {
    it('returns a DynamicTool with camelCase fields', async () => {
      queryReturns([makeRow()]);
      const tool = await storage.upsertTool({
        name: 'add_numbers',
        description: 'Adds two numbers',
        parametersSchema: { type: 'object' },
        implementation: 'return args.a + args.b;',
        personalityId: null,
        createdBy: 'ai',
      });
      expect(tool.id).toBe('dt-1');
      expect(tool.name).toBe('add_numbers');
      expect(tool.description).toBe('Adds two numbers');
      expect(tool.personalityId).toBeNull();
      expect(tool.createdBy).toBe('ai');
      expect(typeof tool.createdAt).toBe('number');
      expect(typeof tool.updatedAt).toBe('number');
    });

    it('uses INSERT ... ON CONFLICT ... DO UPDATE', async () => {
      queryReturns([makeRow()]);
      await storage.upsertTool({
        name: 'add_numbers',
        description: 'Adds two numbers',
        parametersSchema: {},
        implementation: 'return 1;',
        personalityId: null,
        createdBy: 'ai',
      });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/ON CONFLICT/i);
      expect(sql).toMatch(/DO UPDATE/i);
    });

    it('stringifies parametersSchema as JSON before inserting', async () => {
      const schema = { type: 'object', properties: { x: { type: 'number' } } };
      queryReturns([makeRow()]);
      await storage.upsertTool({
        name: 'tool',
        description: '',
        parametersSchema: schema,
        implementation: 'return 1;',
        personalityId: null,
        createdBy: 'ai',
      });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(JSON.stringify(schema));
    });

    it('passes personalityId through to query', async () => {
      queryReturns([makeRow({ personality_id: 'p-99' })]);
      await storage.upsertTool({
        name: 'tool',
        description: '',
        parametersSchema: {},
        implementation: 'return 1;',
        personalityId: 'p-99',
        createdBy: 'friday',
      });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain('p-99');
    });

    it('throws when query returns no row', async () => {
      queryReturns([]);
      await expect(
        storage.upsertTool({
          name: 'x',
          description: '',
          parametersSchema: {},
          implementation: '',
          personalityId: null,
          createdBy: 'ai',
        })
      ).rejects.toThrow('Failed to upsert dynamic tool');
    });
  });

  // ── listTools ───────────────────────────────────────────────────────────────

  describe('listTools', () => {
    it('returns an empty array when no tools exist', async () => {
      queryReturns([]);
      const tools = await storage.listTools();
      expect(tools).toEqual([]);
    });

    it('maps multiple rows to DynamicTool objects', async () => {
      queryReturns([
        makeRow({ id: 'dt-1', name: 'tool_one' }),
        makeRow({ id: 'dt-2', name: 'tool_two' }),
      ]);
      const tools = await storage.listTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('tool_one');
      expect(tools[1].name).toBe('tool_two');
    });

    it('orders by created_at ASC', async () => {
      queryReturns([]);
      await storage.listTools();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/ORDER BY created_at ASC/i);
    });
  });

  // ── getTool ─────────────────────────────────────────────────────────────────

  describe('getTool', () => {
    it('returns null when tool is not found', async () => {
      queryReturns([]);
      const result = await storage.getTool('no_such_tool');
      expect(result).toBeNull();
    });

    it('returns a DynamicTool when found', async () => {
      queryReturns([makeRow({ name: 'add_numbers' })]);
      const tool = await storage.getTool('add_numbers');
      expect(tool).not.toBeNull();
      expect(tool!.name).toBe('add_numbers');
    });

    it('queries by name', async () => {
      queryReturns([]);
      await storage.getTool('my_tool');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain('my_tool');
    });
  });

  // ── deleteTool ──────────────────────────────────────────────────────────────

  describe('deleteTool', () => {
    it('returns true when a row is deleted', async () => {
      executeReturns(1);
      expect(await storage.deleteTool('add_numbers')).toBe(true);
    });

    it('returns false when no row is deleted', async () => {
      executeReturns(0);
      expect(await storage.deleteTool('no_such_tool')).toBe(false);
    });

    it('queries by name', async () => {
      executeReturns(1);
      await storage.deleteTool('my_tool');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain('my_tool');
    });
  });
});
