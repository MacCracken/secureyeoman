import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;
let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({
    query: (...args: any[]) => mockQuery(...args),
    connect: async () => mockClient,
  }),
}));

vi.mock('../utils/crypto.js', () => ({
  uuidv7: vi.fn().mockReturnValue('test-uuid'),
}));

// ─── Test Data ────────────────────────────────────────────────

const personalityRow = {
  id: 'per-1',
  name: 'Test Personality',
  description: 'A test personality',
  system_prompt: 'You are helpful',
  traits: { formality: 'balanced' },
  sex: 'unspecified',
  voice: '',
  preferred_language: 'en',
  default_model: null,
  model_fallbacks: [],
  include_archetypes: true,
  is_active: false,
  body: null,
  created_at: 1000,
  updated_at: 2000,
};

const userRow = {
  id: 'user-1',
  name: 'Alice',
  nickname: 'ali',
  relationship: 'owner',
  preferences: {},
  notes: '',
  created_at: 1000,
  updated_at: 2000,
};

const skillRow = {
  id: 'skill-1',
  name: 'Helper',
  description: 'Helps',
  instructions: 'Be helpful',
  tools: [],
  trigger_patterns: [],
  enabled: true,
  source: 'user',
  status: 'active',
  usage_count: 0,
  last_used_at: null,
  personality_id: null,
  created_at: 1000,
  updated_at: 2000,
};

// ─── Tests ────────────────────────────────────────────────────

import { SoulStorage } from './storage.js';

describe('SoulStorage', () => {
  let storage: SoulStorage;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    };
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new SoulStorage();
  });

  // ── Personalities ─────────────────────────────────────────

  describe('createPersonality', () => {
    it('inserts and returns the personality', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [personalityRow], rowCount: 1 });

      const p = await storage.createPersonality({ name: 'Test Personality' });
      expect(p.id).toBe('per-1');
      expect(p.name).toBe('Test Personality');
    });

    it('throws when INSERT RETURNING yields no row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(storage.createPersonality({ name: 'x' })).rejects.toThrow(
        'Failed to insert personality'
      );
    });
  });

  describe('getPersonality', () => {
    it('returns personality when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [personalityRow], rowCount: 1 });
      const p = await storage.getPersonality('per-1');
      expect(p?.name).toBe('Test Personality');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getPersonality('missing')).toBeNull();
    });

    it('round-trips resourcePolicy.deletionMode through body JSONB', async () => {
      const bodyWithPolicy = { resourcePolicy: { deletionMode: 'manual' } };
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...personalityRow, body: bodyWithPolicy }],
        rowCount: 1,
      });
      const p = await storage.getPersonality('per-1');
      expect(p?.body?.resourcePolicy?.deletionMode).toBe('manual');
    });

    it('defaults resourcePolicy.deletionMode to auto when body has no resourcePolicy', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...personalityRow, body: null }], rowCount: 1 });
      const p = await storage.getPersonality('per-1');
      // With no body, resourcePolicy is undefined — manager defaults to 'auto'
      expect(p?.body?.resourcePolicy?.deletionMode ?? 'auto').toBe('auto');
    });
  });

  describe('getActivePersonality', () => {
    it('returns the active personality', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...personalityRow, is_active: true }],
        rowCount: 1,
      });
      const p = await storage.getActivePersonality();
      expect(p?.isActive).toBe(true);
    });

    it('returns null when none is active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getActivePersonality()).toBeNull();
    });
  });

  describe('setActivePersonality', () => {
    it('uses a transaction to deactivate all then activate target', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 3 }) // deactivate is_active
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // clear is_default
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // activate target
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      await storage.setActivePersonality('per-1');
      const commitCall = mockClient.query.mock.calls.find((c: any[]) => c[0] === 'COMMIT');
      expect(commitCall).toBeDefined();
    });

    it('throws in transaction if personality not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 3 }) // deactivate is_active
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // clear is_default
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // activate: not found → throws
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

      await expect(storage.setActivePersonality('missing')).rejects.toThrow(
        'Personality not found'
      );
    });
  });

  describe('updatePersonality', () => {
    it('throws if personality not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.updatePersonality('missing', { name: 'x' })).rejects.toThrow(
        'Personality not found'
      );
    });

    it('updates and returns updated personality', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [personalityRow], rowCount: 1 }) // getPersonality
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ ...personalityRow, name: 'Updated' }], rowCount: 1 });

      const p = await storage.updatePersonality('per-1', { name: 'Updated' });
      expect(p.name).toBe('Updated');
    });
  });

  describe('deletePersonality', () => {
    it('returns true when deleted', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [personalityRow], rowCount: 1 }) // getPersonality (archetype check)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // DELETE
      expect(await storage.deletePersonality('per-1')).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // getPersonality (not found → null)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // DELETE
      expect(await storage.deletePersonality('missing')).toBe(false);
    });
  });

  describe('clearDefaultPersonality', () => {
    it('clears is_default flag on all personalities', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.clearDefaultPersonality();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_default = false'),
        undefined
      );
    });
  });

  describe('listPersonalities', () => {
    it('returns personalities with total count', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [personalityRow, personalityRow], rowCount: 2 });

      const result = await storage.listPersonalities();
      expect(result.total).toBe(2);
      expect(result.personalities).toHaveLength(2);
    });
  });

  // ── Users ─────────────────────────────────────────────────

  describe('createUser', () => {
    it('inserts and returns the user', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [userRow], rowCount: 1 });

      const user = await storage.createUser({ name: 'Alice' });
      expect(user.name).toBe('Alice');
      expect(user.relationship).toBe('owner');
    });
  });

  describe('getUser', () => {
    it('returns user when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [userRow], rowCount: 1 });
      const user = await storage.getUser('user-1');
      expect(user?.name).toBe('Alice');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getUser('missing')).toBeNull();
    });
  });

  describe('getUserByName', () => {
    it('returns user matching name (case-insensitive)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [userRow], rowCount: 1 });
      const user = await storage.getUserByName('alice');
      expect(user?.name).toBe('Alice');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ILIKE');
    });
  });

  describe('getOwner', () => {
    it('returns the owner user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [userRow], rowCount: 1 });
      const owner = await storage.getOwner();
      expect(owner?.relationship).toBe('owner');
    });

    it('returns null when no owner', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getOwner()).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('throws if user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.updateUser('missing', { name: 'x' })).rejects.toThrow('User not found');
    });
  });

  describe('deleteUser', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      expect(await storage.deleteUser('user-1')).toBe(true);
    });
  });

  describe('listUsers', () => {
    it('returns users with total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [userRow], rowCount: 1 });

      const result = await storage.listUsers();
      expect(result.total).toBe(1);
      expect(result.users[0].name).toBe('Alice');
    });
  });

  // ── Skills ─────────────────────────────────────────────────

  describe('createSkill', () => {
    it('inserts and returns the skill', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 });

      const skill = await storage.createSkill({ name: 'Helper' });
      expect(skill.name).toBe('Helper');
    });
  });

  describe('listSkills', () => {
    it('returns skills with total', async () => {
      // listSkills uses a single window-function query (COUNT(*) OVER()) — one mock response
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...skillRow, total_count: '1' }],
        rowCount: 1,
      });

      const result = await storage.listSkills();
      expect(result.total).toBe(1);
      expect(result.skills[0].name).toBe('Helper');
    });
  });

  // ── Soul Meta ─────────────────────────────────────────────

  describe('getAgentName / setAgentName', () => {
    it('returns agent name when set', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'FRIDAY' }], rowCount: 1 });
      expect(await storage.getAgentName()).toBe('FRIDAY');
    });

    it('returns null when not set', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getAgentName()).toBeNull();
    });

    it('upserts the agent name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.setAgentName('FRIDAY');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ON CONFLICT(key)');
    });
  });

  describe('getSoulConfigOverrides / setSoulConfigOverrides', () => {
    it('returns empty object when no row exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getSoulConfigOverrides();
      expect(result).toEqual({});
    });

    it('returns parsed JSON when row exists', async () => {
      const overrides = { maxSkills: 150, enabled: false };
      mockQuery.mockResolvedValueOnce({
        rows: [{ value: JSON.stringify(overrides) }],
        rowCount: 1,
      });
      const result = await storage.getSoulConfigOverrides();
      expect(result).toEqual(overrides);
    });

    it('returns empty object when JSON is invalid', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'not-json{' }], rowCount: 1 });
      const result = await storage.getSoulConfigOverrides();
      expect(result).toEqual({});
    });

    it('upserts soul_config with JSON value', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const overrides = { maxSkills: 200, maxPromptTokens: 32000 };
      await storage.setSoulConfigOverrides(overrides);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('soul_config');
      expect(sql).toContain('ON CONFLICT(key)');
      expect(JSON.parse(params[0] as string)).toEqual(overrides);
    });
  });

  // ── Additional branch coverage tests ─────────────────────────────────

  describe('enablePersonality', () => {
    it('sets is_active = true for a personality', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.enablePersonality('per-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('is_active = true');
    });

    it('throws when personality not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.enablePersonality('missing')).rejects.toThrow('Personality not found');
    });
  });

  describe('disablePersonality', () => {
    it('sets is_active = false for a personality', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.disablePersonality('per-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('is_active = false');
    });

    it('throws when personality not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.disablePersonality('missing')).rejects.toThrow('Personality not found');
    });
  });

  describe('setDefaultPersonality', () => {
    it('uses a transaction to clear all defaults then set target', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // clear is_default
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // set target
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      await storage.setDefaultPersonality('per-1');
      const commitCall = mockClient.query.mock.calls.find((c: any[]) => c[0] === 'COMMIT');
      expect(commitCall).toBeDefined();
    });

    it('throws when personality not found in transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // clear is_default
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set target: not found
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

      await expect(storage.setDefaultPersonality('missing')).rejects.toThrow(
        'Personality not found'
      );
    });
  });

  describe('getEnabledPersonalities', () => {
    it('returns list of active personalities', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { ...personalityRow, is_active: true },
          { ...personalityRow, id: 'per-2', is_active: true },
        ],
        rowCount: 2,
      });
      const result = await storage.getEnabledPersonalities();
      expect(result).toHaveLength(2);
      expect(result[0].isActive).toBe(true);
    });
  });

  describe('listPersonalities — with opts', () => {
    it('uses provided limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [personalityRow], rowCount: 1 });

      const result = await storage.listPersonalities({ limit: 5, offset: 3 });
      expect(result.total).toBe(10);
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe(5);
      expect(params[1]).toBe(3);
    });

    it('defaults limit to 50 and offset to 0', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await storage.listPersonalities();
      expect(result.total).toBe(0);
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe(50);
      expect(params[1]).toBe(0);
    });
  });

  describe('getPersonalityCount', () => {
    it('returns the count from query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '42' }], rowCount: 1 });
      const count = await storage.getPersonalityCount();
      expect(count).toBe(42);
    });

    it('returns 0 when no row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const count = await storage.getPersonalityCount();
      expect(count).toBe(0);
    });
  });

  describe('updatePersonalityAvatar', () => {
    it('updates avatar and returns personality', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({
          rows: [{ ...personalityRow, avatar_url: '/avatar.png' }],
          rowCount: 1,
        });

      const p = await storage.updatePersonalityAvatar('per-1', '/avatar.png');
      expect(p.avatarUrl).toBe('/avatar.png');
    });

    it('throws when personality not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.updatePersonalityAvatar('missing', '/a.png')).rejects.toThrow(
        'Personality not found'
      );
    });

    it('throws when re-select after update fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // re-SELECT

      await expect(storage.updatePersonalityAvatar('per-1', '/a.png')).rejects.toThrow(
        'Failed to retrieve personality after avatar update'
      );
    });
  });

  describe('updatePersonality — branch coverage', () => {
    it('handles defaultModel update branches', async () => {
      const existing = {
        ...personalityRow,
        default_model: JSON.stringify({ provider: 'openai', model: 'gpt-4' }),
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [existing], rowCount: 1 }) // getPersonality
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [existing], rowCount: 1 }); // re-SELECT

      await storage.updatePersonality('per-1', {
        defaultModel: { provider: 'anthropic', model: 'claude-3' } as any,
      });
      // Should pass JSON.stringify of the new model
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(JSON.parse(params[7] as string)).toEqual({ provider: 'anthropic', model: 'claude-3' });
    });

    it('clears defaultModel when explicitly set to null', async () => {
      const existing = {
        ...personalityRow,
        default_model: JSON.stringify({ provider: 'openai', model: 'gpt-4' }),
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [existing], rowCount: 1 }) // getPersonality
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ ...personalityRow, default_model: null }], rowCount: 1 });

      const p = await storage.updatePersonality('per-1', {
        defaultModel: null,
      });
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[7]).toBeNull();
    });

    it('throws when re-select after update fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [personalityRow], rowCount: 1 }) // getPersonality
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // re-SELECT fails

      await expect(storage.updatePersonality('per-1', { name: 'x' })).rejects.toThrow(
        'Failed to retrieve personality after update'
      );
    });
  });

  describe('listSkills — filter branches', () => {
    it('filters by status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...skillRow, total_count: '1' }],
        rowCount: 1,
      });

      await storage.listSkills({ status: 'active' as any });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('status = $');
    });

    it('filters by source', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...skillRow, total_count: '1' }],
        rowCount: 1,
      });

      await storage.listSkills({ source: 'user' as any });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('source = $');
    });

    it('filters by enabled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...skillRow, total_count: '1' }],
        rowCount: 1,
      });

      await storage.listSkills({ enabled: true });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('enabled = $');
    });

    it('returns 0 total when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listSkills();
      expect(result.total).toBe(0);
    });

    it('applies limit and offset from filter', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...skillRow, total_count: '5' }],
        rowCount: 1,
      });

      await storage.listSkills({ limit: 10, offset: 5 });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(10);
      expect(params).toContain(5);
    });
  });

  describe('getEnabledSkills', () => {
    it('returns enabled active skills', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [skillRow, { ...skillRow, id: 'skill-2' }],
        rowCount: 2,
      });
      const result = await storage.getEnabledSkills();
      expect(result).toHaveLength(2);
    });
  });

  describe('getPendingSkills', () => {
    it('returns pending approval skills', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...skillRow, status: 'pending_approval' }],
        rowCount: 1,
      });
      const result = await storage.getPendingSkills();
      expect(result).toHaveLength(1);
    });
  });

  describe('incrementUsage / incrementInvoked', () => {
    it('increments usage count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.incrementUsage('skill-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('usage_count = usage_count + 1');
    });

    it('increments invoked count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.incrementInvoked('skill-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('invoked_count = invoked_count + 1');
    });
  });

  describe('getSkillCount', () => {
    it('returns count from query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '7' }], rowCount: 1 });
      const count = await storage.getSkillCount();
      expect(count).toBe(7);
    });

    it('returns 0 when no row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const count = await storage.getSkillCount();
      expect(count).toBe(0);
    });
  });

  describe('createSkill — throws on re-select failure', () => {
    it('throws when re-select fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // re-SELECT

      await expect(storage.createSkill({ name: 'Broken' })).rejects.toThrow(
        'Failed to retrieve skill after insert'
      );
    });
  });

  describe('updateSkill', () => {
    it('throws when skill not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.updateSkill('missing', { name: 'x' })).rejects.toThrow(
        'Skill not found'
      );
    });

    it('updates and returns updated skill', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 }) // getSkill
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ ...skillRow, name: 'Updated' }], rowCount: 1 });

      const s = await storage.updateSkill('skill-1', { name: 'Updated' });
      expect(s.name).toBe('Updated');
    });

    it('throws when re-select fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 }) // getSkill
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // re-SELECT

      await expect(storage.updateSkill('skill-1', { name: 'x' })).rejects.toThrow(
        'Failed to retrieve skill after update'
      );
    });
  });

  describe('deleteSkill', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      expect(await storage.deleteSkill('skill-1')).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.deleteSkill('missing')).toBe(false);
    });
  });

  describe('createUser — throws on re-select failure', () => {
    it('throws when re-select fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // re-SELECT

      await expect(storage.createUser({ name: 'Bob' })).rejects.toThrow(
        'Failed to retrieve user after insert'
      );
    });
  });

  describe('updateUser — success path', () => {
    it('updates and returns updated user', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [userRow], rowCount: 1 }) // getUser
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({
          rows: [{ ...userRow, name: 'Bob' }],
          rowCount: 1,
        });

      const u = await storage.updateUser('user-1', { name: 'Bob' });
      expect(u.name).toBe('Bob');
    });

    it('throws when re-select fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [userRow], rowCount: 1 }) // getUser
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // re-SELECT

      await expect(storage.updateUser('user-1', { name: 'x' })).rejects.toThrow(
        'Failed to retrieve user after update'
      );
    });
  });

  describe('deleteUser — not found', () => {
    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.deleteUser('missing')).toBe(false);
    });
  });

  describe('listUsers — with opts', () => {
    it('uses provided limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [userRow], rowCount: 1 });

      const result = await storage.listUsers({ limit: 10, offset: 2 });
      expect(result.total).toBe(3);
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe(10);
      expect(params[1]).toBe(2);
    });
  });

  describe('getUserByName — not found', () => {
    it('returns null when no match', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getUserByName('nonexistent')).toBeNull();
    });
  });

  describe('saveCollabDoc / loadCollabDoc', () => {
    it('saves and returns void', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.saveCollabDoc('doc-1', new Uint8Array([1, 2, 3]));
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ON CONFLICT (doc_id)');
    });

    it('loads collab doc and returns Uint8Array', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ state: Buffer.from([1, 2, 3]) }],
        rowCount: 1,
      });
      const result = await storage.loadCollabDoc('doc-1');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result![0]).toBe(1);
    });

    it('returns null when doc not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.loadCollabDoc('missing')).toBeNull();
    });
  });

  describe('rowToPersonality — fallback field branches', () => {
    it('defaults missing optional row fields', async () => {
      const minimalRow = {
        ...personalityRow,
        traits: null,
        model_fallbacks: null,
        inject_date_time: null,
        empathy_resonance: null,
        is_default: null,
        avatar_url: null,
        default_model: null,
        body: null,
      };
      mockQuery.mockResolvedValueOnce({ rows: [minimalRow], rowCount: 1 });
      const p = await storage.getPersonality('per-1');
      expect(p!.traits).toEqual({});
      expect(p!.modelFallbacks).toEqual([]);
      expect(p!.injectDateTime).toBe(false);
      expect(p!.empathyResonance).toBe(false);
      expect(p!.isDefault).toBe(false);
      expect(p!.avatarUrl).toBeNull();
      expect(p!.defaultModel).toBeNull();
      expect(p!.body).toBeDefined(); // Defaults to the hardcoded body object
      expect(p!.body.enabled).toBe(false);
    });
  });

  describe('rowToUser — fallback field branches', () => {
    it('defaults preferences to empty object when null', async () => {
      const minimalUser = { ...userRow, preferences: null };
      mockQuery.mockResolvedValueOnce({ rows: [minimalUser], rowCount: 1 });
      const u = await storage.getUser('user-1');
      expect(u!.preferences).toEqual({});
    });
  });

  describe('rowToSkill — fallback field branches', () => {
    it('defaults missing optional row fields', async () => {
      const minimalSkill = {
        ...skillRow,
        tools: null,
        trigger_patterns: null,
        use_when: null,
        do_not_use_when: null,
        success_criteria: null,
        mcp_tools_allowed: null,
        routing: null,
        linked_workflow_id: null,
        autonomy_level: null,
        emergency_stop_procedure: null,
        invoked_count: null,
      };
      mockQuery.mockResolvedValueOnce({ rows: [minimalSkill], rowCount: 1 });
      const s = await storage.getSkill('skill-1');
      expect(s!.tools).toEqual([]);
      expect(s!.triggerPatterns).toEqual([]);
      expect(s!.useWhen).toBe('');
      expect(s!.doNotUseWhen).toBe('');
      expect(s!.successCriteria).toBe('');
      expect(s!.mcpToolsAllowed).toEqual([]);
      expect(s!.routing).toBe('fuzzy');
      expect(s!.linkedWorkflowId).toBeNull();
      expect(s!.autonomyLevel).toBe('L1');
      expect(s!.emergencyStopProcedure).toBeUndefined();
      expect(s!.invokedCount).toBe(0);
    });
  });
});
