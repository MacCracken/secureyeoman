import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 0 }),
}));

import { ScreenRecordingManager, type RecordingConfig } from './recording.js';
import { stat } from 'fs/promises';

describe('ScreenRecordingManager', () => {
  let manager: ScreenRecordingManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ScreenRecordingManager();
  });

  afterEach(async () => {
    await manager.dispose();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const defaultConfig: RecordingConfig = { duration: 60 };

  it('startRecording creates a session with active status', async () => {
    const session = await manager.startRecording('user-1', defaultConfig);

    expect(session.id).toBeDefined();
    expect(session.userId).toBe('user-1');
    expect(session.status).toBe('active');
    expect(session.config.duration).toBe(60);
    expect(session.filePath).toContain('sy-recording-');
    expect(session.fileSize).toBe(0);
    expect(session.startedAt).toBeGreaterThan(0);
    expect(session.stoppedAt).toBeUndefined();
  });

  it('stopRecording returns completed session', async () => {
    vi.mocked(stat).mockResolvedValueOnce({ size: 1024 } as any);

    const session = await manager.startRecording('user-1', defaultConfig);
    const stopped = await manager.stopRecording(session.id);

    expect(stopped).not.toBeNull();
    expect(stopped!.id).toBe(session.id);
    expect(stopped!.status).toBe('completed');
    expect(stopped!.fileSize).toBe(1024);
    expect(stopped!.stoppedAt).toBeGreaterThan(0);
  });

  it('stopRecording returns null for unknown session', async () => {
    const result = await manager.stopRecording('nonexistent-id');
    expect(result).toBeNull();
  });

  it('getActiveRecordings lists active sessions', async () => {
    expect(manager.getActiveRecordings()).toHaveLength(0);

    await manager.startRecording('user-1', defaultConfig);
    await manager.startRecording('user-2', defaultConfig);

    const active = manager.getActiveRecordings();
    expect(active).toHaveLength(2);
    expect(active[0].status).toBe('active');
    expect(active[1].status).toBe('active');
    expect(active.map((s) => s.userId).sort()).toEqual(['user-1', 'user-2']);
  });

  it('throws when max active sessions limit (3) is reached', async () => {
    await manager.startRecording('user-1', defaultConfig);
    await manager.startRecording('user-2', defaultConfig);
    await manager.startRecording('user-3', defaultConfig);

    await expect(manager.startRecording('user-4', defaultConfig)).rejects.toThrow(
      'Maximum active recording sessions reached'
    );

    expect(manager.getActiveRecordings()).toHaveLength(3);
  });

  it('caps duration at MAX_DURATION_S (600s)', async () => {
    const session = await manager.startRecording('user-1', {
      duration: 9999,
    });

    expect(session.config.duration).toBe(600);
  });

  it('dispose cleans up all sessions', async () => {
    await manager.startRecording('user-1', defaultConfig);
    await manager.startRecording('user-2', defaultConfig);
    expect(manager.getActiveRecordings()).toHaveLength(2);

    await manager.dispose();

    expect(manager.getActiveRecordings()).toHaveLength(0);
  });
});
