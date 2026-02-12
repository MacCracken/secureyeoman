import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MarketplaceStorage } from './storage.js';
import { MarketplaceManager } from './manager.js';
import { createNoopLogger } from '../logging/logger.js';
import { existsSync, unlinkSync } from 'node:fs';

const TEST_DB = '/tmp/marketplace-test.db';

describe('MarketplaceStorage', () => {
  let storage: MarketplaceStorage;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); storage = new MarketplaceStorage({ dbPath: TEST_DB }); });
  afterEach(() => { storage.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it('should add and retrieve a skill', () => {
    const skill = storage.addSkill({ name: 'Test Skill', category: 'ai' });
    expect(skill.id).toBeTruthy();
    expect(storage.getSkill(skill.id)!.name).toBe('Test Skill');
  });

  it('should search skills', () => {
    storage.addSkill({ name: 'AI Helper', category: 'ai' });
    storage.addSkill({ name: 'Code Formatter', category: 'dev' });
    const { skills, total } = storage.search('AI');
    expect(total).toBe(1);
    expect(skills[0].name).toBe('AI Helper');
  });

  it('should install/uninstall', () => {
    const skill = storage.addSkill({ name: 'Installable' });
    expect(storage.setInstalled(skill.id, true)).toBe(true);
    expect(storage.getSkill(skill.id)!.installed).toBe(true);
    expect(storage.setInstalled(skill.id, false)).toBe(true);
    expect(storage.getSkill(skill.id)!.installed).toBe(false);
  });

  it('should delete skills', () => {
    const skill = storage.addSkill({ name: 'Deletable' });
    expect(storage.delete(skill.id)).toBe(true);
    expect(storage.getSkill(skill.id)).toBeNull();
  });
});

describe('MarketplaceManager', () => {
  let storage: MarketplaceStorage;
  let manager: MarketplaceManager;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); storage = new MarketplaceStorage({ dbPath: TEST_DB }); manager = new MarketplaceManager(storage, { logger: createNoopLogger() }); });
  afterEach(() => { storage.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it('should publish and search', () => {
    manager.publish({ name: 'Published Skill', category: 'test' });
    const { skills } = manager.search();
    expect(skills).toHaveLength(1);
  });

  it('should install and uninstall', () => {
    const skill = manager.publish({ name: 'My Skill' });
    expect(manager.install(skill.id)).toBe(true);
    expect(manager.getSkill(skill.id)!.installed).toBe(true);
    expect(manager.uninstall(skill.id)).toBe(true);
  });
});
