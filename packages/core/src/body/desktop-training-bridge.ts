/**
 * Desktop-to-Training Bridge (Phase 108-C)
 *
 * Records desktop interactions as RL episodes for the computer use training pipeline.
 * Fire-and-forget: errors are logged but never block route responses.
 */

import type { ComputerUseManager } from '../training/computer-use-manager.js';

export interface DesktopTrainingBridgeDeps {
  getComputerUseManager: () => ComputerUseManager | null;
}

export interface RecordActionParams {
  sessionId: string;
  actionType: string;
  actionTarget: string;
  actionValue: string;
  stateEncoding?: Record<string, unknown>;
  skillName?: string;
}

export class DesktopTrainingBridge {
  private readonly getComputerUseManager: () => ComputerUseManager | null;

  constructor(deps: DesktopTrainingBridgeDeps) {
    this.getComputerUseManager = deps.getComputerUseManager;
  }

  /**
   * Record a desktop action as an RL episode.
   * Reward defaults to 0 (assigned later by RL pipeline), done defaults to false.
   */
  async recordAction(params: RecordActionParams): Promise<void> {
    const manager = this.getComputerUseManager();
    if (!manager) return;

    try {
      await manager.recordEpisode({
        sessionId: params.sessionId,
        skillName: params.skillName ?? 'desktop_control',
        stateEncoding: params.stateEncoding ?? {},
        actionType: params.actionType,
        actionTarget: params.actionTarget,
        actionValue: params.actionValue,
        reward: 0,
        done: false,
      });
    } catch {
      // Fire-and-forget: never block the route
    }
  }
}
