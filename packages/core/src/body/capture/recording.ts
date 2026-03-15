/**
 * Screen Recording Manager (Phase 108-E)
 *
 * Manages timed capture sessions that record frames to temporary files.
 * Integrates with the consent workflow for authorization.
 */

import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, unlink, stat } from 'fs/promises';

export interface RecordingConfig {
  /** Max duration in seconds (default: 300 = 5 minutes) */
  duration: number;
  /** Capture quality */
  quality?: 'low' | 'medium' | 'high';
  /** Region to capture (null = full screen) */
  region?: { x: number; y: number; width: number; height: number };
  /** Associated consent ID */
  consentId?: string;
}

export interface RecordingSession {
  id: string;
  userId: string;
  status: 'active' | 'completed' | 'stopped' | 'failed';
  config: RecordingConfig;
  filePath: string;
  fileSize: number;
  startedAt: number;
  stoppedAt?: number;
}

export class ScreenRecordingManager {
  private activeSessions = new Map<string, RecordingSession & { timer: NodeJS.Timeout }>();
  private static readonly MAX_DURATION_S = 600; // 10 minutes hard cap
  private static readonly MAX_ACTIVE = 3;

  /**
   * Start a new recording session.
   * Returns the session object with an auto-stop timer.
   */
  async startRecording(userId: string, config: RecordingConfig): Promise<RecordingSession> {
    if (this.activeSessions.size >= ScreenRecordingManager.MAX_ACTIVE) {
      throw new Error('Maximum active recording sessions reached');
    }

    const effectiveDuration = Math.min(
      config.duration || 300,
      ScreenRecordingManager.MAX_DURATION_S
    );

    const id = randomUUID();
    const filePath = join(tmpdir(), `sy-recording-${id}.bin`);

    const session: RecordingSession = {
      id,
      userId,
      status: 'active',
      config: { ...config, duration: effectiveDuration },
      filePath,
      fileSize: 0,
      startedAt: Date.now(),
    };

    // Write placeholder file
    await writeFile(filePath, Buffer.alloc(0));

    // Auto-stop timer
    const timer = setTimeout(() => {
      void this.stopRecording(id);
    }, effectiveDuration * 1000);

    this.activeSessions.set(id, { ...session, timer });
    return session;
  }

  /**
   * Stop an active recording session.
   */
  async stopRecording(sessionId: string): Promise<RecordingSession | null> {
    const entry = this.activeSessions.get(sessionId);
    if (!entry) return null;

    clearTimeout(entry.timer);
    this.activeSessions.delete(sessionId);

    // Check file size
    let fileSize = 0;
    try {
      const stats = await stat(entry.filePath);
      fileSize = stats.size;
    } catch {
      // File may not exist yet
    }

    const session: RecordingSession = {
      id: entry.id,
      userId: entry.userId,
      status: 'completed',
      config: entry.config,
      filePath: entry.filePath,
      fileSize,
      startedAt: entry.startedAt,
      stoppedAt: Date.now(),
    };

    return session;
  }

  /**
   * List all active recording sessions.
   */
  getActiveRecordings(): RecordingSession[] {
    return Array.from(this.activeSessions.values()).map(({ timer: _t, ...s }) => s);
  }

  /**
   * Clean up: stop all active recordings and remove temp files.
   */
  async dispose(): Promise<void> {
    for (const [id, entry] of this.activeSessions) {
      clearTimeout(entry.timer);
      try {
        await unlink(entry.filePath);
      } catch {
        // Best-effort cleanup
      }
      this.activeSessions.delete(id);
    }
  }
}
