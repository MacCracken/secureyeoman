import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MarketplaceStorage } from './storage.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('MarketplaceStorage', () => {
  let storage: MarketplaceStorage;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new MarketplaceStorage();
  });

  it('should add and retrieve a skill', async () => {
    const skill = await storage.addSkill({ name: 'Test Skill', category: 'ai' });
    expect(skill.id).toBeTruthy();
    expect((await storage.getSkill(skill.id))!.name).toBe('Test Skill');
  });

  it('should search skills', async () => {
    await storage.addSkill({ name: 'AI Helper', category: 'ai' });
    await storage.addSkill({ name: 'Code Formatter', category: 'dev' });
    const { skills, total } = await storage.search('AI');
    expect(total).toBe(1);
    expect(skills[0].name).toBe('AI Helper');
  });

  it('should install/uninstall', async () => {
    const skill = await storage.addSkill({ name: 'Installable' });
    expect(await storage.setInstalled(skill.id, true)).toBe(true);
    expect((await storage.getSkill(skill.id))!.installed).toBe(true);
    expect(await storage.setInstalled(skill.id, false)).toBe(true);
    expect((await storage.getSkill(skill.id))!.installed).toBe(false);
  });

  it('should delete skills', async () => {
    const skill = await storage.addSkill({ name: 'Deletable' });
    expect(await storage.delete(skill.id)).toBe(true);
    expect(await storage.getSkill(skill.id)).toBeNull();
  });

  it('should seed builtin skills', async () => {
    await storage.seedBuiltinSkills();
    const { skills, total } = await storage.search();
    expect(total).toBe(45);
    const summarizeSkill = skills.find((s) => s.name === 'Summarize Text');
    expect(summarizeSkill).toBeDefined();
    expect(summarizeSkill!.author).toBe('YEOMAN');
    expect(summarizeSkill!.category).toBe('utilities');
    const designerSkill = skills.find((s) => s.name === 'Senior Web Designer');
    expect(designerSkill).toBeDefined();
    expect(designerSkill!.category).toBe('design');
  });

  it('should seed Prompt Craft with correct metadata', async () => {
    await storage.seedBuiltinSkills();
    const { skills } = await storage.search();
    const skill = skills.find((s) => s.name === 'Prompt Craft');
    expect(skill).toBeDefined();
    expect(skill!.category).toBe('productivity');
    expect(skill!.author).toBe('YEOMAN');
    expect(skill!.authorInfo?.github).toBe('MacCracken');
    expect(skill!.source).toBe('builtin');
    expect(skill!.triggerPatterns.length).toBeGreaterThan(0);
    expect(skill!.useWhen).toBeTruthy();
    expect(skill!.doNotUseWhen).toBeTruthy();
    expect(skill!.successCriteria).toBeTruthy();
  });

  it('should seed Context Engineering with correct metadata', async () => {
    await storage.seedBuiltinSkills();
    const { skills } = await storage.search();
    const skill = skills.find((s) => s.name === 'Context Engineering');
    expect(skill).toBeDefined();
    expect(skill!.category).toBe('productivity');
    expect(skill!.author).toBe('YEOMAN');
    expect(skill!.source).toBe('builtin');
    expect(skill!.tags).toContain('rag');
    expect(skill!.tags).toContain('token-budget');
  });

  it('should seed Intent Engineering with correct metadata', async () => {
    await storage.seedBuiltinSkills();
    const { skills } = await storage.search();
    const skill = skills.find((s) => s.name === 'Intent Engineering');
    expect(skill).toBeDefined();
    expect(skill!.category).toBe('productivity');
    expect(skill!.author).toBe('YEOMAN');
    expect(skill!.source).toBe('builtin');
    expect(skill!.tags).toContain('disambiguation');
  });

  it('should seed Specification Engineering with correct metadata', async () => {
    await storage.seedBuiltinSkills();
    const { skills } = await storage.search();
    const skill = skills.find((s) => s.name === 'Specification Engineering');
    expect(skill).toBeDefined();
    expect(skill!.category).toBe('productivity');
    expect(skill!.author).toBe('YEOMAN');
    expect(skill!.source).toBe('builtin');
    expect(skill!.tags).toContain('acceptance-criteria');
    expect(skill!.tags).toContain('decomposition');
  });

  it('should seed builtin skills with routing quality fields', async () => {
    await storage.seedBuiltinSkills();
    const { skills } = await storage.search();
    // Themes and personality skills may not have routing fields — only check core skills
    const coreSkills = skills.filter((s) => s.category !== 'theme' && s.category !== 'personality');
    expect(coreSkills.length).toBeGreaterThan(0);
    for (const skill of coreSkills) {
      expect(typeof skill.useWhen).toBe('string');
      expect(skill.useWhen.length).toBeGreaterThan(0);
      expect(typeof skill.doNotUseWhen).toBe('string');
      expect(skill.doNotUseWhen.length).toBeGreaterThan(0);
      expect(typeof skill.successCriteria).toBe('string');
      expect(skill.successCriteria.length).toBeGreaterThan(0);
      expect(['fuzzy', 'explicit']).toContain(skill.routing);
      expect(['L1', 'L2', 'L3', 'L4', 'L5']).toContain(skill.autonomyLevel);
    }
  });

  it('should be idempotent when seeding builtin skills', async () => {
    await storage.seedBuiltinSkills();
    await storage.seedBuiltinSkills();
    const { skills } = await storage.search('Summarize Text');
    const exact = skills.filter((s) => s.name === 'Summarize Text');
    expect(exact).toHaveLength(1);
  });

  it('should update routing quality fields on re-seed of existing skills', async () => {
    // First seed
    await storage.seedBuiltinSkills();
    const { skills: first } = await storage.search('Summarize');
    expect(first[0].useWhen).toBeTruthy();

    // Manually blank out useWhen to simulate a stale row
    await storage.updateSkill(first[0].id, { useWhen: '' });
    expect((await storage.getSkill(first[0].id))!.useWhen).toBe('');

    // Re-seed should restore the value
    await storage.seedBuiltinSkills();
    expect((await storage.getSkill(first[0].id))!.useWhen).toBeTruthy();
  });
});
