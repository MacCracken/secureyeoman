/**
 * Job Completion Events — unit tests.
 *
 * Verifies that emitJobCompletion() builds correct synthetic snapshots
 * and passes them to alertManager.evaluate().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emitJobCompletion } from './job-completion-events.js';
import type { JobCompletionEvent } from './job-completion-events.js';

function makeAlertManager() {
  return {
    evaluate: vi.fn().mockResolvedValue(undefined),
  };
}

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

describe('emitJobCompletion', () => {
  let alertManager: ReturnType<typeof makeAlertManager>;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    alertManager = makeAlertManager();
    logger = makeLogger();
  });

  it('does nothing when alertManager is null', () => {
    emitJobCompletion(null, {
      jobType: 'workflow',
      status: 'completed',
      jobId: 'j1',
    });
    // No error thrown, no call
  });

  it('does nothing when alertManager is undefined', () => {
    emitJobCompletion(undefined, {
      jobType: 'workflow',
      status: 'completed',
      jobId: 'j1',
    });
    // No error thrown
  });

  it('builds correct snapshot for workflow completion', () => {
    const event: JobCompletionEvent = {
      jobType: 'workflow',
      status: 'completed',
      jobId: 'wf-run-1',
      jobName: 'My Workflow',
      durationMs: 5000,
    };

    emitJobCompletion(alertManager as any, event, logger as any);

    expect(alertManager.evaluate).toHaveBeenCalledWith({
      jobs: {
        workflow: {
          completed: {
            durationMs: 5000,
          },
        },
      },
    });
  });

  it('includes error sentinel on failed jobs', () => {
    const event: JobCompletionEvent = {
      jobType: 'workflow',
      status: 'failed',
      jobId: 'wf-run-2',
    };

    emitJobCompletion(alertManager as any, event, logger as any);

    expect(alertManager.evaluate).toHaveBeenCalledWith({
      jobs: {
        workflow: {
          failed: {
            error: 1,
          },
        },
      },
    });
  });

  it('includes custom metrics in snapshot', () => {
    const event: JobCompletionEvent = {
      jobType: 'distillation',
      status: 'completed',
      jobId: 'dist-1',
      metrics: { samplesGenerated: 200, counterfactualCount: 10 },
    };

    emitJobCompletion(alertManager as any, event, logger as any);

    expect(alertManager.evaluate).toHaveBeenCalledWith({
      jobs: {
        distillation: {
          completed: {
            samplesGenerated: 200,
            counterfactualCount: 10,
          },
        },
      },
    });
  });

  it('merges durationMs with custom metrics', () => {
    const event: JobCompletionEvent = {
      jobType: 'evaluation',
      status: 'completed',
      jobId: 'eval-1',
      durationMs: 12000,
      metrics: { exactMatch: 0.85 },
    };

    emitJobCompletion(alertManager as any, event, logger as any);

    expect(alertManager.evaluate).toHaveBeenCalledWith({
      jobs: {
        evaluation: {
          completed: {
            durationMs: 12000,
            exactMatch: 0.85,
          },
        },
      },
    });
  });

  it('handles finetune failed events', () => {
    const event: JobCompletionEvent = {
      jobType: 'finetune',
      status: 'failed',
      jobId: 'ft-1',
      durationMs: 3000,
    };

    emitJobCompletion(alertManager as any, event, logger as any);

    expect(alertManager.evaluate).toHaveBeenCalledWith({
      jobs: {
        finetune: {
          failed: {
            durationMs: 3000,
            error: 1,
          },
        },
      },
    });
  });

  it('logs error when evaluate rejects', async () => {
    alertManager.evaluate.mockRejectedValue(new Error('DB down'));

    emitJobCompletion(
      alertManager as any,
      {
        jobType: 'workflow',
        status: 'completed',
        jobId: 'wf-1',
      },
      logger as any
    );

    // Wait for the promise to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'workflow',
        jobId: 'wf-1',
      }),
      'Job completion alert evaluation failed'
    );
  });

  it('does not throw when evaluate rejects and no logger provided', async () => {
    alertManager.evaluate.mockRejectedValue(new Error('DB down'));

    // Should not throw
    emitJobCompletion(alertManager as any, {
      jobType: 'workflow',
      status: 'completed',
      jobId: 'wf-1',
    });

    await new Promise((r) => setTimeout(r, 10));
  });

  it('omits durationMs from snapshot when not provided', () => {
    emitJobCompletion(alertManager as any, {
      jobType: 'distillation',
      status: 'completed',
      jobId: 'd-1',
      metrics: { samplesGenerated: 100 },
    });

    const snapshot = alertManager.evaluate.mock.calls[0][0];
    expect(snapshot.jobs.distillation.completed).not.toHaveProperty('durationMs');
    expect(snapshot.jobs.distillation.completed.samplesGenerated).toBe(100);
  });
});
