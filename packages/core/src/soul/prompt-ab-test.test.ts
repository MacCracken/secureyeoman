import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptAbTestManager } from './prompt-ab-test.js';

describe('PromptAbTestManager', () => {
  let manager: PromptAbTestManager;

  beforeEach(() => {
    manager = new PromptAbTestManager();
  });

  it('creates a test with valid variants', () => {
    const test = manager.create({
      personalityId: 'p1',
      name: 'Test 1',
      variants: [
        { name: 'Control', systemPrompt: 'You are helpful.', trafficPercent: 50 },
        { name: 'Variant', systemPrompt: 'You are very helpful.', trafficPercent: 50 },
      ],
    });

    expect(test.id).toBeTruthy();
    expect(test.status).toBe('running');
    expect(test.variants).toHaveLength(2);
  });

  it('rejects fewer than 2 variants', () => {
    expect(() =>
      manager.create({
        personalityId: 'p1',
        name: 'Bad',
        variants: [{ name: 'Only', systemPrompt: 'Solo', trafficPercent: 100 }],
      })
    ).toThrow('At least 2 variants');
  });

  it('rejects traffic not summing to 100', () => {
    expect(() =>
      manager.create({
        personalityId: 'p1',
        name: 'Bad',
        variants: [
          { name: 'A', systemPrompt: 'a', trafficPercent: 30 },
          { name: 'B', systemPrompt: 'b', trafficPercent: 30 },
        ],
      })
    ).toThrow('sum to 100');
  });

  it('enforces one running test per personality', () => {
    manager.create({
      personalityId: 'p1',
      name: 'Test 1',
      variants: [
        { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
        { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
      ],
    });

    expect(() =>
      manager.create({
        personalityId: 'p1',
        name: 'Test 2',
        variants: [
          { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
          { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
        ],
      })
    ).toThrow('already exists');
  });

  it('resolvePrompt returns null when no active test', () => {
    expect(manager.resolvePrompt('p1', 'conv1')).toBeNull();
  });

  it('resolvePrompt assigns a variant', () => {
    manager.create({
      personalityId: 'p1',
      name: 'Test',
      variants: [
        { name: 'A', systemPrompt: 'prompt-a', trafficPercent: 50 },
        { name: 'B', systemPrompt: 'prompt-b', trafficPercent: 50 },
      ],
    });

    const result = manager.resolvePrompt('p1', 'conv1');
    expect(result).not.toBeNull();
    expect(['prompt-a', 'prompt-b']).toContain(result!.systemPrompt);
  });

  it('resolvePrompt is sticky for same conversation', () => {
    manager.create({
      personalityId: 'p1',
      name: 'Test',
      variants: [
        { name: 'A', systemPrompt: 'prompt-a', trafficPercent: 50 },
        { name: 'B', systemPrompt: 'prompt-b', trafficPercent: 50 },
      ],
    });

    const first = manager.resolvePrompt('p1', 'conv1');
    const second = manager.resolvePrompt('p1', 'conv1');
    expect(first!.variantId).toBe(second!.variantId);
  });

  it('recordScore and evaluate track quality', () => {
    const test = manager.create({
      personalityId: 'p1',
      name: 'Test',
      variants: [
        { name: 'A', systemPrompt: 'a', trafficPercent: 100 },
        { name: 'B', systemPrompt: 'b', trafficPercent: 0 },
      ],
      minConversations: 2,
    });

    // All traffic goes to A
    const r1 = manager.resolvePrompt('p1', 'c1')!;
    const r2 = manager.resolvePrompt('p1', 'c2')!;
    manager.recordScore(test.id, 'c1', 0.8);
    manager.recordScore(test.id, 'c2', 0.9);

    const evaluation = manager.evaluate(test.id);
    expect(evaluation.ready).toBe(true);
    expect(evaluation.results.length).toBe(2);
  });

  it('complete marks test as completed', () => {
    const test = manager.create({
      personalityId: 'p1',
      name: 'Test',
      variants: [
        { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
        { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
      ],
    });

    const completed = manager.complete(test.id, test.variants[0]!.id);
    expect(completed!.status).toBe('completed');
    expect(completed!.completedAt).not.toBeNull();
  });

  it('cancel stops a running test', () => {
    const test = manager.create({
      personalityId: 'p1',
      name: 'Test',
      variants: [
        { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
        { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
      ],
    });

    expect(manager.cancel(test.id)).toBe(true);
    expect(manager.get(test.id)!.status).toBe('completed');
  });

  it('list returns tests filtered by personality', () => {
    manager.create({
      personalityId: 'p1',
      name: 'T1',
      variants: [
        { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
        { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
      ],
    });

    expect(manager.list('p1')).toHaveLength(1);
    expect(manager.list('p2')).toHaveLength(0);
  });

  it('serialize produces plain object', () => {
    const test = manager.create({
      personalityId: 'p1',
      name: 'Test',
      variants: [
        { name: 'A', systemPrompt: 'a', trafficPercent: 50 },
        { name: 'B', systemPrompt: 'b', trafficPercent: 50 },
      ],
    });

    const serialized = manager.serialize(test);
    expect(serialized.id).toBe(test.id);
    expect(Array.isArray(serialized.results)).toBe(true);
  });
});
