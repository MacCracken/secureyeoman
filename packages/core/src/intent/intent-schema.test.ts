/**
 * Intent Schema Tests — Phase 48
 *
 * Validates OrgIntentDocSchema Zod parsing.
 * No database required.
 */

import { describe, it, expect } from 'vitest';
import {
  OrgIntentDocSchema,
  GoalSchema,
  SignalSchema,
  HardBoundarySchema,
  TradeoffProfileSchema,
  DataSourceSchema,
  AuthorizedActionSchema,
} from './schema.js';

// ── GoalSchema ─────────────────────────────────────────────────────────────────

describe('GoalSchema', () => {
  it('parses a minimal goal', () => {
    const result = GoalSchema.parse({ id: 'g1', name: 'Grow Revenue' });
    expect(result.id).toBe('g1');
    expect(result.name).toBe('Grow Revenue');
    expect(result.priority).toBe(50);
    expect(result.skills).toEqual([]);
    expect(result.signals).toEqual([]);
  });

  it('parses a full goal', () => {
    const result = GoalSchema.parse({
      id: 'g1',
      name: 'Grow Revenue',
      description: 'Increase ARR',
      priority: 10,
      activeWhen: 'quarter=Q1',
      successCriteria: 'ARR > 1M',
      ownerRole: 'ceo',
      skills: ['sales-analyzer'],
      signals: ['s1'],
      authorizedActions: ['a1'],
    });
    expect(result.priority).toBe(10);
    expect(result.activeWhen).toBe('quarter=Q1');
  });

  it('parses completionCondition when present', () => {
    const result = GoalSchema.parse({
      id: 'g1',
      name: 'Reach Milestone',
      completionCondition: 'signal:revenue_signal crosses 1000000',
    });
    expect(result.completionCondition).toBe('signal:revenue_signal crosses 1000000');
  });

  it('completionCondition is undefined when omitted', () => {
    const result = GoalSchema.parse({ id: 'g1', name: 'Minimal Goal' });
    expect(result.completionCondition).toBeUndefined();
  });

  it('rejects a goal without required id', () => {
    const result = GoalSchema.safeParse({ name: 'No ID' });
    expect(result.success).toBe(false);
  });
});

// ── SignalSchema ───────────────────────────────────────────────────────────────

describe('SignalSchema', () => {
  it('parses a minimal signal', () => {
    const result = SignalSchema.parse({
      id: 's1',
      name: 'API Error Rate',
      threshold: 5,
    });
    expect(result.direction).toBe('above');
    expect(result.warningThreshold).toBeUndefined();
  });

  it('parses direction below', () => {
    const result = SignalSchema.parse({
      id: 's2',
      name: 'Uptime',
      threshold: 99,
      direction: 'below',
      warningThreshold: 99.5,
    });
    expect(result.direction).toBe('below');
    expect(result.warningThreshold).toBe(99.5);
  });

  it('rejects invalid direction', () => {
    const result = SignalSchema.safeParse({
      id: 's3',
      name: 'x',
      threshold: 1,
      direction: 'sideways',
    });
    expect(result.success).toBe(false);
  });
});

// ── HardBoundarySchema ────────────────────────────────────────────────────────

describe('HardBoundarySchema', () => {
  it('parses a minimal boundary', () => {
    const result = HardBoundarySchema.parse({
      id: 'hb1',
      rule: 'deny: delete production database',
    });
    expect(result.rego).toBeUndefined();
    expect(result.rationale).toBe('');
  });

  it('parses with rego and rationale', () => {
    const result = HardBoundarySchema.parse({
      id: 'hb1',
      rule: 'tool:rm',
      rego: 'package authz\ndefault allow = false',
      rationale: 'Prevent accidental deletion',
    });
    expect(result.rego).toContain('package authz');
  });
});

// ── TradeoffProfileSchema ─────────────────────────────────────────────────────

describe('TradeoffProfileSchema', () => {
  it('parses with defaults', () => {
    const result = TradeoffProfileSchema.parse({ id: 'tp1', name: 'Balanced' });
    expect(result.speedVsThoroughness).toBe(0.5);
    expect(result.costVsQuality).toBe(0.5);
    expect(result.autonomyVsConfirmation).toBe(0.5);
    expect(result.isDefault).toBe(false);
  });

  it('rejects out-of-range values', () => {
    const result = TradeoffProfileSchema.safeParse({
      id: 'tp1',
      name: 'Bad',
      speedVsThoroughness: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

// ── DataSourceSchema ──────────────────────────────────────────────────────────

describe('DataSourceSchema', () => {
  it('parses an http data source', () => {
    const result = DataSourceSchema.parse({
      id: 'ds1',
      name: 'Prometheus',
      type: 'http',
      connection: 'http://prometheus:9090/api/v1/query',
    });
    expect(result.type).toBe('http');
  });

  it('rejects an unknown type', () => {
    const result = DataSourceSchema.safeParse({
      id: 'ds1',
      name: 'Bad',
      type: 'graphql',
      connection: 'http://example.com',
    });
    expect(result.success).toBe(false);
  });
});

// ── AuthorizedActionSchema ────────────────────────────────────────────────────

describe('AuthorizedActionSchema', () => {
  it('parses a minimal action', () => {
    const result = AuthorizedActionSchema.parse({
      id: 'a1',
      description: 'Send Slack alerts',
    });
    expect(result.appliesToGoals).toEqual([]);
    expect(result.mcpTools).toEqual([]);
  });
});

// ── OrgIntentDocSchema (full) ─────────────────────────────────────────────────

describe('OrgIntentDocSchema', () => {
  it('parses a minimal doc', () => {
    const result = OrgIntentDocSchema.parse({ name: 'My Org Intent' });
    expect(result.apiVersion).toBe('v1');
    expect(result.goals).toEqual([]);
    expect(result.signals).toEqual([]);
    expect(result.hardBoundaries).toEqual([]);
    expect(result.delegationFramework.tenants).toEqual([]);
    expect(result.context).toEqual([]);
  });

  it('parses a full intent doc', () => {
    const result = OrgIntentDocSchema.parse({
      apiVersion: 'v1',
      name: 'ACME Org Intent',
      goals: [{ id: 'g1', name: 'Grow ARR', threshold: undefined }],
      signals: [{ id: 's1', name: 'Error Rate', threshold: 5 }],
      dataSources: [
        { id: 'ds1', name: 'Prometheus', type: 'http', connection: 'http://localhost:9090' },
      ],
      tradeoffProfiles: [{ id: 'tp1', name: 'Balanced', isDefault: true }],
      hardBoundaries: [{ id: 'hb1', rule: 'deny: drop table' }],
      delegationFramework: {
        tenants: [
          {
            id: 't1',
            principle: 'Principle of least privilege',
            decisionBoundaries: ['Only read prod'],
          },
        ],
      },
      context: [
        { key: 'orgName', value: 'ACME Corp' },
        { key: 'industry', value: 'SaaS' },
      ],
    });

    expect(result.goals).toHaveLength(1);
    expect(result.signals).toHaveLength(1);
    expect(result.tradeoffProfiles[0].isDefault).toBe(true);
    expect(result.delegationFramework.tenants).toHaveLength(1);
    expect(result.context[1].key).toBe('industry');
  });

  it('rejects a doc without name', () => {
    const result = OrgIntentDocSchema.safeParse({ goals: [] });
    expect(result.success).toBe(false);
  });

  it('surfaces structured errors for invalid nested fields', () => {
    const result = OrgIntentDocSchema.safeParse({
      name: 'Test',
      signals: [{ id: 's1', name: 'Bad', threshold: 5, direction: 'sideways' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.length).toBeGreaterThan(0);
    }
  });
});
