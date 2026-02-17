import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubAgentStorage } from './storage.js';

// Mock pg-pool
vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({
    query: vi.fn(),
  }),
}));

describe('SubAgentStorage', () => {
  let storage: SubAgentStorage;

  beforeEach(() => {
    storage = new SubAgentStorage();
  });

  it('can be instantiated', () => {
    expect(storage).toBeInstanceOf(SubAgentStorage);
  });

  it('has profile CRUD methods', () => {
    expect(typeof storage.seedBuiltinProfiles).toBe('function');
    expect(typeof storage.getProfile).toBe('function');
    expect(typeof storage.getProfileByName).toBe('function');
    expect(typeof storage.listProfiles).toBe('function');
    expect(typeof storage.createProfile).toBe('function');
    expect(typeof storage.updateProfile).toBe('function');
    expect(typeof storage.deleteProfile).toBe('function');
  });

  it('has delegation CRUD methods', () => {
    expect(typeof storage.createDelegation).toBe('function');
    expect(typeof storage.updateDelegation).toBe('function');
    expect(typeof storage.getDelegation).toBe('function');
    expect(typeof storage.listDelegations).toBe('function');
    expect(typeof storage.getActiveDelegations).toBe('function');
    expect(typeof storage.getDelegationTree).toBe('function');
  });

  it('has message methods', () => {
    expect(typeof storage.storeDelegationMessage).toBe('function');
    expect(typeof storage.getDelegationMessages).toBe('function');
  });

  it('extends PgBaseStorage', () => {
    expect(typeof storage.close).toBe('function');
  });
});
