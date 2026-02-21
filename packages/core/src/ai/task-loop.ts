/**
 * TaskLoop — Self-repairing agent task loop with stuck-task detection.
 *
 * The current retry path in RetryManager retries identical context after a
 * failure — the model receives the same input and tends to reproduce the same
 * failure. This adds a stuck-task detection layer:
 *
 *   • Timeout detection — task has exceeded a configurable time threshold.
 *   • Repetition detection — the same tool call (name + args) was issued
 *     twice in a row, indicating the model is looping.
 *
 * When either condition is met, `buildRecoveryPrompt()` generates a
 * diagnostic message that is injected into the agent's context before the
 * next LLM call. The model receives elapsed time, the last tool used, and
 * its outcome — giving it the information needed to try a different path.
 *
 * ADR 098 — Self-Repairing Task Loop
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolCallRecord {
  toolName: string;
  /** JSON-serialised arguments. */
  toolArgs: string;
  /** Brief outcome description: 'ok', 'error: …', 'timeout', etc. */
  outcome: string;
  /** Unix timestamp (ms) when the call was made. */
  calledAt: number;
}

export interface StuckReason {
  type: 'timeout' | 'repetition';
  /** Human-readable explanation. */
  detail: string;
}

export interface TaskLoopOptions {
  /**
   * Milliseconds before a task is considered stuck.
   * Default: 30 000 (30 seconds).
   */
  timeoutMs?: number;
  /**
   * How many consecutive identical tool calls trigger repetition detection.
   * Default: 2.
   */
  repetitionThreshold?: number;
}

// ── TaskLoop ──────────────────────────────────────────────────────────────────

/**
 * Stateful per-task loop guard.
 *
 * Create one instance per agent task session. Call `recordToolCall()` after
 * each tool invocation, then call `checkStuck()` before the next LLM call to
 * determine whether a recovery prompt should be injected.
 */
export class TaskLoop {
  private readonly timeoutMs: number;
  private readonly repetitionThreshold: number;
  private readonly history: ToolCallRecord[] = [];
  private startedAt: number;

  constructor(options: TaskLoopOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.repetitionThreshold = options.repetitionThreshold ?? 2;
    this.startedAt = Date.now();
  }

  /** Record a completed tool call. */
  recordToolCall(toolName: string, toolArgs: unknown, outcome: string): void {
    const serialised =
      typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs ?? null);
    this.history.push({
      toolName,
      toolArgs: serialised,
      outcome,
      calledAt: Date.now(),
    });
  }

  /**
   * Check whether the task is currently stuck.
   * Returns `null` when the task is progressing normally.
   */
  checkStuck(): StuckReason | null {
    const elapsed = Date.now() - this.startedAt;

    // Timeout check
    if (elapsed >= this.timeoutMs) {
      const last = this.history[this.history.length - 1];
      return {
        type: 'timeout',
        detail:
          `Task has been running for ${elapsed}ms ` +
          (last
            ? `(last tool: ${last.toolName} → ${last.outcome})`
            : '(no tool calls recorded)'),
      };
    }

    // Repetition check — look at the tail of the history
    if (this.history.length >= this.repetitionThreshold) {
      const tail = this.history.slice(-this.repetitionThreshold);
      const allSame = tail.every(
        (r) => r.toolName === tail[0]!.toolName && r.toolArgs === tail[0]!.toolArgs
      );
      if (allSame) {
        return {
          type: 'repetition',
          detail:
            `Tool "${tail[0]!.toolName}" was called ${this.repetitionThreshold} consecutive ` +
            `times with identical arguments. Last outcome: ${tail[tail.length - 1]!.outcome}`,
        };
      }
    }

    return null;
  }

  /**
   * Build a diagnostic recovery prompt to inject into the LLM context.
   *
   * The returned string is intended to be added as a `user` turn (or appended
   * to the system prompt) before the next LLM call when `checkStuck()` returns
   * a non-null reason.
   */
  buildRecoveryPrompt(reason: StuckReason): string {
    const elapsed = Date.now() - this.startedAt;
    const last = this.history[this.history.length - 1];

    const lastToolLine = last
      ? `Last tool: ${last.toolName} → ${last.outcome}`
      : 'No tool calls have been recorded yet.';

    if (reason.type === 'timeout') {
      return (
        `Your previous attempt stalled after ${elapsed}ms. ` +
        `${lastToolLine}. ` +
        `Try a different approach or decompose the problem into smaller steps.`
      );
    }

    // repetition
    return (
      `Your previous attempt is looping: ${reason.detail}. ` +
      `${lastToolLine}. ` +
      `Try a different approach, use a different tool, or decompose the problem.`
    );
  }

  /** Number of tool calls recorded so far. */
  get callCount(): number {
    return this.history.length;
  }

  /** Elapsed milliseconds since the task loop was created. */
  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  /** Full tool call history (copy). */
  getHistory(): ToolCallRecord[] {
    return [...this.history];
  }

  /** Reset the loop state (history and start time) for task re-use. */
  reset(): void {
    this.history.length = 0;
    this.startedAt = Date.now();
  }
}

// ── Convenience factory ───────────────────────────────────────────────────────

export function createTaskLoop(options?: TaskLoopOptions): TaskLoop {
  return new TaskLoop(options);
}
