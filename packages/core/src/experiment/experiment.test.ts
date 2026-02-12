import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExperimentStorage } from './storage.js';
import { ExperimentManager } from './manager.js';
import { createNoopLogger } from '../logging/logger.js';
import { existsSync, unlinkSync } from 'node:fs';

const TEST_DB = '/tmp/experiment-test.db';

describe('ExperimentStorage', () => {
  let storage: ExperimentStorage;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); storage = new ExperimentStorage({ dbPath: TEST_DB }); });
  afterEach(() => { storage.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it('should create and retrieve experiment', () => {
    const exp = storage.create({ name: 'Test', variants: [{ id: 'a', name: 'A', trafficPercent: 50 }, { id: 'b', name: 'B', trafficPercent: 50 }] });
    expect(exp.id).toBeTruthy();
    expect(storage.get(exp.id)!.name).toBe('Test');
    expect(storage.get(exp.id)!.variants).toHaveLength(2);
  });

  it('should list and delete experiments', () => {
    storage.create({ name: 'E1', variants: [{ id: 'a', name: 'A', trafficPercent: 50 }, { id: 'b', name: 'B', trafficPercent: 50 }] });
    expect(storage.list()).toHaveLength(1);
    expect(storage.delete(storage.list()[0].id)).toBe(true);
    expect(storage.list()).toHaveLength(0);
  });
});

describe('ExperimentManager', () => {
  let storage: ExperimentStorage;
  let manager: ExperimentManager;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); storage = new ExperimentStorage({ dbPath: TEST_DB }); manager = new ExperimentManager(storage, { logger: createNoopLogger() }); });
  afterEach(() => { storage.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it('should start and stop experiments', () => {
    const exp = manager.create({ name: 'Test', variants: [{ id: 'a', name: 'A', trafficPercent: 50 }, { id: 'b', name: 'B', trafficPercent: 50 }] });
    const started = manager.start(exp.id);
    expect(started!.status).toBe('running');
    const stopped = manager.stop(exp.id);
    expect(stopped!.status).toBe('completed');
  });

  it('should select a variant for running experiment', () => {
    const exp = manager.create({ name: 'Test', variants: [{ id: 'a', name: 'A', trafficPercent: 50 }, { id: 'b', name: 'B', trafficPercent: 50 }] });
    manager.start(exp.id);
    const variant = manager.selectVariant(exp.id);
    expect(['a', 'b']).toContain(variant);
  });

  it('should return null variant for non-running experiment', () => {
    const exp = manager.create({ name: 'Test', variants: [{ id: 'a', name: 'A', trafficPercent: 50 }, { id: 'b', name: 'B', trafficPercent: 50 }] });
    expect(manager.selectVariant(exp.id)).toBeNull();
  });
});
