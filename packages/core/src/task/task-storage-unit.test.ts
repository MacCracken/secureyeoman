/**
 * TaskStorage Unit Tests — no DB required
 *
 * Uses vi.spyOn to mock PgBaseStorage protected methods.
 * The existing task-storage.test.ts uses a real DB; this file
 * covers all branches without a database connection.
 */

import { describe, it, expect, vi } from 'vitest';
import { TaskStorage } from './task-storage.js';
import { TaskStatus, TaskType } from '@secureyeoman/shared';
import type { Task } from '@secureyeoman/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    type: TaskType.QUERY,
    name: 'Test Task',
    inputHash: 'a'.repeat(64),
    status: TaskStatus.PENDING,
    createdAt: 1_000_000,
    timeoutMs: 300_000,
    securityContext: { userId: 'user-1', role: 'admin', permissionsUsed: [] },
    ...overrides,
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    correlation_id: null,
    parent_task_id: null,
    type: 'query',
    name: 'Test Task',
    description: null,
    input_hash: 'a'.repeat(64),
    status: 'pending',
    result_json: null,
    resources_json: null,
    security_context_json: { userId: 'user-1', role: 'admin', permissionsUsed: [] },
    timeout_ms: 300_000,
    created_at: 1_000_000,
    started_at: null,
    completed_at: null,
    duration_ms: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TaskStorage.storeTask()', () => {
  it('calls query with task fields', async () => {
    const storage = new TaskStorage();
    const spy = vi.spyOn(storage as any, 'query').mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const task = makeTask({
      correlationId: 'corr-1',
      parentTaskId: 'parent-1',
      description: 'desc',
      result: { success: true },
      resources: { tokensUsed: 100 } as any,
      startedAt: 2_000_000,
      completedAt: 3_000_000,
      durationMs: 1_000_000,
    });
    await storage.storeTask(task);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('handles optional fields as null', async () => {
    const storage = new TaskStorage();
    const spy = vi.spyOn(storage as any, 'query').mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await storage.storeTask(makeTask());
    const callArgs = spy.mock.calls[0]![1];
    expect(callArgs![1]).toBeNull(); // correlationId
    expect(callArgs![2]).toBeNull(); // parentTaskId
  });
});

describe('TaskStorage.updateTask()', () => {
  it('returns false when no updates provided', async () => {
    const storage = new TaskStorage();
    const result = await storage.updateTask('task-1', {});
    expect(result).toBe(false);
  });

  it('updates status only', async () => {
    const storage = new TaskStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    const result = await storage.updateTask('task-1', { status: 'completed' });
    expect(result).toBe(true);
  });

  it('updates multiple fields', async () => {
    const storage = new TaskStorage();
    const spy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    await storage.updateTask('task-1', {
      status: 'completed',
      startedAt: 1000,
      completedAt: 2000,
      durationMs: 1000,
      result: { success: true },
      resources: { tokensUsed: 50 } as any,
    });
    // Should have 6 SET clauses
    const sql = spy.mock.calls[0]![0] as string;
    expect(sql).toContain('status = ');
    expect(sql).toContain('started_at = ');
    expect(sql).toContain('result_json = ');
  });

  it('returns false when no row updated', async () => {
    const storage = new TaskStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(0);
    const result = await storage.updateTask('task-1', { status: 'failed' });
    expect(result).toBe(false);
  });
});

describe('TaskStorage.updateTaskMetadata()', () => {
  it('returns false when no updates provided', async () => {
    const storage = new TaskStorage();
    const result = await storage.updateTaskMetadata('task-1', {});
    expect(result).toBe(false);
  });

  it('updates name only', async () => {
    const storage = new TaskStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    const result = await storage.updateTaskMetadata('task-1', { name: 'New Name' });
    expect(result).toBe(true);
  });

  it('updates all metadata fields', async () => {
    const storage = new TaskStorage();
    const spy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    await storage.updateTaskMetadata('task-1', { name: 'N', type: 'execute', description: 'D' });
    const sql = spy.mock.calls[0]![0] as string;
    expect(sql).toContain('name = ');
    expect(sql).toContain('type = ');
    expect(sql).toContain('description = ');
  });

  it('sets null for empty description', async () => {
    const storage = new TaskStorage();
    const spy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    await storage.updateTaskMetadata('task-1', { description: '' });
    const params = spy.mock.calls[0]![1] as unknown[];
    expect(params[0]).toBeNull();
  });
});

describe('TaskStorage.deleteTask()', () => {
  it('returns true when row deleted', async () => {
    const storage = new TaskStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    expect(await storage.deleteTask('task-1')).toBe(true);
  });

  it('returns false when not found', async () => {
    const storage = new TaskStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(0);
    expect(await storage.deleteTask('missing')).toBe(false);
  });
});

describe('TaskStorage.getTask()', () => {
  it('returns task when found', async () => {
    const storage = new TaskStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(makeRow());
    const task = await storage.getTask('task-1');
    expect(task).not.toBeNull();
    expect(task!.id).toBe('task-1');
    expect(task!.status).toBe('pending');
    expect(task!.securityContext.userId).toBe('user-1');
  });

  it('returns null when not found', async () => {
    const storage = new TaskStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);
    const task = await storage.getTask('missing');
    expect(task).toBeNull();
  });

  it('maps optional row fields to undefined', async () => {
    const storage = new TaskStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(
      makeRow({
        correlation_id: 'c1',
        parent_task_id: 'p1',
        description: 'desc',
        started_at: 2_000_000,
        completed_at: 3_000_000,
        duration_ms: 1_000_000,
        result_json: { success: true },
        resources_json: { tokensUsed: 50 },
      })
    );
    const task = await storage.getTask('task-1');
    expect(task!.correlationId).toBe('c1');
    expect(task!.parentTaskId).toBe('p1');
    expect(task!.description).toBe('desc');
    expect(task!.startedAt).toBe(2_000_000);
    expect(task!.durationMs).toBe(1_000_000);
    expect(task!.result).toEqual({ success: true });
  });

  it('uses default securityContext when missing', async () => {
    const storage = new TaskStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(
      makeRow({
        security_context_json: null,
      })
    );
    const task = await storage.getTask('task-1');
    expect(task!.securityContext.userId).toBe('unknown');
    expect(task!.securityContext.role).toBe('viewer');
  });
});

describe('TaskStorage.listTasks()', () => {
  function setupListMocks(storage: TaskStorage, rows: unknown[] = [makeRow()]) {
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce({ count: String(rows.length) });
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce(rows);
  }

  it('returns all tasks with no filter', async () => {
    const storage = new TaskStorage();
    setupListMocks(storage);
    const result = await storage.listTasks();
    expect(result.tasks).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('applies status filter', async () => {
    const storage = new TaskStorage();
    const querySpy = vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce({ count: '0' });
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    await storage.listTasks({ status: 'completed' });
    const sql = querySpy.mock.calls[0]![0] as string;
    expect(sql).toContain('status = ');
  });

  it('applies type, userId, from, and to filters', async () => {
    const storage = new TaskStorage();
    const querySpy = vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce({ count: '0' });
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    await storage.listTasks({ type: 'execute', userId: 'u1', from: 1000, to: 9999 });
    const sql = querySpy.mock.calls[0]![0] as string;
    expect(sql).toContain('type = ');
    expect(sql).toContain("security_context_json->>'userId'");
    expect(sql).toContain('created_at >= ');
    expect(sql).toContain('created_at <= ');
  });

  it('applies limit and offset', async () => {
    const storage = new TaskStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce({ count: '100' });
    const manySpy = vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    await storage.listTasks({ limit: 10, offset: 20 });
    const sql = manySpy.mock.calls[0]![0] as string;
    expect(sql).toContain('LIMIT ');
    expect(sql).toContain('OFFSET ');
  });

  it('handles null countRow gracefully', async () => {
    const storage = new TaskStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    const result = await storage.listTasks();
    expect(result.total).toBe(0);
  });
});

describe('TaskStorage.getStats()', () => {
  it('returns zero stats when no data', async () => {
    const storage = new TaskStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValue(null);
    vi.spyOn(storage as any, 'queryMany').mockResolvedValue([]);
    const stats = await storage.getStats();
    expect(stats.total).toBe(0);
    expect(stats.successRate).toBe(0);
  });

  it('calculates stats from row data', async () => {
    const storage = new TaskStorage();
    let queryOneCalled = 0;
    vi.spyOn(storage as any, 'queryOne').mockImplementation(() => {
      queryOneCalled++;
      if (queryOneCalled === 1) {
        return {
          total: '10',
          completed: '7',
          failed: '2',
          pending: '1',
          running: '0',
          timeout_count: '0',
          cancelled: '0',
          avg_duration: '1500.5',
        };
      }
      return { count: '3' };
    });
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([
      { type: 'query', count: '5' },
      { type: 'execute', count: '5' },
    ]);

    const stats = await storage.getStats();
    expect(stats.total).toBe(10);
    expect(stats.tasksToday).toBe(3);
    expect(stats.byStatus.completed).toBe(7);
    expect(stats.byStatus.failed).toBe(2);
    expect(stats.byStatus.pending).toBe(1);
    expect(stats.byType.query).toBe(5);
    expect(stats.successRate).toBeCloseTo(7 / 9);
    expect(stats.avgDurationMs).toBeCloseTo(1500.5);
  });

  it('handles null avg_duration', async () => {
    const storage = new TaskStorage();
    let queryOneCalled = 0;
    vi.spyOn(storage as any, 'queryOne').mockImplementation(() => {
      queryOneCalled++;
      if (queryOneCalled === 1) {
        return {
          total: '5',
          completed: '5',
          failed: '0',
          pending: '0',
          running: '0',
          timeout_count: '0',
          cancelled: '0',
          avg_duration: null,
        };
      }
      return { count: '0' };
    });
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    const stats = await storage.getStats();
    expect(stats.avgDurationMs).toBe(0);
  });

  it('counts timeout and cancelled in finishedCount for successRate', async () => {
    const storage = new TaskStorage();
    let queryOneCalled = 0;
    vi.spyOn(storage as any, 'queryOne').mockImplementation(() => {
      queryOneCalled++;
      if (queryOneCalled === 1) {
        return {
          total: '10',
          completed: '4',
          failed: '2',
          pending: '0',
          running: '0',
          timeout_count: '2',
          cancelled: '2',
          avg_duration: '500',
        };
      }
      return { count: '0' };
    });
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    const stats = await storage.getStats();
    expect(stats.byStatus.timeout).toBe(2);
    expect(stats.byStatus.cancelled).toBe(2);
    expect(stats.successRate).toBeCloseTo(4 / 10);
  });
});
