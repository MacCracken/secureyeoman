import { describe, it, expect, vi } from 'vitest';
import { SoulManager } from './manager.js';

const makeLogger = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info',
});

const PERSONALITY = {
  id: 'p-1',
  name: 'FRIDAY',
  description: 'Test personality',
  systemPrompt: 'You are FRIDAY.',
  traits: { formality: 'balanced' },
  sex: 'unspecified',
  voice: '',
  preferredLanguage: '',
  isActive: false,
  includeArchetypes: true,
  defaultModel: null,
  modelFallbacks: [],
  body: {
    enabled: false,
    capabilities: [],
    heartEnabled: true,
    creationConfig: {},
    selectedServers: [],
    selectedIntegrations: [],
    mcpFeatures: {
      exposeGit: false,
      exposeFilesystem: false,
      exposeWeb: false,
      exposeWebScraping: false,
      exposeWebSearch: false,
      exposeBrowser: false,
    },
    proactiveConfig: {
      enabled: false,
      approvalMode: 'suggest',
      builtins: {},
      learning: { enabled: true, minConfidence: 0.7 },
    },
  },
  createdAt: 1000,
  updatedAt: 1000,
};

const SKILL = {
  id: 'skill-1',
  name: 'Test Skill',
  description: 'A test',
  status: 'active',
  enabled: true,
  source: 'user',
  triggerPatterns: [],
  tools: [],
  personalityId: null,
  createdAt: 1000,
  updatedAt: 1000,
};
const USER = {
  id: 'user-1',
  name: 'Alice',
  isOwner: false,
  preferences: {},
  createdAt: 1000,
  updatedAt: 1000,
};

function makeStorage(overrides: any = {}) {
  return {
    getAgentName: vi.fn().mockResolvedValue('FRIDAY'),
    setAgentName: vi.fn().mockResolvedValue(undefined),
    getPersonalityCount: vi.fn().mockResolvedValue(1),
    getPersonality: vi.fn().mockResolvedValue(PERSONALITY),
    getActivePersonality: vi.fn().mockResolvedValue(PERSONALITY),
    setActivePersonality: vi.fn().mockResolvedValue(undefined),
    createPersonality: vi.fn().mockResolvedValue(PERSONALITY),
    updatePersonality: vi.fn().mockResolvedValue(PERSONALITY),
    deletePersonality: vi.fn().mockResolvedValue(undefined),
    listPersonalities: vi.fn().mockResolvedValue({ personalities: [PERSONALITY], total: 1 }),
    getSkillCount: vi.fn().mockResolvedValue(0),
    createSkill: vi.fn().mockResolvedValue(SKILL),
    getSkill: vi.fn().mockResolvedValue(SKILL),
    updateSkill: vi.fn().mockResolvedValue({ ...SKILL, enabled: false }),
    deleteSkill: vi.fn().mockResolvedValue(undefined),
    listSkills: vi.fn().mockResolvedValue({ skills: [SKILL], total: 1 }),
    getEnabledSkills: vi.fn().mockResolvedValue([SKILL]),
    approveSkill: vi.fn().mockResolvedValue({ ...SKILL, status: 'active' }),
    incrementUsage: vi.fn().mockResolvedValue(undefined),
    getUser: vi.fn().mockResolvedValue(USER),
    getUserByName: vi.fn().mockResolvedValue(USER),
    getOwner: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue(USER),
    updateUser: vi.fn().mockResolvedValue(USER),
    deleteUser: vi.fn().mockResolvedValue(true),
    listUsers: vi.fn().mockResolvedValue({ users: [USER], total: 1 }),
    close: vi.fn(),
    ...overrides,
  };
}

function makeConfig(overrides: any = {}) {
  return {
    enabled: true,
    maxSkills: 100,
    maxPromptTokens: 2000,
    learningMode: ['ai_proposed', 'autonomous'],
    ...overrides,
  };
}

function makeManager(
  storageOverrides: any = {},
  configOverrides: any = {},
  brain?: any,
  spirit?: any
) {
  const storage = makeStorage(storageOverrides);
  const logger = makeLogger();
  const config = makeConfig(configOverrides);
  const deps = { logger: logger as any };
  const manager = new SoulManager(storage as any, config as any, deps, brain, spirit);
  return { manager, storage, logger, config };
}

describe('SoulManager', () => {
  describe('getAgentName / setAgentName', () => {
    it('returns agent name from storage', async () => {
      const { manager } = makeManager();
      expect(await manager.getAgentName()).toBe('FRIDAY');
    });

    it('sets agent name in storage', async () => {
      const { manager, storage } = makeManager();
      await manager.setAgentName('Jarvis');
      expect(storage.setAgentName).toHaveBeenCalledWith('Jarvis');
    });

    it('throws when name is empty', async () => {
      const { manager } = makeManager();
      await expect(manager.setAgentName('')).rejects.toThrow('Agent name cannot be empty');
    });

    it('trims whitespace from name', async () => {
      const { manager, storage } = makeManager();
      await manager.setAgentName('  Jarvis  ');
      expect(storage.setAgentName).toHaveBeenCalledWith('Jarvis');
    });
  });

  describe('needsOnboarding', () => {
    it('returns false when agent name set and personalities exist', async () => {
      const { manager } = makeManager();
      expect(await manager.needsOnboarding()).toBe(false);
    });

    it('returns true when agent name is null', async () => {
      const { manager } = makeManager({ getAgentName: vi.fn().mockResolvedValue(null) });
      expect(await manager.needsOnboarding()).toBe(true);
    });

    it('returns true when no personalities', async () => {
      const { manager } = makeManager({ getPersonalityCount: vi.fn().mockResolvedValue(0) });
      expect(await manager.needsOnboarding()).toBe(true);
    });
  });

  describe('createDefaultPersonality', () => {
    it('creates a personality and sets it active', async () => {
      const { manager, storage } = makeManager();
      await manager.createDefaultPersonality();
      expect(storage.createPersonality).toHaveBeenCalled();
      expect(storage.setActivePersonality).toHaveBeenCalledWith('p-1');
    });

    it('uses FRIDAY as default name when agent name is null', async () => {
      const { manager, storage } = makeManager({ getAgentName: vi.fn().mockResolvedValue(null) });
      await manager.createDefaultPersonality();
      const call = storage.createPersonality.mock.calls[0][0];
      expect(call.name).toBe('FRIDAY');
    });
  });

  describe('personality CRUD', () => {
    it('getPersonality delegates to storage', async () => {
      const { manager } = makeManager();
      const p = await manager.getPersonality('p-1');
      expect(p?.id).toBe('p-1');
    });

    it('getActivePersonality delegates to storage', async () => {
      const { manager } = makeManager();
      const p = await manager.getActivePersonality();
      expect(p?.id).toBe('p-1');
    });

    it('setPersonality calls setActivePersonality', async () => {
      const { manager, storage } = makeManager();
      await manager.setPersonality('p-1');
      expect(storage.setActivePersonality).toHaveBeenCalledWith('p-1');
    });

    it('createPersonality delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.createPersonality({ name: 'New' } as any);
      expect(storage.createPersonality).toHaveBeenCalled();
    });

    it('updatePersonality delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.updatePersonality('p-1', { name: 'Updated' });
      expect(storage.updatePersonality).toHaveBeenCalledWith('p-1', { name: 'Updated' });
    });

    it('deletePersonality deletes non-active personality', async () => {
      const { manager, storage } = makeManager({
        getPersonality: vi.fn().mockResolvedValue({ ...PERSONALITY, isActive: false }),
      });
      await manager.deletePersonality('p-1');
      expect(storage.deletePersonality).toHaveBeenCalledWith('p-1');
    });

    it('deletePersonality throws when personality is active', async () => {
      const { manager } = makeManager({
        getPersonality: vi.fn().mockResolvedValue({ ...PERSONALITY, isActive: true }),
      });
      await expect(manager.deletePersonality('p-1')).rejects.toThrow(
        'Cannot delete the active personality'
      );
    });

    it('listPersonalities delegates to storage', async () => {
      const { manager } = makeManager();
      const result = await manager.listPersonalities();
      expect(result.personalities).toHaveLength(1);
    });
  });

  describe('skill operations (without brain)', () => {
    it('createSkill throws when max limit reached', async () => {
      const { manager } = makeManager(
        { getSkillCount: vi.fn().mockResolvedValue(100) },
        { maxSkills: 100 }
      );
      await expect(manager.createSkill({ name: 'New' } as any)).rejects.toThrow(
        'Maximum skill limit reached'
      );
    });

    it('createSkill creates skill when under limit', async () => {
      const { manager, storage } = makeManager();
      await manager.createSkill({ name: 'New' } as any);
      expect(storage.createSkill).toHaveBeenCalled();
    });

    it('updateSkill delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.updateSkill('skill-1', { enabled: false });
      expect(storage.updateSkill).toHaveBeenCalledWith('skill-1', { enabled: false });
    });

    it('deleteSkill delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.deleteSkill('skill-1');
      expect(storage.deleteSkill).toHaveBeenCalledWith('skill-1');
    });

    it('enableSkill updates enabled=true', async () => {
      const { manager, storage } = makeManager();
      await manager.enableSkill('skill-1');
      expect(storage.updateSkill).toHaveBeenCalledWith('skill-1', { enabled: true });
    });

    it('disableSkill updates enabled=false', async () => {
      const { manager, storage } = makeManager();
      await manager.disableSkill('skill-1');
      expect(storage.updateSkill).toHaveBeenCalledWith('skill-1', { enabled: false });
    });

    it('getSkill delegates to storage', async () => {
      const { manager } = makeManager();
      const skill = await manager.getSkill('skill-1');
      expect(skill?.id).toBe('skill-1');
    });

    it('approveSkill throws when skill not found', async () => {
      const { manager } = makeManager({ getSkill: vi.fn().mockResolvedValue(null) });
      await expect(manager.approveSkill('missing')).rejects.toThrow('Skill not found');
    });

    it('approveSkill throws when not pending', async () => {
      const { manager } = makeManager({
        getSkill: vi.fn().mockResolvedValue({ ...SKILL, status: 'active' }),
      });
      await expect(manager.approveSkill('skill-1')).rejects.toThrow('not pending approval');
    });

    it('approveSkill sets status to active', async () => {
      const { manager, storage } = makeManager({
        getSkill: vi.fn().mockResolvedValue({ ...SKILL, status: 'pending_approval' }),
      });
      await manager.approveSkill('skill-1');
      expect(storage.updateSkill).toHaveBeenCalledWith('skill-1', { status: 'active' });
    });

    it('rejectSkill throws when skill not found', async () => {
      const { manager } = makeManager({ getSkill: vi.fn().mockResolvedValue(null) });
      await expect(manager.rejectSkill('missing')).rejects.toThrow('Skill not found');
    });

    it('rejectSkill deletes pending skill', async () => {
      const { manager, storage } = makeManager({
        getSkill: vi.fn().mockResolvedValue({ ...SKILL, status: 'pending_approval' }),
      });
      await manager.rejectSkill('skill-1');
      expect(storage.deleteSkill).toHaveBeenCalledWith('skill-1');
    });

    it('listSkills includes personality name when personalityId set', async () => {
      const skillWithPersonality = { ...SKILL, personalityId: 'p-1' };
      const { manager } = makeManager({
        listSkills: vi.fn().mockResolvedValue({ skills: [skillWithPersonality], total: 1 }),
      });
      const result = await manager.listSkills();
      expect(result.skills[0].personalityName).toBe('FRIDAY');
    });

    it('listSkills returns skills without personality enrichment when none have personalityId', async () => {
      const { manager } = makeManager();
      const result = await manager.listSkills();
      expect(result.skills).toHaveLength(1);
    });
  });

  describe('skill operations (with brain)', () => {
    const makeBrain = (overrides: any = {}) => ({
      createSkill: vi.fn().mockResolvedValue(SKILL),
      updateSkill: vi.fn().mockResolvedValue(SKILL),
      deleteSkill: vi.fn().mockResolvedValue(undefined),
      enableSkill: vi.fn().mockResolvedValue(undefined),
      disableSkill: vi.fn().mockResolvedValue(undefined),
      getSkill: vi.fn().mockResolvedValue(SKILL),
      listSkills: vi.fn().mockResolvedValue([SKILL]),
      approveSkill: vi.fn().mockResolvedValue(SKILL),
      rejectSkill: vi.fn().mockResolvedValue(undefined),
      incrementSkillUsage: vi.fn().mockResolvedValue(undefined),
      getActiveSkills: vi.fn().mockResolvedValue([SKILL]),
      getActiveTools: vi.fn().mockResolvedValue([]),
      ...overrides,
    });

    it('createSkill delegates to brain', async () => {
      const brain = makeBrain();
      const { manager } = makeManager({}, {}, brain);
      await manager.createSkill({ name: 'New' } as any);
      expect(brain.createSkill).toHaveBeenCalled();
    });

    it('deleteSkill calls brain.deleteSkill and marketplace.onBrainSkillDeleted when both present', async () => {
      const brain = makeBrain();
      const marketplace = { onBrainSkillDeleted: vi.fn().mockResolvedValue(undefined) };
      const { manager } = makeManager({}, {}, brain);
      manager.setMarketplaceManager(marketplace as any);
      await manager.deleteSkill('skill-1');
      expect(brain.deleteSkill).toHaveBeenCalled();
      expect(marketplace.onBrainSkillDeleted).toHaveBeenCalledWith(SKILL.name, SKILL.source);
    });

    it('enableSkill delegates to brain', async () => {
      const brain = makeBrain();
      const { manager } = makeManager({}, {}, brain);
      await manager.enableSkill('skill-1');
      expect(brain.enableSkill).toHaveBeenCalledWith('skill-1');
    });

    it('listSkills uses brain results', async () => {
      const brain = makeBrain();
      const { manager } = makeManager({}, {}, brain);
      const result = await manager.listSkills();
      expect(brain.listSkills).toHaveBeenCalled();
      expect(result.skills).toHaveLength(1);
    });
  });

  describe('user operations', () => {
    it('getUser delegates to storage', async () => {
      const { manager } = makeManager();
      const user = await manager.getUser('user-1');
      expect(user?.id).toBe('user-1');
    });

    it('getUserByName delegates to storage', async () => {
      const { manager } = makeManager();
      const user = await manager.getUserByName('Alice');
      expect(user?.name).toBe('Alice');
    });

    it('getOwner returns null when no owner', async () => {
      const { manager } = makeManager();
      expect(await manager.getOwner()).toBeNull();
    });

    it('createUser delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.createUser({ name: 'Bob', isOwner: false } as any);
      expect(storage.createUser).toHaveBeenCalled();
    });

    it('updateUser delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.updateUser('user-1', { name: 'Updated' });
      expect(storage.updateUser).toHaveBeenCalledWith('user-1', { name: 'Updated' });
    });

    it('deleteUser returns boolean', async () => {
      const { manager } = makeManager();
      expect(await manager.deleteUser('user-1')).toBe(true);
    });

    it('listUsers delegates to storage', async () => {
      const { manager } = makeManager();
      const result = await manager.listUsers();
      expect(result.users).toHaveLength(1);
    });
  });

  describe('learning', () => {
    it('proposeSkill throws when ai_proposed not in learningMode', async () => {
      const { manager } = makeManager({}, { learningMode: [] });
      await expect(manager.proposeSkill({ name: 'New' } as any)).rejects.toThrow(
        'AI-proposed learning mode is not enabled'
      );
    });

    it('proposeSkill creates skill with pending_approval', async () => {
      const { manager, storage } = makeManager();
      await manager.proposeSkill({ name: 'New', triggerPatterns: [] } as any);
      const call = storage.createSkill.mock.calls[0][0];
      expect(call.source).toBe('ai_proposed');
      expect(call.status).toBe('pending_approval');
    });

    it('learnSkill throws when autonomous not in learningMode', async () => {
      const { manager } = makeManager({}, { learningMode: [] });
      await expect(manager.learnSkill({ name: 'New' } as any)).rejects.toThrow(
        'Autonomous learning mode is not enabled'
      );
    });

    it('learnSkill creates active skill', async () => {
      const { manager, storage } = makeManager();
      await manager.learnSkill({ name: 'New', triggerPatterns: [] } as any);
      const call = storage.createSkill.mock.calls[0][0];
      expect(call.source).toBe('ai_learned');
      expect(call.status).toBe('active');
      expect(call.enabled).toBe(true);
    });

    it('incrementSkillUsage delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.incrementSkillUsage('skill-1');
      expect(storage.incrementUsage).toHaveBeenCalledWith('skill-1');
    });
  });

  describe('composeSoulPrompt', () => {
    it('returns empty string when disabled', async () => {
      const { manager } = makeManager({}, { enabled: false });
      expect(await manager.composeSoulPrompt()).toBe('');
    });

    it('includes personality name in prompt', async () => {
      const { manager } = makeManager();
      const prompt = await manager.composeSoulPrompt();
      expect(prompt).toContain('FRIDAY');
    });

    it('includes archetypes when includeArchetypes=true', async () => {
      const { manager } = makeManager();
      const prompt = await manager.composeSoulPrompt();
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('excludes archetypes when includeArchetypes=false', async () => {
      const noArchetypePersonality = { ...PERSONALITY, includeArchetypes: false };
      const { manager } = makeManager({
        getActivePersonality: vi.fn().mockResolvedValue(noArchetypePersonality),
      });
      const prompt = await manager.composeSoulPrompt();
      // Should still contain soul section but not archetypes
      expect(prompt).toContain('FRIDAY');
    });

    it('includes user context when owner exists', async () => {
      const owner = {
        ...USER,
        isOwner: true,
        name: 'Alice',
        nickname: 'Ali',
        notes: 'VIP',
        preferences: { theme: 'dark' },
      };
      const { manager } = makeManager({ getOwner: vi.fn().mockResolvedValue(owner) });
      const prompt = await manager.composeSoulPrompt();
      expect(prompt).toContain('Alice');
      expect(prompt).toContain('Ali');
      expect(prompt).toContain('VIP');
    });

    it('injects brain context when brain available and input provided', async () => {
      const brain = {
        getRelevantContext: vi.fn().mockResolvedValue('## Brain\nsome memory'),
        getActiveSkills: vi.fn().mockResolvedValue([]),
      };
      const { manager } = makeManager({}, {}, brain);
      const prompt = await manager.composeSoulPrompt('hello world');
      expect(prompt).toContain('some memory');
    });

    it('expands skills that match trigger patterns', async () => {
      const triggerSkill = {
        ...SKILL,
        name: 'Code Review',
        triggerPatterns: ['code'],
        instructions: 'Review the code carefully.',
      };
      const { manager } = makeManager({
        getEnabledSkills: vi.fn().mockResolvedValue([triggerSkill]),
      });
      const prompt = await manager.composeSoulPrompt('please code review this');
      expect(prompt).toContain('Review the code carefully');
    });

    it('does not expand skills that do not match trigger patterns', async () => {
      const triggerSkill = {
        ...SKILL,
        name: 'Code Review',
        triggerPatterns: ['code'],
        instructions: 'Review the code carefully.',
      };
      const { manager } = makeManager({
        getEnabledSkills: vi.fn().mockResolvedValue([triggerSkill]),
      });
      const prompt = await manager.composeSoulPrompt('tell me a joke');
      expect(prompt).not.toContain('Review the code carefully');
    });

    it('includes spirit prompt when spirit available', async () => {
      const spirit = {
        composeSpiritPrompt: vi.fn().mockResolvedValue('## Spirit\nPassion: music'),
      };
      const { manager } = makeManager({}, {}, undefined, spirit);
      const prompt = await manager.composeSoulPrompt();
      expect(prompt).toContain('music');
    });
  });

  describe('getActiveTools', () => {
    it('returns empty when disabled', async () => {
      const { manager } = makeManager({}, { enabled: false });
      expect(await manager.getActiveTools()).toEqual([]);
    });

    it('extracts tools from enabled skills', async () => {
      const toolSkill = {
        ...SKILL,
        tools: [{ name: 'search', description: 'search', parameters: {} }],
      };
      const { manager } = makeManager({ getEnabledSkills: vi.fn().mockResolvedValue([toolSkill]) });
      const tools = await manager.getActiveTools();
      expect(tools).toHaveLength(1);
    });

    it('delegates to brain when brain available', async () => {
      const brain = { getActiveTools: vi.fn().mockResolvedValue([{ name: 'search' }]) };
      const { manager } = makeManager({}, {}, brain);
      const tools = await manager.getActiveTools();
      expect(brain.getActiveTools).toHaveBeenCalled();
      expect(tools).toHaveLength(1);
    });
  });

  describe('getConfig / getBrain / getSpirit / close', () => {
    it('getConfig returns config', () => {
      const { manager, config } = makeManager();
      expect(manager.getConfig()).toEqual(config);
    });

    it('getBrain returns null when no brain', () => {
      const { manager } = makeManager();
      expect(manager.getBrain()).toBeNull();
    });

    it('getBrain returns brain when provided', () => {
      const brain = { getActiveTools: vi.fn() };
      const { manager } = makeManager({}, {}, brain);
      expect(manager.getBrain()).toBe(brain);
    });

    it('getSpirit returns null when no spirit', () => {
      const { manager } = makeManager();
      expect(manager.getSpirit()).toBeNull();
    });

    it('close calls storage.close', () => {
      const { manager, storage } = makeManager();
      manager.close();
      expect(storage.close).toHaveBeenCalled();
    });
  });

  describe('personality presets', () => {
    it('listPersonalityPresets returns all built-in presets', () => {
      const { manager } = makeManager();
      const presets = manager.listPersonalityPresets();
      expect(presets.length).toBeGreaterThanOrEqual(2);
      expect(presets.map((p) => p.id)).toContain('friday');
      expect(presets.map((p) => p.id)).toContain('t-ron');
    });

    it('createPersonalityFromPreset creates personality from friday preset', async () => {
      const { manager, storage } = makeManager();
      await manager.createPersonalityFromPreset('friday');
      expect(storage.createPersonality).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'FRIDAY' })
      );
    });

    it('createPersonalityFromPreset creates personality from t-ron preset', async () => {
      const { manager, storage } = makeManager();
      await manager.createPersonalityFromPreset('t-ron');
      expect(storage.createPersonality).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'T.Ron' })
      );
    });

    it('createPersonalityFromPreset applies overrides over preset data', async () => {
      const { manager, storage } = makeManager();
      await manager.createPersonalityFromPreset('t-ron', { name: 'My Guard' });
      expect(storage.createPersonality).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Guard' })
      );
    });

    it('createPersonalityFromPreset throws for unknown preset id', async () => {
      const { manager } = makeManager();
      await expect(manager.createPersonalityFromPreset('nope')).rejects.toThrow(
        'Unknown personality preset: nope'
      );
    });
  });
});
