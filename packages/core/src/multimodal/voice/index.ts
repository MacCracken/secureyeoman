/**
 * Voice Profiles Module — Barrel exports
 */

export { VoiceProfileStore } from './voice-profile-store.js';
export type { VoiceProfileCreate, VoiceProfileUpdate } from './voice-profile-store.js';
export { VoicePromptCache } from './voice-cache.js';
export type { VoiceCacheOptions } from './voice-cache.js';
export { registerVoiceProfileRoutes } from './voice-profile-routes.js';
export type { VoiceProfileRoutesOptions } from './voice-profile-routes.js';
export { registerVoiceStreamRoutes } from './voice-stream-routes.js';
export type { VoiceStreamRoutesOptions } from './voice-stream-routes.js';
export { VoiceAgentSession } from './voice-agent.js';
export type { VoiceAgentConfig, VoiceAgentEvents } from './voice-agent.js';
