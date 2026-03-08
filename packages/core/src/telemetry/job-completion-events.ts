/**
 * Job Completion Events — bridges discrete job completions into the alert pipeline.
 *
 * When a workflow, distillation, fine-tune, or evaluation job completes/fails,
 * `emitJobCompletion()` builds a synthetic MetricsSnapshot and passes it to
 * `alertManager.evaluate()`. This reuses the existing `resolvePath()` +
 * `compareOperator()` infrastructure — no changes to the evaluation loop.
 *
 * Metric paths follow `jobs.<type>.<status>.<field>`, e.g.:
 *   - `jobs.workflow.completed.durationMs`
 *   - `jobs.workflow.failed.error` (sentinel = 1)
 *   - `jobs.distillation.completed.samplesGenerated`
 */

import type { AlertManager } from './alert-manager.js';
import type { SecureLogger } from '../logging/logger.js';

export type JobType = 'workflow' | 'distillation' | 'finetune' | 'evaluation';
export type JobStatus = 'completed' | 'failed';

export interface JobCompletionEvent {
  jobType: JobType;
  status: JobStatus;
  jobId: string;
  jobName?: string;
  durationMs?: number;
  metrics?: Record<string, number>;
}

/**
 * Emit a job completion event as a synthetic snapshot through the alert pipeline.
 * Fire-and-forget — errors are logged but never thrown to the caller.
 */
export function emitJobCompletion(
  alertManager: AlertManager | null | undefined,
  event: JobCompletionEvent,
  logger?: SecureLogger | null
): void {
  if (!alertManager) return;

  const statusPayload: Record<string, number> = {};

  if (event.durationMs !== undefined) {
    statusPayload.durationMs = event.durationMs;
  }

  if (event.status === 'failed') {
    statusPayload.error = 1;
  }

  if (event.metrics) {
    Object.assign(statusPayload, event.metrics);
  }

  const snapshot = {
    jobs: {
      [event.jobType]: {
        [event.status]: statusPayload,
      },
    },
  };

  alertManager.evaluate(snapshot).catch((err: unknown) => {
    logger?.error(
      {
        jobType: event.jobType,
        jobId: event.jobId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Job completion alert evaluation failed'
    );
  });
}
