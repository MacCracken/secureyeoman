/**
 * Periodic Cleanup Timer — shared lifecycle helper for security modules
 * that need a recurring cleanup/eviction interval.
 *
 * Encapsulates the setInterval/clearInterval/unref boilerplate so each
 * module only provides the cleanup callback and interval.
 */

export class PeriodicCleanup {
  private timer: NodeJS.Timeout | null = null;

  /** Start the cleanup timer. Safe to call multiple times (restarts). */
  start(callback: () => void, intervalMs: number): void {
    this.stop();
    this.timer = setInterval(callback, intervalMs);
    this.timer.unref();
  }

  /** Stop the cleanup timer. Safe to call when already stopped. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
