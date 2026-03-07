import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceAnnouncementManager } from './voice-announcements.js';
import type { VoiceAnnouncementDeps } from './voice-announcements.js';

function createMockDeps(overrides: Partial<VoiceAnnouncementDeps> = {}): VoiceAnnouncementDeps {
  return {
    logger: {
      debug: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as VoiceAnnouncementDeps['logger'],
    synthesizeSpeech: vi.fn().mockResolvedValue({ audioBase64: 'dGVzdA==', format: 'mp3' }),
    getPersonalityVoiceConfig: vi.fn().mockResolvedValue({
      voiceAnnouncements: true,
      voiceAnnouncementEvents: ['workflow_complete', 'job_complete', 'eval_complete'],
      voice: 'alloy',
    }),
    broadcastAudio: vi.fn(),
    ...overrides,
  };
}

describe('VoiceAnnouncementManager', () => {
  let deps: VoiceAnnouncementDeps;
  let manager: VoiceAnnouncementManager;

  beforeEach(() => {
    deps = createMockDeps();
    manager = new VoiceAnnouncementManager(deps);
  });

  it('should announce workflow completion', async () => {
    await manager.announce('p1', 'workflow_complete', { name: 'Deploy' });

    expect(deps.synthesizeSpeech).toHaveBeenCalledWith(
      'Workflow Deploy has completed successfully.',
      'alloy'
    );
    expect(deps.broadcastAudio).toHaveBeenCalledWith('p1', 'dGVzdA==', 'mp3');
  });

  it('should announce job completion', async () => {
    await manager.announce('p1', 'job_complete', { name: 'finetune-1', type: 'Finetune' });

    expect(deps.synthesizeSpeech).toHaveBeenCalledWith(
      'Finetune finetune-1 has finished.',
      'alloy'
    );
  });

  it('should announce eval completion with score', async () => {
    await manager.announce('p1', 'eval_complete', { name: 'eval-42', score: '0.95' });

    expect(deps.synthesizeSpeech).toHaveBeenCalledWith(
      'Evaluation run eval-42 is complete. Score: 0.95.',
      'alloy'
    );
  });

  it('should include failure status in workflow announcement', async () => {
    await manager.announce('p1', 'workflow_complete', {
      name: 'Build',
      status: 'failed',
    });

    expect(deps.synthesizeSpeech).toHaveBeenCalledWith(
      'Workflow Build has completed with errors.',
      'alloy'
    );
  });

  it('should skip when voiceAnnouncements is disabled', async () => {
    (deps.getPersonalityVoiceConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      voiceAnnouncements: false,
    });

    await manager.announce('p1', 'workflow_complete');

    expect(deps.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it('should skip when personality config is null', async () => {
    (deps.getPersonalityVoiceConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await manager.announce('p1', 'workflow_complete');

    expect(deps.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it('should skip events not in allowed list', async () => {
    (deps.getPersonalityVoiceConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      voiceAnnouncements: true,
      voiceAnnouncementEvents: ['workflow_complete'],
    });

    await manager.announce('p1', 'job_complete');

    expect(deps.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it('should use pollyVoiceId when set', async () => {
    (deps.getPersonalityVoiceConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      voiceAnnouncements: true,
      voiceAnnouncementEvents: ['workflow_complete'],
      pollyVoiceId: 'Joanna',
      voice: 'alloy',
    });

    await manager.announce('p1', 'workflow_complete', { name: 'Test' });

    expect(deps.synthesizeSpeech).toHaveBeenCalledWith(expect.any(String), 'Joanna');
  });

  it('should not crash on synthesizeSpeech error', async () => {
    (deps.synthesizeSpeech as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('TTS failed'));

    await manager.announce('p1', 'workflow_complete', { name: 'Test' });

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TTS failed' }),
      'Voice announcement failed'
    );
  });

  it('should deduplicate concurrent announcements for same personality+event', async () => {
    const resolvers: (() => void)[] = [];
    const slowSynthesize = vi.fn().mockImplementation(
      () =>
        new Promise<{ audioBase64: string; format: string }>((resolve) => {
          resolvers.push(() => resolve({ audioBase64: 'dGVzdA==', format: 'mp3' }));
        })
    );
    deps = createMockDeps({ synthesizeSpeech: slowSynthesize });
    manager = new VoiceAnnouncementManager(deps);

    const p1 = manager.announce('p1', 'workflow_complete');
    // Allow the first announce to reach the pending set before firing second
    await new Promise((r) => setTimeout(r, 10));
    const p2 = manager.announce('p1', 'workflow_complete');

    // Resolve the first
    resolvers.forEach((r) => r());
    await Promise.all([p1, p2]);

    // Only one call to synthesizeSpeech because the second was deduped
    expect(slowSynthesize).toHaveBeenCalledTimes(1);
  });

  it('should limit pending announcements', async () => {
    const resolvers: (() => void)[] = [];
    const slowSynthesize = vi.fn().mockImplementation(
      () =>
        new Promise<{ audioBase64: string; format: string }>((resolve) => {
          resolvers.push(() => resolve({ audioBase64: 'dGVzdA==', format: 'mp3' }));
        })
    );
    deps = createMockDeps({ synthesizeSpeech: slowSynthesize });
    manager = new VoiceAnnouncementManager(deps);

    // Fire 6 unique announcements (MAX_PENDING = 5)
    const promises = [];
    for (let i = 0; i < 6; i++) {
      promises.push(manager.announce(`p${i}`, 'workflow_complete'));
    }

    // Let all announces start before resolving
    await new Promise((r) => setTimeout(r, 20));
    resolvers.forEach((r) => r());
    await Promise.all(promises);

    // The 6th should have been skipped (max 5 pending)
    expect(slowSynthesize).toHaveBeenCalledTimes(5);
  });

  it('should use all events by default when voiceAnnouncementEvents is empty', async () => {
    (deps.getPersonalityVoiceConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      voiceAnnouncements: true,
      voiceAnnouncementEvents: undefined,
    });

    await manager.announce('p1', 'eval_complete', { name: 'test' });

    expect(deps.synthesizeSpeech).toHaveBeenCalled();
  });
});
