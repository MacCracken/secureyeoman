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
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [personalityRow], rowCount: 1 });

      const p = await storage.createPersonality({ name: 'Test Personality' });
      expect(p.id).toBe('per-1');
      expect(p.name).toBe('Test Personality');
    });

    it('throws when re-select fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(storage.createPersonality({ name: 'x' })).rejects.toThrow(
        'Failed to retrieve personality after insert'
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
        .mockResolvedValueOnce({ rows: [], rowCount: 3 }) // deactivate all
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // activate target
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      await storage.setActivePersonality('per-1');
      const commitCall = mockClient.query.mock.calls.find((c: any[]) => c[0] === 'COMMIT');
      expect(commitCall).toBeDefined();
    });

    it('throws in transaction if personality not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 3 }) // deactivate all
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
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      expect(await storage.deletePersonality('per-1')).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.deletePersonality('missing')).toBe(false);
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
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 });

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
});
