/**
 * Voice Announcements — TTS notifications for workflow/job completions.
 *
 * Listens to AlertManager-style metric events and triggers TTS announcements
 * for personalities that have voice announcements enabled. Particularly valuable
 * for the Tauri desktop client where the user may be working in another window.
 */

import type { SecureLogger } from '../logging/logger.js';

export type VoiceAnnouncementEvent = 'workflow_complete' | 'job_complete' | 'eval_complete';

export const ALL_ANNOUNCEMENT_EVENTS: VoiceAnnouncementEvent[] = [
  'workflow_complete',
  'job_complete',
  'eval_complete',
];

export interface VoiceAnnouncementConfig {
  enabled: boolean;
  events: VoiceAnnouncementEvent[];
}

export interface VoiceAnnouncementDeps {
  logger: SecureLogger;
  synthesizeSpeech: (
    text: string,
    voice?: string
  ) => Promise<{ audioBase64: string; format: string }>;
  getPersonalityVoiceConfig: (personalityId: string) => Promise<{
    voiceAnnouncements?: boolean;
    voiceAnnouncementEvents?: string[];
    voice?: string;
    pollyVoiceId?: string;
  } | null>;
  broadcastAudio?: (personalityId: string, audioBase64: string, format: string) => void;
}

// Templates for announcement text
const ANNOUNCEMENT_TEMPLATES: Record<
  VoiceAnnouncementEvent,
  (details: Record<string, string>) => string
> = {
  workflow_complete: (d) =>
    `Workflow ${d.name ?? 'task'} has completed${d.status === 'failed' ? ' with errors' : ' successfully'}.`,
  job_complete: (d) =>
    `${d.type ?? 'Job'} ${d.name ?? ''} has finished${d.status === 'failed' ? ' with errors' : ''}.`,
  eval_complete: (d) =>
    `Evaluation run ${d.name ?? ''} is complete. ${d.score ? `Score: ${d.score}` : ''}`.trim() +
    '.',
};

export class VoiceAnnouncementManager {
  private readonly deps: VoiceAnnouncementDeps;
  private readonly pending = new Set<string>();
  private readonly MAX_PENDING = 5;

  constructor(deps: VoiceAnnouncementDeps) {
    this.deps = deps;
  }

  /**
   * Handle a completion event. Checks if the personality has announcements enabled
   * for this event type, then synthesizes and broadcasts the audio.
   *
   * Fire-and-forget — errors are logged, never thrown.
   */
  async announce(
    personalityId: string,
    event: VoiceAnnouncementEvent,
    details: Record<string, string> = {}
  ): Promise<void> {
    const key = `${personalityId}:${event}`;
    if (this.pending.has(key)) return;
    if (this.pending.size >= this.MAX_PENDING) {
      this.deps.logger.debug('Voice announcement queue full, skipping');
      return;
    }
    this.pending.add(key);

    try {
      const config = await this.deps.getPersonalityVoiceConfig(personalityId);
      if (!config?.voiceAnnouncements) return;

      const allowedEvents = config.voiceAnnouncementEvents ?? ALL_ANNOUNCEMENT_EVENTS;
      if (!allowedEvents.includes(event)) return;

      const template = ANNOUNCEMENT_TEMPLATES[event];
      if (!template) return;

      const text = template(details);
      const voice = config.pollyVoiceId ?? config.voice;

      const { audioBase64, format } = await this.deps.synthesizeSpeech(text, voice);
      this.deps.broadcastAudio?.(personalityId, audioBase64, format);
      this.deps.logger.debug('Voice announcement sent', { personalityId, event });
    } catch (error) {
      this.deps.logger.warn('Voice announcement failed', {
        error: error instanceof Error ? error.message : String(error),
        personalityId,
        event,
      });
    } finally {
      this.pending.delete(key);
    }
  }
}
