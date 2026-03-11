import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { SoulStorage } from './storage.js';
import type { PersonalityCreate, SkillCreate } from './types.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

// ── Helpers ──────────────────────────────────────────────────────

const TEST_PERSONALITY: PersonalityCreate = {
  name: 'TestBot',
  description: 'A test personality',
  systemPrompt: 'You are a test bot.',
  traits: { humor: 'dry', formality: 'casual' },
  sex: 'unspecified',
  voice: '',
  preferredLanguage: '',
  defaultModel: null,
  includeArchetypes: true,
};

const TEST_SKILL: SkillCreate = {
  name: 'code-review',
  description: 'Reviews code for issues',
  instructions: 'Review the code carefully. Look for bugs, security issues, and style problems.',
  tools: [],
  triggerPatterns: ['review', 'code review'],
  enabled: true,
  source: 'user',
  status: 'active',
};

// ── SoulStorage Tests ────────────────────────────────────────────

describe('SoulStorage', () => {
  let storage: SoulStorage;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new SoulStorage();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('personalities', () => {
    it('should create and retrieve a personality', async () => {
      const p = await storage.createPersonality(TEST_PERSONALITY);
      expect(p.id).toBeDefined();
      expect(p.name).toBe('TestBot');
      expect(p.description).toBe('A test personality');
      expect(p.systemPrompt).toBe('You are a test bot.');
      expect(p.traits).toEqual({ humor: 'dry', formality: 'casual' });
      expect(p.sex).toBe('unspecified');
      expect(p.isActive).toBe(false);

      const retrieved = await storage.getPersonality(p.id);
      expect(retrieved).toEqual(p);
    });

    it('should return null for non-existent personality', async () => {
      expect(await storage.getPersonality('nonexistent')).toBeNull();
    });

    it('should set and get active personality', async () => {
      const p = await storage.createPersonality(TEST_PERSONALITY);
      expect(await storage.getActivePersonality()).toBeNull();

      await storage.setActivePersonality(p.id);
      const active = await storage.getActivePersonality();
      expect(active?.id).toBe(p.id);
      expect(active?.isActive).toBe(true);
    });

    it('should deactivate previous personality when setting new active', async () => {
      const p1 = await storage.createPersonality(TEST_PERSONALITY);
      const p2 = await storage.createPersonality({ ...TEST_PERSONALITY, name: 'Bot2' });

      await storage.setActivePersonality(p1.id);
      await storage.setActivePersonality(p2.id);

      const p1Updated = await storage.getPersonality(p1.id);
      const p2Updated = await storage.getPersonality(p2.id);
      expect(p1Updated?.isActive).toBe(false);
      expect(p2Updated?.isActive).toBe(true);
    });

    it('should throw when setting non-existent personality as active', async () => {
      await expect(storage.setActivePersonality('nonexistent')).rejects.toThrow(
        'Personality not found'
      );
    });

    it('should update a personality', async () => {
      const p = await storage.createPersonality(TEST_PERSONALITY);
      const updated = await storage.updatePersonality(p.id, {
        name: 'UpdatedBot',
        voice: 'warm and friendly',
      });
      expect(updated.name).toBe('UpdatedBot');
      expect(updated.voice).toBe('warm and friendly');
      expect(updated.description).toBe(p.description); // unchanged
    });

    it('should throw when updating non-existent personality', async () => {
      await expect(storage.updatePersonality('nonexistent', { name: 'X' })).rejects.toThrow(
        'Personality not found'
      );
    });

    it('should delete a personality', async () => {
      const p = await storage.createPersonality(TEST_PERSONALITY);
      expect(await storage.deletePersonality(p.id)).toBe(true);
      expect(await storage.getPersonality(p.id)).toBeNull();
    });

    it('should return false when deleting non-existent personality', async () => {
      expect(await storage.deletePersonality('nonexistent')).toBe(false);
    });

    it('should list personalities', async () => {
      await storage.createPersonality(TEST_PERSONALITY);
      await storage.createPersonality({ ...TEST_PERSONALITY, name: 'Bot2' });
      const list = await storage.listPersonalities();
      expect(list.personalities).toHaveLength(2);
    });

    it('should count personalities', async () => {
      expect(await storage.getPersonalityCount()).toBe(0);
      await storage.createPersonality(TEST_PERSONALITY);
      expect(await storage.getPersonalityCount()).toBe(1);
    });

    it('should store sex field correctly', async () => {
      const p = await storage.createPersonality({ ...TEST_PERSONALITY, sex: 'female' });
      expect(p.sex).toBe('female');
    });

    it('should store voice field correctly', async () => {
      const p = await storage.createPersonality({
        ...TEST_PERSONALITY,
        voice: 'warm and authoritative',
      });
      expect(p.voice).toBe('warm and authoritative');
    });

    it('should store preferredLanguage field correctly', async () => {
      const p = await storage.createPersonality({
        ...TEST_PERSONALITY,
        preferredLanguage: 'Spanish',
      });
      expect(p.preferredLanguage).toBe('Spanish');
    });

    it('should create personality with modelFallbacks', async () => {
      const fallbacks = [{ provider: 'openai', model: 'gpt-4o' }];
      const p = await storage.createPersonality({ ...TEST_PERSONALITY, modelFallbacks: fallbacks });
      expect(p.modelFallbacks).toEqual(fallbacks);
    });

    it('should default modelFallbacks to empty array', async () => {
      const p = await storage.createPersonality(TEST_PERSONALITY);
      expect(p.modelFallbacks).toEqual([]);
    });

    it('should update modelFallbacks', async () => {
      const p = await storage.createPersonality(TEST_PERSONALITY);
      const fallbacks = [
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
      ];
      const updated = await storage.updatePersonality(p.id, { modelFallbacks: fallbacks });
      expect(updated.modelFallbacks).toEqual(fallbacks);
    });

    it('should clear modelFallbacks on update', async () => {
      const p = await storage.createPersonality({
        ...TEST_PERSONALITY,
        modelFallbacks: [{ provider: 'openai', model: 'gpt-4o' }],
      });
      const updated = await storage.updatePersonality(p.id, { modelFallbacks: [] });
      expect(updated.modelFallbacks).toEqual([]);
    });

    it('should roundtrip modelFallbacks through get', async () => {
      const fallbacks = [
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ];
      const p = await storage.createPersonality({ ...TEST_PERSONALITY, modelFallbacks: fallbacks });
      const retrieved = await storage.getPersonality(p.id);
      expect(retrieved?.modelFallbacks).toEqual(fallbacks);
    });
  });

  describe('agent name (soul_meta)', () => {
    it('should return null when no agent name is set', async () => {
      expect(await storage.getAgentName()).toBeNull();
    });

    it('should set and get the agent name', async () => {
      await storage.setAgentName('JARVIS');
      expect(await storage.getAgentName()).toBe('JARVIS');
    });

    it('should overwrite existing agent name', async () => {
      await storage.setAgentName('JARVIS');
      await storage.setAgentName('FRIDAY');
      expect(await storage.getAgentName()).toBe('FRIDAY');
    });
  });

  describe('skills', () => {
    it('should create and retrieve a skill', async () => {
      const s = await storage.createSkill(TEST_SKILL);
      expect(s.id).toBeDefined();
      expect(s.name).toBe('code-review');
      expect(s.instructions).toContain('Review the code');
      expect(s.enabled).toBe(true);
      expect(s.source).toBe('user');
      expect(s.status).toBe('active');
      expect(s.usageCount).toBe(0);
      expect(s.lastUsedAt).toBeNull();

      const retrieved = await storage.getSkill(s.id);
      expect(retrieved).toEqual(s);
    });

    it('should return null for non-existent skill', async () => {
      expect(await storage.getSkill('nonexistent')).toBeNull();
    });

    it('should update a skill', async () => {
      const s = await storage.createSkill(TEST_SKILL);
      const updated = await storage.updateSkill(s.id, { name: 'updated-review' });
      expect(updated.name).toBe('updated-review');
      expect(updated.instructions).toBe(s.instructions); // unchanged
    });

    it('should throw when updating non-existent skill', async () => {
      await expect(storage.updateSkill('nonexistent', { name: 'X' })).rejects.toThrow(
        'Skill not found'
      );
    });

    it('should delete a skill', async () => {
      const s = await storage.createSkill(TEST_SKILL);
      expect(await storage.deleteSkill(s.id)).toBe(true);
      expect(await storage.getSkill(s.id)).toBeNull();
    });

    it('should list skills with filters', async () => {
      await storage.createSkill(TEST_SKILL);
      await storage.createSkill({
        ...TEST_SKILL,
        name: 'debug',
        source: 'ai_proposed',
        status: 'pending_approval',
      });

      expect((await storage.listSkills()).skills).toHaveLength(2);
      expect((await storage.listSkills({ source: 'user' })).skills).toHaveLength(1);
      expect((await storage.listSkills({ status: 'pending_approval' })).skills).toHaveLength(1);
    });

    it('should get enabled skills only', async () => {
      await storage.createSkill(TEST_SKILL);
      await storage.createSkill({ ...TEST_SKILL, name: 'disabled', enabled: false });
      await storage.createSkill({ ...TEST_SKILL, name: 'pending', status: 'pending_approval' });

      const enabled = await storage.getEnabledSkills();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].name).toBe('code-review');
    });

    it('should get pending skills', async () => {
      await storage.createSkill(TEST_SKILL);
      await storage.createSkill({ ...TEST_SKILL, name: 'pending1', status: 'pending_approval' });

      const pending = await storage.getPendingSkills();
      expect(pending).toHaveLength(1);
      expect(pending[0].name).toBe('pending1');
    });

    it('should increment usage', async () => {
      const s = await storage.createSkill(TEST_SKILL);
      await storage.incrementUsage(s.id);
      await storage.incrementUsage(s.id);

      const updated = await storage.getSkill(s.id);
      expect(updated?.usageCount).toBe(2);
      expect(updated?.lastUsedAt).toBeGreaterThan(0);
    });

    it('should count skills', async () => {
      expect(await storage.getSkillCount()).toBe(0);
      await storage.createSkill(TEST_SKILL);
      expect(await storage.getSkillCount()).toBe(1);
    });

    it('should store tools as JSON', async () => {
      const s = await storage.createSkill({
        ...TEST_SKILL,
        tools: [
          {
            name: 'search',
            description: 'Search tool',
            parameters: { type: 'object', properties: { query: { type: 'string' } } },
          },
        ],
      });
      expect(s.tools).toHaveLength(1);
      expect(s.tools[0].name).toBe('search');
    });
  });
});
