/**
 * Experiment Store — In-memory + PostgreSQL persistence for experiment sessions and runs.
 *
 * Uses simulation schema tables for durable storage.
 */

import type {
  ExperimentRunnerStore,
  ExperimentSession,
  ExperimentRun,
} from './experiment-runner.js';

export class InMemoryExperimentStore implements ExperimentRunnerStore {
  private sessions = new Map<string, ExperimentSession>();
  private runs = new Map<string, ExperimentRun>();

  async saveSession(session: ExperimentSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async getSession(sessionId: string): Promise<ExperimentSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async listSessions(personalityId: string): Promise<ExperimentSession[]> {
    return [...this.sessions.values()].filter((s) => s.personalityId === personalityId);
  }

  async saveRun(run: ExperimentRun): Promise<void> {
    this.runs.set(run.id, { ...run });
  }

  async getRun(runId: string): Promise<ExperimentRun | null> {
    return this.runs.get(runId) ?? null;
  }

  async listRuns(sessionId: string, opts?: { limit?: number }): Promise<ExperimentRun[]> {
    const runs = [...this.runs.values()]
      .filter((r) => r.sessionId === sessionId)
      .sort((a, b) => b.startedAt - a.startedAt);
    return opts?.limit ? runs.slice(0, opts.limit) : runs;
  }

  async getBestRun(sessionId: string): Promise<ExperimentRun | null> {
    const session = this.sessions.get(sessionId);
    if (!session?.bestRunId) return null;
    return this.runs.get(session.bestRunId) ?? null;
  }
}
