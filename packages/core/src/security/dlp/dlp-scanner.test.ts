import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClassificationEngine } from './classification-engine.js';
import { DlpScanner } from './dlp-scanner.js';
import type { DlpPolicyStore } from './dlp-policy-store.js';
import type { DlpPolicy } from './types.js';

function makeEngine() {
  return new ClassificationEngine({}, {
    logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() } as any,
  });
}

function makeMockPolicyStore(policies: DlpPolicy[] = []) {
  return {
    list: vi.fn().mockResolvedValue({ policies, total: policies.length }),
    create: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    close: vi.fn(),
  } as unknown as DlpPolicyStore;
}

function makePolicy(overrides: Partial<DlpPolicy> = {}): DlpPolicy {
  return {
    id: 'pol-1',
    name: 'Test Policy',
    description: null,
    enabled: true,
    rules: [],
    action: 'block',
    classificationLevels: ['confidential', 'restricted'],
    appliesTo: ['slack'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tenantId: 'default',
    ...overrides,
  };
}

describe('DlpScanner', () => {
  let engine: ClassificationEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  it('returns allowed when no policies match', async () => {
    const store = makeMockPolicyStore([]);
    const scanner = new DlpScanner(engine, store);
    const result = await scanner.scan('Hello world', 'slack');
    expect(result.allowed).toBe(true);
    expect(result.action).toBe('allowed');
    expect(result.findings).toHaveLength(0);
  });

  it('blocks content matching a pii_type rule', async () => {
    const policy = makePolicy({
      rules: [{ type: 'pii_type', value: 'ssn' }],
      action: 'block',
    });
    const store = makeMockPolicyStore([policy]);
    const scanner = new DlpScanner(engine, store);
    const result = await scanner.scan('My SSN is 123-45-6789', 'slack');
    expect(result.allowed).toBe(false);
    expect(result.action).toBe('blocked');
    expect(result.policyId).toBe('pol-1');
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].type).toBe('pii_type');
  });

  it('warns on keyword match with warn action', async () => {
    const policy = makePolicy({
      rules: [{ type: 'keyword', value: 'confidential' }],
      action: 'warn',
    });
    const store = makeMockPolicyStore([policy]);
    const scanner = new DlpScanner(engine, store);
    const result = await scanner.scan('This is confidential data', 'email');
    expect(result.allowed).toBe(true);
    expect(result.action).toBe('warned');
    expect(result.policyName).toBe('Test Policy');
  });

  it('matches classification_level rule', async () => {
    const policy = makePolicy({
      rules: [{ type: 'classification_level', value: 'confidential' }],
      action: 'block',
    });
    const store = makeMockPolicyStore([policy]);
    const scanner = new DlpScanner(engine, store);
    // "confidential" keyword triggers confidential classification
    const result = await scanner.scan('This is confidential information', 'api');
    expect(result.allowed).toBe(false);
    expect(result.action).toBe('blocked');
    expect(result.classificationLevel).toBe('confidential');
  });

  it('matches custom pattern rule', async () => {
    const policy = makePolicy({
      rules: [{ type: 'pattern', value: 'PROJECT-\\d+' }],
      action: 'warn',
    });
    const store = makeMockPolicyStore([policy]);
    const scanner = new DlpScanner(engine, store);
    const result = await scanner.scan('Check PROJECT-12345 status', 'webhook');
    expect(result.allowed).toBe(true);
    expect(result.action).toBe('warned');
    expect(result.findings[0].type).toBe('pattern');
  });

  it('skips invalid regex in pattern rule', async () => {
    const policy = makePolicy({
      rules: [{ type: 'pattern', value: '[invalid(' }],
      action: 'block',
    });
    const store = makeMockPolicyStore([policy]);
    const scanner = new DlpScanner(engine, store);
    const result = await scanner.scan('Some text', 'api');
    expect(result.allowed).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('uses strictest action across multiple policies', async () => {
    const warnPolicy = makePolicy({
      id: 'pol-warn',
      name: 'Warn Policy',
      rules: [{ type: 'keyword', value: 'secret' }],
      action: 'warn',
    });
    const blockPolicy = makePolicy({
      id: 'pol-block',
      name: 'Block Policy',
      rules: [{ type: 'keyword', value: 'secret' }],
      action: 'block',
    });
    const store = makeMockPolicyStore([warnPolicy, blockPolicy]);
    const scanner = new DlpScanner(engine, store);
    const result = await scanner.scan('top secret document', 'slack');
    expect(result.allowed).toBe(false);
    expect(result.action).toBe('blocked');
    expect(result.policyId).toBe('pol-block');
  });

  it('returns correct classification level', async () => {
    const store = makeMockPolicyStore([]);
    const scanner = new DlpScanner(engine, store);
    const result = await scanner.scan('My email is alice@example.com', 'api');
    expect(result.classificationLevel).toBe('confidential');
  });

  it('allows content when no rules match', async () => {
    const policy = makePolicy({
      rules: [{ type: 'keyword', value: 'nuclear' }],
      action: 'block',
    });
    const store = makeMockPolicyStore([policy]);
    const scanner = new DlpScanner(engine, store);
    const result = await scanner.scan('Ordinary content', 'slack');
    expect(result.allowed).toBe(true);
    expect(result.action).toBe('allowed');
    expect(result.findings).toHaveLength(0);
  });

  it('log action does not change the default allowed status', async () => {
    const policy = makePolicy({
      rules: [{ type: 'keyword', value: 'test' }],
      action: 'log',
    });
    const store = makeMockPolicyStore([policy]);
    const scanner = new DlpScanner(engine, store);
    const result = await scanner.scan('test data', 'api');
    // log action has severity 1, but does not set warned or blocked
    expect(result.allowed).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('handles multiple findings from multiple rules', async () => {
    const policy = makePolicy({
      rules: [
        { type: 'pii_type', value: 'email' },
        { type: 'keyword', value: 'secret' },
      ],
      action: 'block',
    });
    const store = makeMockPolicyStore([policy]);
    const scanner = new DlpScanner(engine, store);
    const result = await scanner.scan('Email alice@example.com about the top secret project', 'slack');
    expect(result.allowed).toBe(false);
    expect(result.findings.length).toBe(2);
    const types = result.findings.map(f => f.type);
    expect(types).toContain('pii_type');
    expect(types).toContain('keyword');
  });
});
