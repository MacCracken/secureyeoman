/**
 * Shruti Client — HTTP client for the Shruti DAW REST API.
 *
 * Shruti is a Rust-native digital audio workstation built for the AGNOS ecosystem.
 * Default port: 8050.
 */

import type { SecureLogger } from '../../logging/logger.js';

export interface ShrutiClientConfig {
  baseUrl: string; // e.g. http://127.0.0.1:8050
  apiKey?: string;
  timeoutMs?: number; // default 10000
}

// ── Response Types ──

export interface ShrutiHealthResponse {
  status: string;
  version: string;
  uptime_secs: number;
  session: string | null;
  audio_device: string | null;
}

export interface ShrutiSessionInfo {
  name: string;
  path: string | null;
  sample_rate: number;
  channels: number;
  tempo: number;
  track_count: number;
  duration_frames: number;
}

export interface ShrutiTrack {
  index: number;
  name: string;
  track_type: 'audio' | 'midi' | 'bus' | 'master' | 'instrument';
  gain_db: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  region_count: number;
}

export interface ShrutiAnalysisResult {
  type: 'spectrum' | 'dynamics';
  track_index: number;
  data: Record<string, unknown>;
}

export interface ShrutiAutoMixSuggestion {
  track_index: number;
  suggested_gain_db: number;
  suggested_pan: number;
  eq_suggestion: string | null;
  reasoning: string;
}

export interface ShrutiCompositionSuggestion {
  structure: string;
  instrumentation: string[];
  tempo_suggestion: number | null;
  reasoning: string;
}

export interface ShrutiApiResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// ── Client ──

export class ShrutiClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly logger?: SecureLogger;

  constructor(config: ShrutiClientConfig, logger?: SecureLogger) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.logger = logger?.child({ component: 'shruti-client' });
  }

  // ── Health ──

  async health(): Promise<ShrutiHealthResponse> {
    return this.get<ShrutiHealthResponse>('/health');
  }

  // ── Session ──

  async createSession(
    name: string,
    sampleRate?: number,
    channels?: number
  ): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/session/create', {
      name,
      sample_rate: sampleRate ?? 44100,
      channels: channels ?? 2,
    });
  }

  async openSession(path: string): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/session/open', { path });
  }

  async saveSession(): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/session/save', {});
  }

  async sessionInfo(): Promise<ShrutiSessionInfo> {
    return this.get<ShrutiSessionInfo>('/api/v1/session/info');
  }

  // ── Tracks ──

  async addTrack(
    name: string,
    trackType: 'audio' | 'midi' | 'bus' | 'instrument' = 'audio'
  ): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/tracks/add', {
      name,
      track_type: trackType,
    });
  }

  async listTracks(): Promise<ShrutiTrack[]> {
    const result = await this.get<ShrutiApiResult>('/api/v1/tracks/list');
    return (result.data as ShrutiTrack[]) ?? [];
  }

  async setTrackGain(trackIndex: number, gainDb: number): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/tracks/gain', {
      track_index: trackIndex,
      gain_db: gainDb,
    });
  }

  async setTrackPan(trackIndex: number, pan: number): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/tracks/pan', {
      track_index: trackIndex,
      pan,
    });
  }

  async muteTrack(trackIndex: number, muted = true): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/tracks/mute', {
      track_index: trackIndex,
      muted,
    });
  }

  async soloTrack(trackIndex: number, soloed = true): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/tracks/solo', {
      track_index: trackIndex,
      soloed,
    });
  }

  async addRegion(
    trackIndex: number,
    filePath: string,
    positionFrames: number
  ): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/tracks/add_region', {
      track_index: trackIndex,
      file_path: filePath,
      position_frames: positionFrames,
    });
  }

  // ── Transport ──

  async transport(action: 'play' | 'stop' | 'pause' | 'record'): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/transport/control', { action });
  }

  async seek(positionFrames: number): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/transport/seek', {
      position_frames: positionFrames,
    });
  }

  async setTempo(bpm: number): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/transport/tempo', { bpm });
  }

  // ── Export ──

  async exportAudio(
    path: string,
    format: 'wav' | 'flac' = 'wav',
    bitDepth: 16 | 24 | 32 = 24
  ): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/export', {
      path,
      format,
      bit_depth: bitDepth,
    });
  }

  // ── Analysis ──

  async analyzeSpectrum(trackIndex: number, fftSize?: number): Promise<ShrutiAnalysisResult> {
    return this.post<ShrutiAnalysisResult>('/api/v1/analysis/spectrum', {
      track_index: trackIndex,
      fft_size: fftSize ?? 4096,
    });
  }

  async analyzeDynamics(trackIndex: number): Promise<ShrutiAnalysisResult> {
    return this.post<ShrutiAnalysisResult>('/api/v1/analysis/dynamics', {
      track_index: trackIndex,
    });
  }

  async autoMixSuggest(): Promise<ShrutiAutoMixSuggestion[]> {
    const result = await this.post<ShrutiApiResult>('/api/v1/analysis/auto_mix', {});
    return (result.data as ShrutiAutoMixSuggestion[]) ?? [];
  }

  async compositionSuggest(): Promise<ShrutiCompositionSuggestion> {
    const result = await this.post<ShrutiApiResult>('/api/v1/analysis/composition', {});
    return result.data as ShrutiCompositionSuggestion;
  }

  // ── Mixer ──

  async addEffect(
    trackIndex: number,
    effectType: 'eq' | 'compressor' | 'reverb' | 'delay' | 'limiter'
  ): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/mixer/add_effect', {
      track_index: trackIndex,
      effect_type: effectType,
    });
  }

  // ── Edit ──

  async undo(): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/undo', {});
  }

  async redo(): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/redo', {});
  }

  async splitRegion(
    trackIndex: number,
    regionIndex: number,
    atFrame: number
  ): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/edit/split', {
      track_index: trackIndex,
      region_index: regionIndex,
      at_frame: atFrame,
    });
  }

  async trimRegion(
    trackIndex: number,
    regionIndex: number,
    startFrame: number,
    endFrame: number
  ): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/edit/trim', {
      track_index: trackIndex,
      region_index: regionIndex,
      start_frame: startFrame,
      end_frame: endFrame,
    });
  }

  async setFade(
    trackIndex: number,
    regionIndex: number,
    fadeInFrames?: number,
    fadeOutFrames?: number
  ): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/edit/fade', {
      track_index: trackIndex,
      region_index: regionIndex,
      fade_in_frames: fadeInFrames ?? 0,
      fade_out_frames: fadeOutFrames ?? 0,
    });
  }

  // ── MCP Tool Call (direct dispatch) ──

  async mcpToolCall(toolName: string, args: Record<string, unknown>): Promise<ShrutiApiResult> {
    return this.post<ShrutiApiResult>('/api/v1/mcp/tool-call', {
      tool_name: toolName,
      arguments: args,
    });
  }

  // ── HTTP Helpers ──

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Shruti API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Shruti API ${res.status}: ${text}`);
    }
    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return res.json() as Promise<T>;
    }
    return undefined as T;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }
}
