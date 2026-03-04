import { describe, expect, it } from 'vitest';
import type { MemoryAuditPolicy as MemoryAuditPolicyConfig } from '@secureyeoman/shared';
import { MemoryAuditPolicy } from './policy.js';

const DEFAULT_CONFIG: MemoryAuditPolicyConfig = {
  enabled: false,
  dailySchedule: '30 3 * * *',
  weeklySchedule: '0 4 * * 0',
  monthlySchedule: '0 5 1 * *',
  compressionEnabled: true,
  reorganizationEnabled: true,
  requireApproval: false,
  retainOriginals: true,
  archivalAgeDays: 30,
  compressionThreshold: 0.85,
  maxMemoriesPerPersonality: 10000,
  model: null,
};

function makePolicy(overrides: Partial<MemoryAuditPolicyConfig> = {}): MemoryAuditPolicy {
  return new MemoryAuditPolicy({ ...DEFAULT_CONFIG, ...overrides });
}

describe('MemoryAuditPolicy', () => {
  // ── isEnabled ──────────────────────────────────────────────

  it('returns false for isEnabled with default config', () => {
    const policy = makePolicy();
    expect(policy.isEnabled()).toBe(false);
  });

  it('returns true for isEnabled when enabled is set', () => {
    const policy = makePolicy({ enabled: true });
    expect(policy.isEnabled()).toBe(true);
  });

  // ── isCompressionEnabled ───────────────────────────────────

  it('returns true for isCompressionEnabled with default config', () => {
    const policy = makePolicy();
    expect(policy.isCompressionEnabled()).toBe(true);
  });

  it('returns false for isCompressionEnabled when disabled', () => {
    const policy = makePolicy({ compressionEnabled: false });
    expect(policy.isCompressionEnabled()).toBe(false);
  });

  // ── isReorganizationEnabled ────────────────────────────────

  it('returns true for isReorganizationEnabled with default config', () => {
    const policy = makePolicy();
    expect(policy.isReorganizationEnabled()).toBe(true);
  });

  it('returns false for isReorganizationEnabled when disabled', () => {
    const policy = makePolicy({ reorganizationEnabled: false });
    expect(policy.isReorganizationEnabled()).toBe(false);
  });

  // ── requiresApproval ──────────────────────────────────────

  it('returns false for requiresApproval with default config', () => {
    const policy = makePolicy();
    expect(policy.requiresApproval()).toBe(false);
  });

  it('returns true for requiresApproval when set', () => {
    const policy = makePolicy({ requireApproval: true });
    expect(policy.requiresApproval()).toBe(true);
  });

  // ── shouldRetainOriginals ─────────────────────────────────

  it('returns true for shouldRetainOriginals with default config', () => {
    const policy = makePolicy();
    expect(policy.shouldRetainOriginals()).toBe(true);
  });

  // ── getSchedule ───────────────────────────────────────────

  it('returns daily schedule for daily scope', () => {
    const policy = makePolicy({ dailySchedule: '0 2 * * *' });
    expect(policy.getSchedule('daily')).toBe('0 2 * * *');
  });

  it('returns weekly schedule for weekly scope', () => {
    const policy = makePolicy();
    expect(policy.getSchedule('weekly')).toBe('0 4 * * 0');
  });

  it('returns monthly schedule for monthly scope', () => {
    const policy = makePolicy({ monthlySchedule: '0 6 15 * *' });
    expect(policy.getSchedule('monthly')).toBe('0 6 15 * *');
  });

  // ── Numeric getters ───────────────────────────────────────

  it('returns default archival age days', () => {
    const policy = makePolicy();
    expect(policy.getArchivalAgeDays()).toBe(30);
  });

  it('returns custom archival age days', () => {
    const policy = makePolicy({ archivalAgeDays: 90 });
    expect(policy.getArchivalAgeDays()).toBe(90);
  });

  it('returns default compression threshold', () => {
    const policy = makePolicy();
    expect(policy.getCompressionThreshold()).toBe(0.85);
  });

  it('returns default max memories per personality', () => {
    const policy = makePolicy();
    expect(policy.getMaxMemoriesPerPersonality()).toBe(10000);
  });

  // ── getModel ──────────────────────────────────────────────

  it('returns null model by default', () => {
    const policy = makePolicy();
    expect(policy.getModel()).toBeNull();
  });

  it('returns custom model when set', () => {
    const policy = makePolicy({ model: 'gpt-4o' });
    expect(policy.getModel()).toBe('gpt-4o');
  });

  // ── getConfig ─────────────────────────────────────────────

  it('returns a shallow copy of the config', () => {
    const policy = makePolicy({ enabled: true, archivalAgeDays: 60 });
    const config = policy.getConfig();

    expect(config.enabled).toBe(true);
    expect(config.archivalAgeDays).toBe(60);

    // Mutating the returned config should not affect the policy
    config.enabled = false;
    config.archivalAgeDays = 999;
    expect(policy.isEnabled()).toBe(true);
    expect(policy.getArchivalAgeDays()).toBe(60);
  });
});
