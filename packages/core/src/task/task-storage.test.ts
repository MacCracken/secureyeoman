import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { TaskStorage } from './task-storage.js';
import { TaskStatus, TaskType } from '@secureyeoman/shared';
import type { Task } from '@secureyeoman/shared';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = Date.now();
  return {
    id: `task-${Math.random().toString(36).slice(2, 10)}`,
    type: TaskType.QUERY,
    name: 'Test Task',
    inputHash: 'a'.repeat(64),
    status: TaskStatus.PENDING,
    createdAt: now,
    timeoutMs: 300000,
    securityContext: {
      userId: 'user-1',
      role: 'admin',
      permissionsUsed: ['tasks:execute'],
    },
    ...overrides,
  };
}

describe('TaskStorage', () => {
  let storage: TaskStorage;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new TaskStorage();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('storeTask / getTask', () => {
    it('stores and retrieves a task', async () => {
      const task = makeTask();
      await storage.storeTask(task);
      const retrieved = await storage.getTask(task.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(task.id);
      expect(retrieved!.name).toBe('Test Task');
      expect(retrieved!.status).toBe(TaskStatus.PENDING);
      expect(retrieved!.securityContext.userId).toBe('user-1');
    });

    it('returns null for non-existent task', async () => {
      expect(await storage.getTask('nonexistent')).toBeNull();
    });

    it('stores task with all optional fields', async () => {
      const task = makeTask({
        correlationId: 'corr-1',
        parentTaskId: 'parent-1',
        description: 'A test task',
        startedAt: Date.now(),
        completedAt: Date.now() + 1000,
        durationMs: 1000,
        result: { success: true, outputHash: 'b'.repeat(64) },
        resources: {
          tokens: { input: 10, output: 20, total: 30, cached: 0 },
          memoryPeakMb: 50,
          cpuTimeMs: 500,
          networkBytes: { sent: 100, received: 200 },
          apiCalls: [{ provider: 'anthropic', endpoint: '/messages', count: 1 }],
        },
      });
      await storage.storeTask(task);
      const retrieved = (await storage.getTask(task.id))!;
      expect(retrieved.correlationId).toBe('corr-1');
      expect(retrieved.parentTaskId).toBe('parent-1');
      expect(retrieved.description).toBe('A test task');
      expect(retrieved.result?.success).toBe(true);
      expect(retrieved.resources?.tokens.total).toBe(30);
    });
  });

  describe('updateTask', () => {
    it('updates task status', async () => {
      const task = makeTask();
      await storage.storeTask(task);
      const updated = await storage.updateTask(task.id, {
        status: TaskStatus.RUNNING,
        startedAt: Date.now(),
      });
      expect(updated).toBe(true);
      const retrieved = (await storage.getTask(task.id))!;
      expect(retrieved.status).toBe(TaskStatus.RUNNING);
      expect(retrieved.startedAt).toBeDefined();
    });

    it('updates task with result and resources', async () => {
      const task = makeTask({ status: TaskStatus.RUNNING });
      await storage.storeTask(task);
      await storage.updateTask(task.id, {
        status: TaskStatus.COMPLETED,
        completedAt: Date.now(),
        durationMs: 1234,
        result: { success: true },
        resources: {
          tokens: { input: 5, output: 15, total: 20, cached: 0 },
          memoryPeakMb: 30,
          cpuTimeMs: 1234,
          networkBytes: { sent: 0, received: 0 },
          apiCalls: [],
        },
      });
      const retrieved = (await storage.getTask(task.id))!;
      expect(retrieved.status).toBe(TaskStatus.COMPLETED);
      expect(retrieved.durationMs).toBe(1234);
      expect(retrieved.result?.success).toBe(true);
    });

    it('returns false for non-existent task', async () => {
      expect(await storage.updateTask('nope', { status: 'failed' })).toBe(false);
    });

    it('returns false when no updates given', async () => {
      const task = makeTask();
      await storage.storeTask(task);
      expect(await storage.updateTask(task.id, {})).toBe(false);
    });
  });

  describe('listTasks', () => {
    it('lists all tasks ordered by created_at desc', async () => {
      const t1 = makeTask({ id: 'a', createdAt: 1000 });
      const t2 = makeTask({ id: 'b', createdAt: 2000 });
      const t3 = makeTask({ id: 'c', createdAt: 3000 });
      await storage.storeTask(t1);
      await storage.storeTask(t2);
      await storage.storeTask(t3);

      const { tasks, total } = await storage.listTasks();
      expect(total).toBe(3);
      expect(tasks).toHaveLength(3);
      expect(tasks[0].id).toBe('c');
      expect(tasks[2].id).toBe('a');
    });

    it('filters by status', async () => {
      await storage.storeTask(makeTask({ id: 'a', status: TaskStatus.COMPLETED }));
      await storage.storeTask(makeTask({ id: 'b', status: TaskStatus.FAILED }));
      await storage.storeTask(makeTask({ id: 'c', status: TaskStatus.COMPLETED }));

      const { tasks, total } = await storage.listTasks({ status: 'completed' });
      expect(total).toBe(2);
      expect(tasks).toHaveLength(2);
      expect(tasks.every((t) => t.status === 'completed')).toBe(true);
    });

    it('filters by type', async () => {
      await storage.storeTask(makeTask({ id: 'a', type: TaskType.QUERY }));
      await storage.storeTask(makeTask({ id: 'b', type: TaskType.EXECUTE }));

      const { tasks, total } = await storage.listTasks({ type: 'query' });
      expect(total).toBe(1);
      expect(tasks[0].type).toBe('query');
    });

    it('filters by userId', async () => {
      await storage.storeTask(
        makeTask({
          id: 'a',
          securityContext: { userId: 'alice', role: 'admin', permissionsUsed: [] },
        })
      );
      await storage.storeTask(
        makeTask({
          id: 'b',
          securityContext: { userId: 'bob', role: 'viewer', permissionsUsed: [] },
        })
      );

      const { tasks, total } = await storage.listTasks({ userId: 'alice' });
      expect(total).toBe(1);
      expect(tasks[0].securityContext.userId).toBe('alice');
    });

    it('filters by time range', async () => {
      await storage.storeTask(makeTask({ id: 'a', createdAt: 1000 }));
      await storage.storeTask(makeTask({ id: 'b', createdAt: 2000 }));
      await storage.storeTask(makeTask({ id: 'c', createdAt: 3000 }));

      const { tasks, total } = await storage.listTasks({ from: 1500, to: 2500 });
      expect(total).toBe(1);
      expect(tasks[0].id).toBe('b');
    });

    it('supports limit and offset', async () => {
      for (let i = 0; i < 10; i++) {
        await storage.storeTask(makeTask({ id: `t-${i}`, createdAt: i * 1000 }));
      }

      const page1 = await storage.listTasks({ limit: 3, offset: 0 });
      expect(page1.total).toBe(10);
      expect(page1.tasks).toHaveLength(3);

      const page2 = await storage.listTasks({ limit: 3, offset: 3 });
      expect(page2.tasks).toHaveLength(3);
      expect(page2.tasks[0].id).not.toBe(page1.tasks[0].id);
    });
  });

  describe('getStats', () => {
    it('returns stats with empty database', async () => {
      const stats = await storage.getStats();
      expect(stats.total).toBe(0);
      expect(stats.byStatus).toEqual({});
      expect(stats.byType).toEqual({});
      expect(stats.successRate).toBe(0);
      expect(stats.avgDurationMs).toBe(0);
    });

    it('computes stats correctly', async () => {
      await storage.storeTask(
        makeTask({ id: 'a', status: TaskStatus.COMPLETED, type: TaskType.QUERY })
      );
      await storage.storeTask(
        makeTask({ id: 'b', status: TaskStatus.COMPLETED, type: TaskType.QUERY })
      );
      await storage.storeTask(
        makeTask({ id: 'c', status: TaskStatus.FAILED, type: TaskType.EXECUTE })
      );
      await storage.storeTask(
        makeTask({ id: 'd', status: TaskStatus.PENDING, type: TaskType.FILE })
      );

      // Add duration to completed tasks
      await storage.updateTask('a', { durationMs: 100 });
      await storage.updateTask('b', { durationMs: 200 });
      await storage.updateTask('c', { durationMs: 500 });

      const stats = await storage.getStats();
      expect(stats.total).toBe(4);
      expect(stats.byStatus.completed).toBe(2);
      expect(stats.byStatus.failed).toBe(1);
      expect(stats.byStatus.pending).toBe(1);
      expect(stats.byType.query).toBe(2);
      expect(stats.byType.execute).toBe(1);
      // 2 completed out of 3 finished (completed + failed)
      expect(stats.successRate).toBeCloseTo(2 / 3, 5);
      // avg of 100, 200, 500 = 266.67
      expect(stats.avgDurationMs).toBeCloseTo(266.67, 0);
    });

    it('getStats should return correct counts with mixed statuses', async () => {
      // Insert tasks with all possible terminal statuses
      await storage.storeTask(
        makeTask({ id: 'c1', status: TaskStatus.COMPLETED, type: TaskType.QUERY })
      );
      await storage.storeTask(
        makeTask({ id: 'c2', status: TaskStatus.COMPLETED, type: TaskType.EXECUTE })
      );
      await storage.storeTask(
        makeTask({ id: 'c3', status: TaskStatus.COMPLETED, type: TaskType.QUERY })
      );
      await storage.storeTask(
        makeTask({ id: 'f1', status: TaskStatus.FAILED, type: TaskType.QUERY })
      );
      await storage.storeTask(
        makeTask({ id: 'p1', status: TaskStatus.PENDING, type: TaskType.FILE })
      );
      await storage.storeTask(
        makeTask({ id: 'r1', status: TaskStatus.RUNNING, type: TaskType.EXECUTE })
      );

      // Add durations to some tasks
      await storage.updateTask('c1', { durationMs: 100 });
      await storage.updateTask('c2', { durationMs: 300 });
      await storage.updateTask('f1', { durationMs: 200 });

      const stats = await storage.getStats();
      expect(stats.total).toBe(6);
      expect(stats.byStatus.completed).toBe(3);
      expect(stats.byStatus.failed).toBe(1);
      expect(stats.byStatus.pending).toBe(1);
      expect(stats.byStatus.running).toBe(1);
      expect(stats.byType.query).toBe(3);
      expect(stats.byType.execute).toBe(2);
      expect(stats.byType.file).toBe(1);
      // 3 completed out of 4 finished (3 completed + 1 failed)
      expect(stats.successRate).toBeCloseTo(3 / 4, 5);
      // avg of 100, 300, 200 = 200
      expect(stats.avgDurationMs).toBeCloseTo(200, 0);
    });
  });
});
