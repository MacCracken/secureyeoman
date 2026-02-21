import { describe, it, expect } from 'vitest';
import { BUILTIN_TRIGGERS } from './builtin-triggers.js';

describe('BUILTIN_TRIGGERS', () => {
  it('exports 5 builtin triggers', () => {
    expect(BUILTIN_TRIGGERS).toHaveLength(5);
  });

  it('all triggers are disabled by default', () => {
    for (const trigger of BUILTIN_TRIGGERS) {
      expect(trigger.enabled).toBe(false);
    }
  });

  it('all triggers are marked as builtin', () => {
    for (const trigger of BUILTIN_TRIGGERS) {
      expect(trigger.builtin).toBe(true);
    }
  });

  it('contains daily-standup trigger with correct schedule', () => {
    const trigger = BUILTIN_TRIGGERS.find((t) => t.id === 'builtin-daily-standup');
    expect(trigger).toBeDefined();
    expect(trigger?.type).toBe('schedule');
    expect((trigger?.condition as any).cron).toBe('0 9 * * 1-5');
    expect(trigger?.limitPerDay).toBe(1);
  });

  it('contains weekly-summary trigger with correct schedule', () => {
    const trigger = BUILTIN_TRIGGERS.find((t) => t.id === 'builtin-weekly-summary');
    expect(trigger).toBeDefined();
    expect((trigger?.condition as any).cron).toBe('0 17 * * 5');
    expect(trigger?.approvalMode).toBe('suggest');
  });

  it('contains contextual-followup trigger as pattern type', () => {
    const trigger = BUILTIN_TRIGGERS.find((t) => t.id === 'builtin-contextual-followup');
    expect(trigger).toBeDefined();
    expect(trigger?.type).toBe('pattern');
    expect((trigger?.condition as any).minConfidence).toBe(0.7);
  });

  it('contains integration-health trigger as event type', () => {
    const trigger = BUILTIN_TRIGGERS.find((t) => t.id === 'builtin-integration-health');
    expect(trigger).toBeDefined();
    expect(trigger?.type).toBe('event');
    expect((trigger?.condition as any).eventType).toBe('integration_disconnected');
  });

  it('contains security-digest trigger', () => {
    const trigger = BUILTIN_TRIGGERS.find((t) => t.id === 'builtin-security-digest');
    expect(trigger).toBeDefined();
    expect((trigger?.condition as any).cron).toBe('0 8 * * *');
    expect(trigger?.limitPerDay).toBe(1);
  });

  it('all trigger IDs are unique', () => {
    const ids = BUILTIN_TRIGGERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
