/**
 * AGNOS Video Bridge — HTTP client for AGNOS screen capture & recording REST API.
 *
 * Bridges AGNOS daimon (port 8090) frame-polling endpoints into SecureYeoman's
 * capture pipeline. Supports:
 *   - Remote screenshot capture
 *   - Recording session lifecycle (start/stop/pause/resume)
 *   - Frame polling with sequence-based streaming (`?since=N`)
 *   - Live view (latest frame)
 *
 * AGNOS endpoints consumed:
 *   POST /v1/screen/capture          — take screenshot
 *   POST /v1/screen/recording/start  — start recording
 *   POST /v1/screen/recording/:id/stop    — stop
 *   POST /v1/screen/recording/:id/pause   — pause
 *   POST /v1/screen/recording/:id/resume  — resume
 *   POST /v1/screen/recording/:id/frame   — capture next frame
 *   GET  /v1/screen/recording/:id/frames?since=N — poll frames
 *   GET  /v1/screen/recording/:id/latest  — latest frame (live view)
 *   GET  /v1/screen/recording/:id         — session metadata
 *   GET  /v1/screen/recordings            — list sessions
 */

import type { SecureLogger } from '../../logging/logger.js';
import { assertPublicUrl } from '../../utils/ssrf-guard.js';
import { errorToString } from '../../utils/errors.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgnosFrame {
  /** Base64-encoded image data (PNG or JPEG). */
  imageBase64: string;
  mimeType: string;
  /** Monotonic sequence number for ordering. */
  sequence: number;
  /** Capture timestamp (ms since epoch). */
  timestamp: number;
  /** Frame dimensions. */
  width?: number;
  height?: number;
}

export interface AgnosRecordingSession {
  id: string;
  agentId: string;
  status: 'recording' | 'paused' | 'stopped' | 'idle';
  fps: number;
  frameCount: number;
  startedAt: number;
  stoppedAt?: number;
}

export interface AgnosCaptureResult {
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface AgnosVideoBridgeConfig {
  /** AGNOS runtime base URL (e.g. http://127.0.0.1:8090). */
  agnosUrl: string;
  /** API key for AGNOS authentication. */
  apiKey?: string;
  /** Agent ID to use for AGNOS capture permissions. */
  agentId?: string;
  /** Request timeout in ms (default: 15 000). */
  timeoutMs?: number;
}

// ── Bridge ───────────────────────────────────────────────────────────────────

export class AgnosVideoBridge {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly agentId: string;
  private readonly timeoutMs: number;
  private readonly logger: SecureLogger;

  constructor(config: AgnosVideoBridgeConfig, logger: SecureLogger) {
    this.baseUrl = config.agnosUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.agentId = config.agentId ?? 'secureyeoman';
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.logger = logger;
  }

  // ── Health ───────────────────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.fetch('/health', 'GET');
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Screenshot ───────────────────────────────────────────────────────────

  async captureScreenshot(opts?: {
    target?: 'display' | 'window' | 'region';
    targetId?: string;
    format?: 'png' | 'bmp';
  }): Promise<AgnosCaptureResult> {
    const body = {
      agent_id: this.agentId,
      target: opts?.target ?? 'display',
      target_id: opts?.targetId,
      format: opts?.format ?? 'png',
    };
    const res = await this.fetch('/v1/screen/capture', 'POST', body);
    if (!res.ok) throw new Error(`AGNOS capture failed: ${res.status}`);
    return (await res.json()) as AgnosCaptureResult;
  }

  // ── Recording lifecycle ──────────────────────────────────────────────────

  async startRecording(opts?: { fps?: number; agentId?: string }): Promise<AgnosRecordingSession> {
    const body = {
      agent_id: opts?.agentId ?? this.agentId,
      fps: opts?.fps ?? 10,
    };
    const res = await this.fetch('/v1/screen/recording/start', 'POST', body);
    if (!res.ok) throw new Error(`AGNOS start recording failed: ${res.status}`);
    return (await res.json()) as AgnosRecordingSession;
  }

  async stopRecording(sessionId: string): Promise<AgnosRecordingSession> {
    const res = await this.fetch(`/v1/screen/recording/${enc(sessionId)}/stop`, 'POST');
    if (!res.ok) throw new Error(`AGNOS stop recording failed: ${res.status}`);
    return (await res.json()) as AgnosRecordingSession;
  }

  async pauseRecording(sessionId: string): Promise<void> {
    const res = await this.fetch(`/v1/screen/recording/${enc(sessionId)}/pause`, 'POST');
    if (!res.ok) throw new Error(`AGNOS pause failed: ${res.status}`);
  }

  async resumeRecording(sessionId: string): Promise<void> {
    const res = await this.fetch(`/v1/screen/recording/${enc(sessionId)}/resume`, 'POST');
    if (!res.ok) throw new Error(`AGNOS resume failed: ${res.status}`);
  }

  /** Trigger a frame capture within an active recording session. */
  async captureFrame(sessionId: string): Promise<AgnosFrame> {
    const res = await this.fetch(`/v1/screen/recording/${enc(sessionId)}/frame`, 'POST');
    if (!res.ok) throw new Error(`AGNOS frame capture failed: ${res.status}`);
    return (await res.json()) as AgnosFrame;
  }

  // ── Frame polling ────────────────────────────────────────────────────────

  /**
   * Poll frames captured since `sinceSequence`.
   * Returns frames in order. Use the highest returned sequence as `sinceSequence`
   * for the next poll to implement streaming.
   */
  async pollFrames(sessionId: string, sinceSequence: number): Promise<AgnosFrame[]> {
    const url = `/v1/screen/recording/${enc(sessionId)}/frames?since=${sinceSequence}`;
    const res = await this.fetch(url, 'GET');
    if (!res.ok) throw new Error(`AGNOS frame poll failed: ${res.status}`);
    const data = (await res.json()) as { frames?: AgnosFrame[] };
    return data.frames ?? [];
  }

  /** Get the most recent frame (live view). */
  async getLatestFrame(sessionId: string): Promise<AgnosFrame | null> {
    const res = await this.fetch(`/v1/screen/recording/${enc(sessionId)}/latest`, 'GET');
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`AGNOS latest frame failed: ${res.status}`);
    }
    return (await res.json()) as AgnosFrame;
  }

  // ── Session queries ──────────────────────────────────────────────────────

  async getSession(sessionId: string): Promise<AgnosRecordingSession | null> {
    const res = await this.fetch(`/v1/screen/recording/${enc(sessionId)}`, 'GET');
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`AGNOS get session failed: ${res.status}`);
    }
    return (await res.json()) as AgnosRecordingSession;
  }

  async listSessions(): Promise<AgnosRecordingSession[]> {
    const res = await this.fetch('/v1/screen/recordings', 'GET');
    if (!res.ok) throw new Error(`AGNOS list sessions failed: ${res.status}`);
    const data = (await res.json()) as { sessions?: AgnosRecordingSession[] };
    return data.sessions ?? [];
  }

  // ── Internal fetch ───────────────────────────────────────────────────────

  private async fetch(path: string, method: 'GET' | 'POST', body?: unknown): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    // SSRF guard — only allow localhost for AGNOS runtime
    // Skip for 127.0.0.1 / localhost which are the expected AGNOS addresses
    const parsed = new URL(url);
    if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
      assertPublicUrl(url, 'AGNOS Video Bridge URL');
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      return await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.logger.warn(
        { url: path, error: errorToString(err) },
        'AGNOS video bridge request failed'
      );
      throw new Error(`AGNOS video bridge: ${errorToString(err)}`, { cause: err });
    }
  }
}

/** URL-encode a path segment. */
function enc(s: string): string {
  return encodeURIComponent(s);
}
