/**
 * Multimodal I/O Module (Phase 7.3) — Barrel exports
 */

export { MultimodalManager } from './manager.js';
export { MultimodalStorage } from './storage.js';
export { registerMultimodalRoutes } from './multimodal-routes.js';
export { VoiceAnnouncementManager } from './voice-announcements.js';
export type { VoiceAnnouncementEvent, VoiceAnnouncementConfig } from './voice-announcements.js';
export { VoiceProfileStore, VoicePromptCache, registerVoiceProfileRoutes } from './voice/index.js';
export type {
  VoiceProfileCreate,
  VoiceProfileUpdate,
  VoiceCacheOptions,
  VoiceProfileRoutesOptions,
} from './voice/index.js';
export { synthesizeOrpheus, isOrpheusAvailable, ORPHEUS_EMOTION_MARKERS } from './tts/orpheus.js';
export { synthesizePiper, isPiperAvailable } from './tts/piper.js';
export {
  transcribeFasterWhisper,
  isFasterWhisperAvailable,
  FASTER_WHISPER_MODELS,
} from './stt/faster-whisper.js';
export type { FasterWhisperModel } from './stt/faster-whisper.js';
