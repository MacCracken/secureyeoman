/**
 * HeartManager — Wraps HeartbeatManager and owns the Heart subsection
 * of the Body prompt.
 *
 * The Heart represents the agent's pulse — the vital rhythms and
 * self-check results that sustain its awareness of its own health.
 */

import type { HeartbeatManager } from './heartbeat.js';

function formatInterval(ms: number): string {
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

export class HeartManager {
  private readonly heartbeat: HeartbeatManager;

  constructor(heartbeat: HeartbeatManager) {
    this.heartbeat = heartbeat;
  }

  /**
   * Compose the ### Heart subsection for the Body prompt.
   */
  composeHeartPrompt(): string {
    const status = this.heartbeat.getStatus();
    const lastBeat = status.lastBeat;
    if (!lastBeat) return '';

    const lines: string[] = [
      '### Heart',
      'Your Heart is your pulse — the vital rhythms that sustain you.',
      '',
      `Heartbeat #${status.beatCount} at ${new Date(lastBeat.timestamp).toISOString()} (${lastBeat.durationMs}ms):`,
    ];

    for (const check of lastBeat.checks) {
      const tag = check.status === 'ok' ? 'ok' : check.status === 'warning' ? 'WARN' : 'ERR';
      lines.push(`- ${check.name}: [${tag}] ${check.message}`);
    }

    if (status.tasks && status.tasks.length > 0) {
      lines.push('');
      lines.push('Task schedule:');
      const now = Date.now();
      for (const task of status.tasks) {
        const freq = formatInterval(task.intervalMs);
        const lastRun = task.lastRunAt
          ? `${Math.round((now - task.lastRunAt) / 1000)}s ago`
          : 'never';
        const enabledTag = task.enabled ? '' : ' [disabled]';
        lines.push(`- ${task.name}: every ${freq}, last run: ${lastRun}${enabledTag}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Delegate to the underlying HeartbeatManager.
   */
  getHeartbeat(): HeartbeatManager {
    return this.heartbeat;
  }

  start(): void {
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  getStatus() {
    return this.heartbeat.getStatus();
  }
}
