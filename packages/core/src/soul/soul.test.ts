import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { SoulStorage } from './storage.js';
import { SoulManager } from './manager.js';
import type { SoulConfig, SoulManagerDeps, PersonalityCreate, SkillCreate } from './types.js';
import type { SecureLogger } from '../logging/logger.js';
import { AuditChain, InMemoryAuditStorage } from '../logging/audit-chain.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';
import { BrainStorage } from '../brain/storage.js';
import { BrainManager } from '../brain/manager.js';
import { MarketplaceStorage } from '../marketplace/storage.js';
import { MarketplaceManager } from '../marketplace/manager.js';

// ── Helpers ──────────────────────────────────────────────────────

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

function defaultConfig(overrides?: Partial<SoulConfig>): SoulConfig {
  return {
    enabled: true,
    learningMode: ['user_authored'],
    maxSkills: 50,
    maxPromptTokens: 4096,
    ...overrides,
  };
}

function createDeps(): SoulManagerDeps & { auditStorage: InMemoryAuditStorage } {
  const auditStorage = new InMemoryAuditStorage();
  const auditChain = new AuditChain({
    storage: auditStorage,
    signingKey: 'test-signing-key-must-be-at-least-32-chars!!',
  });
  return {
    auditChain,
    auditStorage,
    logger: noopLogger(),
  };
}

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

// ── SoulManager Tests ────────────────────────────────────────────

describe('SoulManager', () => {
  let storage: SoulStorage;
  let manager: SoulManager;
  let deps: SoulManagerDeps;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new SoulStorage();
    deps = createDeps();
    manager = new SoulManager(storage, defaultConfig(), deps);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('agent name', () => {
    it('should return null when no agent name is set', async () => {
      expect(await manager.getAgentName()).toBeNull();
    });

    it('should set and get the agent name', async () => {
      await manager.setAgentName('JARVIS');
      expect(await manager.getAgentName()).toBe('JARVIS');
    });

    it('should trim whitespace from agent name', async () => {
      await manager.setAgentName('  JARVIS  ');
      expect(await manager.getAgentName()).toBe('JARVIS');
    });

    it('should throw when setting empty agent name', async () => {
      await expect(manager.setAgentName('')).rejects.toThrow('Agent name cannot be empty');
    });

    it('should throw when setting whitespace-only agent name', async () => {
      await expect(manager.setAgentName('   ')).rejects.toThrow('Agent name cannot be empty');
    });
  });

  describe('onboarding', () => {
    it('should detect when onboarding is needed (no agent name, no personality)', async () => {
      expect(await manager.needsOnboarding()).toBe(true);
    });

    it('should still need onboarding with agent name but no personality', async () => {
      await manager.setAgentName('JARVIS');
      expect(await manager.needsOnboarding()).toBe(true);
    });

    it('should still need onboarding with personality but no agent name', async () => {
      await manager.createPersonality(TEST_PERSONALITY);
      expect(await manager.needsOnboarding()).toBe(true);
    });

    it('should not need onboarding after setting agent name and creating personality', async () => {
      await manager.setAgentName('FRIDAY');
      await manager.createDefaultPersonality();
      expect(await manager.needsOnboarding()).toBe(false);
    });

    it('should create default personality using the agent name', async () => {
      await manager.setAgentName('JARVIS');
      const p = await manager.createDefaultPersonality();
      expect(p.name).toBe('JARVIS');
      expect(p.systemPrompt).toContain('You are JARVIS');
      expect(p.isActive).toBe(true);
      expect(p.traits).toEqual({ formality: 'balanced', humor: 'subtle', verbosity: 'concise' });
    });

    it('should fall back to FRIDAY when no agent name is set', async () => {
      const p = await manager.createDefaultPersonality();
      expect(p.name).toBe('FRIDAY');
      expect(p.systemPrompt).toContain('You are FRIDAY');
    });
  });

  describe('personality management', () => {
    it('should create, list, and delete personalities', async () => {
      const p = await manager.createPersonality(TEST_PERSONALITY);
      expect((await manager.listPersonalities()).personalities).toHaveLength(1);
      await manager.deletePersonality(p.id);
      expect((await manager.listPersonalities()).personalities).toHaveLength(0);
    });

    it('should prevent deleting the active personality', async () => {
      const p = await manager.createPersonality(TEST_PERSONALITY);
      await manager.setPersonality(p.id);
      await expect(manager.deletePersonality(p.id)).rejects.toThrow(
        'Cannot delete the active personality'
      );
    });

    it('should update personality', async () => {
      const p = await manager.createPersonality(TEST_PERSONALITY);
      const updated = await manager.updatePersonality(p.id, { name: 'NewName' });
      expect(updated.name).toBe('NewName');
    });
  });

  describe('skill management', () => {
    it('should create and list skills', async () => {
      await manager.createSkill(TEST_SKILL);
      expect((await manager.listSkills()).skills).toHaveLength(1);
    });

    it('should enforce max skills limit', async () => {
      const mgr = new SoulManager(storage, defaultConfig({ maxSkills: 2 }), deps);
      await mgr.createSkill(TEST_SKILL);
      await mgr.createSkill({ ...TEST_SKILL, name: 'skill2' });
      await expect(mgr.createSkill({ ...TEST_SKILL, name: 'skill3' })).rejects.toThrow(
        'Maximum skill limit'
      );
    });

    it('should enable and disable skills', async () => {
      const s = await manager.createSkill(TEST_SKILL);
      await manager.disableSkill(s.id);
      expect((await manager.getSkill(s.id))?.enabled).toBe(false);
      await manager.enableSkill(s.id);
      expect((await manager.getSkill(s.id))?.enabled).toBe(true);
    });

    it('should delete skills', async () => {
      const s = await manager.createSkill(TEST_SKILL);
      await manager.deleteSkill(s.id);
      expect((await manager.listSkills()).skills).toHaveLength(0);
    });
  });

  describe('skill approval workflow', () => {
    it('should approve a pending skill', async () => {
      const s = await manager.createSkill({
        ...TEST_SKILL,
        status: 'pending_approval',
        source: 'ai_proposed',
      });
      const approved = await manager.approveSkill(s.id);
      expect(approved.status).toBe('active');
    });

    it('should reject a pending skill (deletes it)', async () => {
      const s = await manager.createSkill({
        ...TEST_SKILL,
        status: 'pending_approval',
        source: 'ai_proposed',
      });
      await manager.rejectSkill(s.id);
      expect(await manager.getSkill(s.id)).toBeNull();
    });

    it('should throw when approving non-pending skill', async () => {
      const s = await manager.createSkill(TEST_SKILL); // status: active
      await expect(manager.approveSkill(s.id)).rejects.toThrow('not pending approval');
    });

    it('should throw when rejecting non-pending skill', async () => {
      const s = await manager.createSkill(TEST_SKILL);
      await expect(manager.rejectSkill(s.id)).rejects.toThrow('not pending approval');
    });

    it('should throw when approving non-existent skill', async () => {
      await expect(manager.approveSkill('nonexistent')).rejects.toThrow('Skill not found');
    });
  });

  describe('learning modes', () => {
    it('should propose a skill when ai_proposed mode is enabled', async () => {
      const mgr = new SoulManager(
        storage,
        defaultConfig({ learningMode: ['user_authored', 'ai_proposed'] }),
        deps
      );
      const s = await mgr.proposeSkill({
        name: 'proposed',
        description: 'test',
        instructions: 'do stuff',
      });
      expect(s.source).toBe('ai_proposed');
      expect(s.status).toBe('pending_approval');
      expect(s.enabled).toBe(false);
    });

    it('should reject proposal when ai_proposed mode is not enabled', async () => {
      await expect(
        manager.proposeSkill({ name: 'proposed', description: 'test', instructions: 'do stuff' })
      ).rejects.toThrow('AI-proposed learning mode is not enabled');
    });

    it('should learn a skill when autonomous mode is enabled', async () => {
      const mgr = new SoulManager(storage, defaultConfig({ learningMode: ['autonomous'] }), deps);
      const s = await mgr.learnSkill({
        name: 'learned',
        description: 'test',
        instructions: 'do stuff',
      });
      expect(s.source).toBe('ai_learned');
      expect(s.status).toBe('active');
      expect(s.enabled).toBe(true);
    });

    it('should reject learning when autonomous mode is not enabled', async () => {
      await expect(
        manager.learnSkill({ name: 'learned', description: 'test', instructions: 'do stuff' })
      ).rejects.toThrow('Autonomous learning mode is not enabled');
    });
  });

  describe('prompt composition', () => {
    it('should return empty string when disabled', async () => {
      const mgr = new SoulManager(storage, defaultConfig({ enabled: false }), deps);
      expect(await mgr.composeSoulPrompt()).toBe('');
    });

    it('should return archetypes preamble with no personality and no skills and no agent name', async () => {
      const prompt = await manager.composeSoulPrompt();
      expect(prompt).toContain('In Our Image');
      expect(prompt).toContain('No-Thing-Ness');
      expect(prompt).not.toContain('Your name is');
    });

    it('should skip preamble when includeArchetypes is false', async () => {
      const p = await manager.createPersonality({ ...TEST_PERSONALITY, includeArchetypes: false });
      await manager.setPersonality(p.id);
      const prompt = await manager.composeSoulPrompt();
      expect(prompt).not.toContain('In Our Image');
      expect(prompt).not.toContain('No-Thing-Ness');
      expect(prompt).toContain('## Soul');
    });

    it('should include preamble when includeArchetypes is true (default)', async () => {
      const p = await manager.createPersonality(TEST_PERSONALITY);
      await manager.setPersonality(p.id);
      const prompt = await manager.composeSoulPrompt();
      expect(prompt).toContain('In Our Image');
      expect(prompt).toContain('No-Thing-Ness');
    });

    it('should not inject agent name separately from personality', async () => {
      await manager.setAgentName('JARVIS');
      const p = await manager.createPersonality({ ...TEST_PERSONALITY, name: 'TestBot' });
      await manager.setPersonality(p.id);

      const prompt = await manager.composeSoulPrompt();
      expect(prompt).not.toContain('Your name is JARVIS.');
      expect(prompt).toContain('You are TestBot');
    });

    it('should not inject agent name when no personality is set', async () => {
      await manager.setAgentName('JARVIS');
      const prompt = await manager.composeSoulPrompt();
      expect(prompt).not.toContain('Your name is JARVIS.');
      expect(prompt).not.toContain('## Soul');
    });

    it('should compose personality into prompt', async () => {
      const p = await manager.createPersonality(TEST_PERSONALITY);
      await manager.setPersonality(p.id);

      const prompt = await manager.composeSoulPrompt();
      expect(prompt).toContain('You are TestBot');
      expect(prompt).toContain('You are a test bot');
      expect(prompt).toContain('humor: dry');
      expect(prompt).toContain('formality: casual');
    });

    it('should include sex when not unspecified', async () => {
      const p = await manager.createPersonality({ ...TEST_PERSONALITY, sex: 'female' });
      await manager.setPersonality(p.id);

      const prompt = await manager.composeSoulPrompt();
      expect(prompt).toContain('Sex: female');
    });

    it('should not include sex when unspecified', async () => {
      const p = await manager.createPersonality(TEST_PERSONALITY);
      await manager.setPersonality(p.id);

      const prompt = await manager.composeSoulPrompt();
      expect(prompt).not.toContain('Sex:');
    });

    it('should include voice when set', async () => {
      const p = await manager.createPersonality({
        ...TEST_PERSONALITY,
        voice: 'warm and authoritative',
      });
      await manager.setPersonality(p.id);

      const prompt = await manager.composeSoulPrompt();
      expect(prompt).toContain('Voice style: warm and authoritative');
    });

    it('should include preferred language when set', async () => {
      const p = await manager.createPersonality({
        ...TEST_PERSONALITY,
        preferredLanguage: 'Japanese',
      });
      await manager.setPersonality(p.id);

      const prompt = await manager.composeSoulPrompt();
      expect(prompt).toContain('Preferred language: Japanese');
    });

    it('should not include preferred language when empty', async () => {
      const p = await manager.createPersonality(TEST_PERSONALITY);
      await manager.setPersonality(p.id);

      const prompt = await manager.composeSoulPrompt();
      expect(prompt).not.toContain('Preferred language');
    });

    it('should compose personality + skills into prompt', async () => {
      const p = await manager.createPersonality(TEST_PERSONALITY);
      await manager.setPersonality(p.id);
      await manager.createSkill(TEST_SKILL);

      const prompt = await manager.composeSoulPrompt();
      expect(prompt).toContain('You are TestBot');
      expect(prompt).toContain('## Skill: code-review');
      expect(prompt).toContain('Review the code');
    });

    it('should exclude disabled skills from prompt', async () => {
      const p = await manager.createPersonality(TEST_PERSONALITY);
      await manager.setPersonality(p.id);
      const s = await manager.createSkill(TEST_SKILL);
      await manager.disableSkill(s.id);

      const prompt = await manager.composeSoulPrompt();
      expect(prompt).not.toContain('code-review');
    });

    it('should exclude pending skills from prompt', async () => {
      const p = await manager.createPersonality(TEST_PERSONALITY);
      await manager.setPersonality(p.id);
      await manager.createSkill({ ...TEST_SKILL, status: 'pending_approval' });

      const prompt = await manager.composeSoulPrompt();
      expect(prompt).not.toContain('code-review');
    });

    it('should compose prompt for a specific personalityId', async () => {
      const p1 = await manager.createPersonality(TEST_PERSONALITY);
      await manager.setPersonality(p1.id);

      const p2 = await manager.createPersonality({
        ...TEST_PERSONALITY,
        name: 'AlternateBot',
        systemPrompt: 'You are an alternate bot.',
      });

      const prompt = await manager.composeSoulPrompt(undefined, p2.id);
      expect(prompt).toContain('You are AlternateBot');
      expect(prompt).not.toContain('You are TestBot');
    });

    it('should fall back to active personality for invalid personalityId', async () => {
      const p = await manager.createPersonality(TEST_PERSONALITY);
      await manager.setPersonality(p.id);

      const prompt = await manager.composeSoulPrompt(undefined, 'nonexistent');
      expect(prompt).toContain('You are TestBot');
    });

    it('should include ## Soul header when personality is set', async () => {
      const p = await manager.createPersonality(TEST_PERSONALITY);
      await manager.setPersonality(p.id);

      const prompt = await manager.composeSoulPrompt();
      expect(prompt).toContain('## Soul');
      expect(prompt).toContain('Your Soul is your unchanging identity');
    });

    it('should include ## Body with capabilities and ### Heart when heartbeat has fired', async () => {
      const mockHeartbeat = {
        getStatus: () => ({
          running: true,
          enabled: true,
          intervalMs: 30000,
          beatCount: 1,
          lastBeat: {
            timestamp: 1700000000000,
            durationMs: 15,
            checks: [
              {
                name: 'system_health',
                type: 'system_health',
                status: 'ok' as const,
                message: 'All good',
              },
            ],
          },
          tasks: [
            {
              name: 'system_health',
              type: 'system_health',
              enabled: true,
              intervalMs: 300000,
              lastRunAt: 1700000000000,
              config: {},
            },
            {
              name: 'self_reflection',
              type: 'reflective_task',
              enabled: true,
              intervalMs: 1800000,
              lastRunAt: null,
              config: { prompt: 'reflect' },
            },
          ],
        }),
        getLastBeat: () => null,
        start: () => {},
        stop: () => {},
        beat: async () => ({ timestamp: 0, durationMs: 0, checks: [] }),
      };
      manager.setHeartbeat(mockHeartbeat as never);

      const prompt = await manager.composeSoulPrompt();
      expect(prompt).toContain('## Body');
      expect(prompt).toContain('Your Body is your form');
      expect(prompt).toContain('### Capabilities');
      expect(prompt).toContain('### Heart');
      expect(prompt).toContain('Your Heart is your pulse');
      expect(prompt).toContain('system_health: [ok] All good');
      expect(prompt).toContain('Task schedule:');
      expect(prompt).toContain('system_health: every 5m');
      expect(prompt).toContain('self_reflection: every 30m');
    });

    it('should omit ## Body when no heartbeat is set', async () => {
      const prompt = await manager.composeSoulPrompt();
      expect(prompt).not.toContain('## Body');
    });

    it('should truncate when exceeding max prompt tokens', async () => {
      const mgr = new SoulManager(storage, defaultConfig({ maxPromptTokens: 200 }), deps); // 800 chars max
      const p = await mgr.createPersonality({
        ...TEST_PERSONALITY,
        systemPrompt: 'A'.repeat(2000),
      });
      await mgr.setPersonality(p.id);

      const prompt = await mgr.composeSoulPrompt();
      expect(prompt.length).toBeLessThanOrEqual(800);
    });
  });

  describe('tool collection', () => {
    it('should return empty array when disabled', async () => {
      const mgr = new SoulManager(storage, defaultConfig({ enabled: false }), deps);
      expect(await mgr.getActiveTools()).toEqual([]);
    });

    it('should collect tools from enabled skills', async () => {
      const tool = {
        name: 'search',
        description: 'Search tool',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      };
      await manager.createSkill({ ...TEST_SKILL, tools: [tool] });

      const tools = await manager.getActiveTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('search');
    });

    it('should not collect tools from disabled skills', async () => {
      const tool = {
        name: 'search',
        description: 'Search tool',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      };
      const s = await manager.createSkill({ ...TEST_SKILL, tools: [tool] });
      await manager.disableSkill(s.id);

      expect(await manager.getActiveTools()).toEqual([]);
    });
  });

  describe('usage tracking', () => {
    it('should increment skill usage', async () => {
      const s = await manager.createSkill(TEST_SKILL);
      await manager.incrementSkillUsage(s.id);
      await manager.incrementSkillUsage(s.id);

      const updated = await manager.getSkill(s.id);
      expect(updated?.usageCount).toBe(2);
    });
  });
});

// ── SoulManager + MarketplaceManager integration ─────────────────

describe('SoulManager skill deletion with marketplace sync', () => {
  let soulStorage: SoulStorage;
  let brainStorage: BrainStorage;
  let brainManager: BrainManager;
  let marketplaceStorage: MarketplaceStorage;
  let marketplaceManager: MarketplaceManager;
  let soulManager: SoulManager;

  function deps(): SoulManagerDeps {
    const auditStorage = new InMemoryAuditStorage();
    const auditChain = new AuditChain({
      storage: auditStorage,
      signingKey: 'test-signing-key-must-be-at-least-32-chars!!',
    });
    return { auditChain, logger: noopLogger() };
  }

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    soulStorage = new SoulStorage();
    brainStorage = new BrainStorage();
    const auditStorage = new InMemoryAuditStorage();
    const auditChain = new AuditChain({
      storage: auditStorage,
      signingKey: 'test-signing-key-must-be-at-least-32-chars!!',
    });
    brainManager = new BrainManager(
      brainStorage,
      {
        enabled: true,
        maxMemories: 10000,
        maxKnowledge: 5000,
        memoryRetentionDays: 90,
        importanceDecayRate: 0.01,
        contextWindowMemories: 10,
      },
      { auditChain, logger: noopLogger() }
    );
    marketplaceStorage = new MarketplaceStorage();
    marketplaceManager = new MarketplaceManager(marketplaceStorage, {
      logger: noopLogger(),
      brainManager,
    });
    soulManager = new SoulManager(soulStorage, defaultConfig(), deps(), brainManager);
    soulManager.setMarketplaceManager(marketplaceManager);
  });

  it('should reset marketplace.installed when the last brain skill is deleted via deleteSkill', async () => {
    const mpSkill = await marketplaceManager.publish({
      name: 'Marketplace Test Skill',
      instructions: 'Do things',
    });
    await marketplaceManager.install(mpSkill.id, 'personality-123');
    expect((await marketplaceManager.getSkill(mpSkill.id))!.installed).toBe(true);

    // Get the brain skill ID that was created on install
    const brainSkills = await brainManager.listSkills({ source: 'marketplace' });
    expect(brainSkills).toHaveLength(1);

    // Delete via soulManager (simulates personality editor remove)
    await soulManager.deleteSkill(brainSkills[0].id);

    // Brain skill gone
    expect(await brainManager.listSkills({ source: 'marketplace' })).toHaveLength(0);
    // Marketplace installed flag reset
    expect((await marketplaceManager.getSkill(mpSkill.id))!.installed).toBe(false);
  });

  it('should NOT reset marketplace.installed when other brain skill copies remain', async () => {
    const mpSkill = await marketplaceManager.publish({
      name: 'Shared Skill',
      instructions: 'Shared across personalities',
    });
    await marketplaceManager.install(mpSkill.id, 'personality-a');
    // Manually add a second brain record for a different personality
    await brainManager.createSkill({
      name: 'Shared Skill',
      instructions: 'Shared across personalities',
      source: 'marketplace',
      personalityId: 'personality-b',
      enabled: true,
      status: 'active',
      tools: [],
      triggerPatterns: [],
    });

    const allBrainSkills = await brainManager.listSkills({ source: 'marketplace' });
    expect(allBrainSkills).toHaveLength(2);

    // Delete only the personality-a copy
    await soulManager.deleteSkill(allBrainSkills[0].id);

    // personality-b copy still exists — marketplace.installed should remain true
    expect((await marketplaceManager.getSkill(mpSkill.id))!.installed).toBe(true);
  });
});
