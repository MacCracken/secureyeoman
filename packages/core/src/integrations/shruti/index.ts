export { ShrutiClient } from './shruti-client.js';
export type {
  ShrutiClientConfig,
  ShrutiHealthResponse,
  ShrutiSessionInfo,
  ShrutiTrack,
  ShrutiAnalysisResult,
  ShrutiAutoMixSuggestion,
  ShrutiCompositionSuggestion,
  ShrutiApiResult,
} from './shruti-client.js';

export { parseVoiceInput } from './voice-intent-parser.js';
export type {
  VoiceIntent,
  VoiceAction,
  TransportCommand,
  SeekTarget,
  TrackCommand,
  MixCommand,
  TempoCommand,
  AnalyzeCommand,
} from './voice-intent-parser.js';

export { ShrutiVoiceBridge } from './shruti-voice-bridge.js';
export type { ShrutiVoiceBridgeConfig, VoiceBridgeResult } from './shruti-voice-bridge.js';

export { registerShrutiVoiceRoutes } from './shruti-voice-routes.js';
export type { ShrutiVoiceRouteDeps } from './shruti-voice-routes.js';
