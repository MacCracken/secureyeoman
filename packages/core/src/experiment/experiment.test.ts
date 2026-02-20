import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { ExperimentStorage } from './storage.js';
import { ExperimentManager } from './manager.js';
import { createNoopLogger } from '../logging/logger.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('ExperimentStorage', () => {
  let storage: ExperimentStorage;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new ExperimentStorage();
  });

  it('should create and retrieve experiment', async () => {
    const exp = await storage.create({
      name: 'Test',
      variants: [
        { id: 'a', name: 'A', trafficPercent: 50 },
        { id: 'b', name: 'B', trafficPercent: 50 },
      ],
    });
    expect(exp.id).toBeTruthy();
    expect((await storage.get(exp.id))!.name).toBe('Test');
    expect((await storage.get(exp.id))!.variants).toHaveLength(2);
  });

  it('should list and delete experiments', async () => {
    await storage.create({
      name: 'E1',
      variants: [
        { id: 'a', name: 'A', trafficPercent: 50 },
        { id: 'b', name: 'B', trafficPercent: 50 },
      ],
    });
    expect((await storage.list()).experiments).toHaveLength(1);
    const list = await storage.list();
    expect(await storage.delete(list.experiments[0].id)).toBe(true);
    expect((await storage.list()).experiments).toHaveLength(0);
  });
});

describe('ExperimentManager', () => {
  let storage: ExperimentStorage;
  let manager: ExperimentManager;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new ExperimentStorage();
    manager = new ExperimentManager(storage, { logger: createNoopLogger() });
  });

  it('should start and stop experiments', async () => {
    const exp = await manager.create({
      name: 'Test',
      variants: [
        { id: 'a', name: 'A', trafficPercent: 50 },
        { id: 'b', name: 'B', trafficPercent: 50 },
      ],
    });
    const started = await manager.start(exp.id);
    expect(started!.status).toBe('running');
    const stopped = await manager.stop(exp.id);
    expect(stopped!.status).toBe('completed');
  });

  it('should select a variant for running experiment', async () => {
    const exp = await manager.create({
      name: 'Test',
      variants: [
        { id: 'a', name: 'A', trafficPercent: 50 },
        { id: 'b', name: 'B', trafficPercent: 50 },
      ],
    });
    await manager.start(exp.id);
    const variant = await manager.selectVariant(exp.id);
    expect(['a', 'b']).toContain(variant);
  });

  it('should return null variant for non-running experiment', async () => {
    const exp = await manager.create({
      name: 'Test',
      variants: [
        { id: 'a', name: 'A', trafficPercent: 50 },
        { id: 'b', name: 'B', trafficPercent: 50 },
      ],
    });
    expect(await manager.selectVariant(exp.id)).toBeNull();
  });
});
