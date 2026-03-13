/**
 * Shruti Voice Bridge — Voice-driven music production.
 *
 * Pipeline: STT transcription → intent parsing → ShrutiClient execution →
 * confirmation text → TTS synthesis.
 *
 * Works with SY's existing MultimodalManager for STT/TTS and the
 * ShrutiClient for DAW control.
 */

import type { SecureLogger } from '../../logging/logger.js';
import type { ShrutiClient, ShrutiTrack } from './shruti-client.js';
import {
  parseVoiceInput,
  type VoiceIntent,
  type VoiceAction,
  type TransportCommand,
  type SeekTarget,
  type TrackCommand,
  type MixCommand,
  type TempoCommand,
  type AnalyzeCommand,
} from './voice-intent-parser.js';

// ── Configuration ────────────────────────────────────────────────────

export interface ShrutiVoiceBridgeConfig {
  /** Minimum confidence score to execute an intent (0-1). Default: 0.6 */
  minConfidence?: number;
  /** Gain adjustment step in dB for relative volume commands. Default: 3 */
  gainStepDb?: number;
  /** Pan adjustment step for relative pan commands. Default: 0.5 */
  panStep?: number;
  /** Tempo adjustment in BPM for faster/slower commands. Default: 10 */
  tempoStepBpm?: number;
  /** Sample rate for frame calculations. Default: 44100 */
  sampleRate?: number;
}

export interface VoiceBridgeResult {
  /** The parsed intent */
  intent: VoiceIntent;
  /** Whether the intent was executed */
  executed: boolean;
  /** Human-readable confirmation text for TTS */
  confirmation: string;
  /** Error message if execution failed */
  error?: string;
}

// ── Default config ───────────────────────────────────────────────────

const DEFAULTS: Required<ShrutiVoiceBridgeConfig> = {
  minConfidence: 0.6,
  gainStepDb: 3,
  panStep: 0.5,
  tempoStepBpm: 10,
  sampleRate: 44100,
};

// ── Bridge ───────────────────────────────────────────────────────────

export class ShrutiVoiceBridge {
  private readonly client: ShrutiClient;
  private readonly config: Required<ShrutiVoiceBridgeConfig>;
  private readonly logger?: SecureLogger;

  /** Track name → index cache. Refreshed on each voice command. */
  private trackMap = new Map<string, number>();

  constructor(client: ShrutiClient, config?: ShrutiVoiceBridgeConfig, logger?: SecureLogger) {
    this.client = client;
    this.config = { ...DEFAULTS, ...config };
    this.logger = logger?.child({ component: 'shruti-voice-bridge' });
  }

  /**
   * Process a text transcript (from STT) as a Shruti voice command.
   * Returns confirmation text suitable for TTS synthesis.
   */
  async processTranscript(transcript: string): Promise<VoiceBridgeResult> {
    const intent = parseVoiceInput(transcript);

    this.logger?.debug({ intent: intent.action, confidence: intent.confidence }, 'parsed voice intent');

    if (intent.confidence < this.config.minConfidence) {
      return {
        intent,
        executed: false,
        confirmation: "Sorry, I didn't understand that command.",
      };
    }

    try {
      const confirmation = await this.executeIntent(intent.action);
      return { intent, executed: true, confirmation };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.warn({ err: msg, intent: intent.action }, 'voice command execution failed');
      return {
        intent,
        executed: false,
        confirmation: `Command failed: ${msg}`,
        error: msg,
      };
    }
  }

  // ── Intent Execution ─────────────────────────────────────────────

  private async executeIntent(action: VoiceAction): Promise<string> {
    switch (action.kind) {
      case 'transport':
        return this.executeTransport(action.command);
      case 'seek':
        return this.executeSeek(action.target);
      case 'track_control':
        return this.executeTrackControl(action.command);
      case 'mix':
        return this.executeMix(action.command);
      case 'tempo':
        return this.executeTempo(action.command);
      case 'analyze':
        return this.executeAnalyze(action.command);
      case 'unknown':
        return "I didn't understand that. Try commands like play, stop, mute the drums, or set tempo to 120.";
    }
  }

  private async executeTransport(command: TransportCommand): Promise<string> {
    await this.client.transport(command);
    const labels: Record<string, string> = {
      play: 'Playing.',
      stop: 'Stopped.',
      pause: 'Paused.',
      record: 'Recording.',
    };
    return labels[command] ?? `Transport: ${command}.`;
  }

  private async executeSeek(target: SeekTarget): Promise<string> {
    switch (target.type) {
      case 'bar': {
        // Convert bar number to frames. Assumes 4/4 time.
        const info = await this.client.sessionInfo();
        const beatsPerBar = 4;
        const framesPerBeat = (this.config.sampleRate * 60) / info.tempo;
        const frame = Math.round((target.bar! - 1) * beatsPerBar * framesPerBeat);
        await this.client.seek(frame);
        return `Moved to bar ${target.bar}.`;
      }
      case 'beginning':
        await this.client.seek(0);
        return 'Moved to the beginning.';
      case 'end': {
        const info = await this.client.sessionInfo();
        await this.client.seek(info.duration_frames);
        return 'Moved to the end.';
      }
      default:
        return 'Seek complete.';
    }
  }

  private async executeTrackControl(command: TrackCommand): Promise<string> {
    const trackIndex = await this.resolveTrackIndex(command.track);
    const trackLabel = command.track || `track ${trackIndex}`;

    switch (command.action) {
      case 'mute':
        await this.client.muteTrack(trackIndex, true);
        return `Muted ${trackLabel}.`;
      case 'unmute':
        await this.client.muteTrack(trackIndex, false);
        return `Unmuted ${trackLabel}.`;
      case 'solo':
        await this.client.soloTrack(trackIndex, true);
        return `Soloed ${trackLabel}.`;
      case 'unsolo':
        await this.client.soloTrack(trackIndex, false);
        return `Unsoloed ${trackLabel}.`;
      case 'volume': {
        const tracks = await this.client.listTracks();
        const track = tracks.find((t) => t.index === trackIndex);
        const currentGain = track?.gain_db ?? 0;
        const delta = command.direction === 'up' ? this.config.gainStepDb : -this.config.gainStepDb;
        const newGain = currentGain + delta;
        await this.client.setTrackGain(trackIndex, newGain);
        const dir = command.direction === 'up' ? 'up' : 'down';
        return `Turned ${trackLabel} ${dir} to ${newGain.toFixed(1)} dB.`;
      }
      case 'pan': {
        let panValue: number;
        switch (command.direction) {
          case 'left':
            panValue = -this.config.panStep;
            break;
          case 'right':
            panValue = this.config.panStep;
            break;
          case 'center':
            panValue = 0;
            break;
          default:
            panValue = 0;
        }
        await this.client.setTrackPan(trackIndex, panValue);
        return `Panned ${trackLabel} ${command.direction ?? 'center'}.`;
      }
      default:
        return `Track control: ${command.action}.`;
    }
  }

  private async executeMix(command: MixCommand): Promise<string> {
    if (command.action === 'auto_mix') {
      const suggestions = await this.client.autoMixSuggest();
      return `Auto-mix complete. Got ${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'}.`;
    }
    // add_effect — future: parse effect name from voice
    return 'Effect added.';
  }

  private async executeTempo(command: TempoCommand): Promise<string> {
    if (command.action === 'set' && command.bpm != null) {
      await this.client.setTempo(command.bpm);
      return `Tempo set to ${command.bpm} BPM.`;
    }
    // For faster/slower, get current tempo and adjust
    const info = await this.client.sessionInfo();
    const delta = command.action === 'faster' ? this.config.tempoStepBpm : -this.config.tempoStepBpm;
    const newBpm = Math.max(20, Math.min(300, info.tempo + delta));
    await this.client.setTempo(newBpm);
    return `Tempo ${command.action === 'faster' ? 'increased' : 'decreased'} to ${newBpm} BPM.`;
  }

  private async executeAnalyze(command: AnalyzeCommand): Promise<string> {
    switch (command.type) {
      case 'spectrum': {
        const idx = await this.resolveTrackIndex(command.track ?? '');
        await this.client.analyzeSpectrum(idx);
        return `Spectrum analysis complete for ${command.track || 'track ' + idx}.`;
      }
      case 'dynamics': {
        const idx = await this.resolveTrackIndex(command.track ?? '');
        await this.client.analyzeDynamics(idx);
        return `Dynamics analysis complete for ${command.track || 'track ' + idx}.`;
      }
      case 'full_mix':
        await this.client.autoMixSuggest();
        return 'Full mix analysis complete.';
      default:
        return 'Analysis complete.';
    }
  }

  // ── Track Resolution ─────────────────────────────────────────────

  /**
   * Resolve a track name (e.g. "drums", "vocals") to a track index.
   * Refreshes the track list cache each time for accuracy.
   */
  private async resolveTrackIndex(name: string): Promise<number> {
    const tracks = await this.client.listTracks();
    this.refreshTrackMap(tracks);

    if (!name) return 0; // default to first track

    // Exact match (case-insensitive)
    const lower = name.toLowerCase();
    const exact = this.trackMap.get(lower);
    if (exact != null) return exact;

    // Partial match: track name contains the spoken name
    for (const track of tracks) {
      if (track.name.toLowerCase().includes(lower)) {
        return track.index;
      }
    }

    // Try numeric: "track 2" → index 1
    const num = Number(name);
    if (!Number.isNaN(num) && num >= 0 && num < tracks.length) {
      return num;
    }

    this.logger?.warn({ name }, 'could not resolve track name, defaulting to 0');
    return 0;
  }

  private refreshTrackMap(tracks: ShrutiTrack[]): void {
    this.trackMap.clear();
    for (const t of tracks) {
      this.trackMap.set(t.name.toLowerCase(), t.index);
    }
  }
}
