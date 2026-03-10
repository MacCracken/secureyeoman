/**
 * VideoStreamManager — Real-time video frame streaming via WebSocket.
 *
 * Orchestrates three video sources:
 *   1. **AGNOS remote** — polls AGNOS daimon frame endpoints, relays to WS clients
 *   2. **Local camera** — captures frames via ffmpeg at configurable FPS
 *   3. **Local screen** — captures screenshots at configurable FPS
 *
 * Each streaming session:
 *   - Has a unique session ID
 *   - Runs a polling/capture loop at the configured FPS
 *   - Broadcasts frames to all subscribed WebSocket clients
 *   - Optionally routes frames through MultimodalManager for vision analysis
 *   - Auto-stops after maxDuration (default 10 min)
 *   - Hard cap of 3 concurrent sessions
 *
 * Frame delivery:
 *   WebSocket messages are JSON: { type: 'frame', sessionId, sequence, imageBase64, mimeType, timestamp, analysis? }
 *   Control messages: { type: 'session_started' | 'session_stopped' | 'session_error', sessionId, ... }
 */

import { randomUUID } from 'node:crypto';
import type { SecureLogger } from '../../logging/logger.js';
import type { AgnosVideoBridge, AgnosFrame } from './agnos-video-bridge.js';
import { captureCamera, type CameraFrame } from './camera.js';
import { captureScreen, type CaptureResult } from './screen.js';
import { errorToString } from '../../utils/errors.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type VideoSource = 'agnos' | 'local_camera' | 'local_screen';

export interface VideoStreamConfig {
  /** Video source. */
  source: VideoSource;
  /** Target frames per second (1–30, default: 5). */
  fps?: number;
  /** Max duration in seconds (default: 600 = 10 min). */
  maxDurationS?: number;
  /** AGNOS recording session ID (required for source=agnos). */
  agnosSessionId?: string;
  /** Camera device ID (for source=local_camera). */
  deviceId?: string;
  /** Screen capture region (for source=local_screen). */
  region?: { x: number; y: number; width: number; height: number };
  /** Enable vision analysis on frames (routes through MultimodalManager). */
  enableVisionAnalysis?: boolean;
  /** Vision analysis prompt. */
  visionPrompt?: string;
  /** Only analyze every Nth frame to save cost (default: 10). */
  visionAnalyzeEveryN?: number;
}

export interface StreamFrame {
  sessionId: string;
  sequence: number;
  imageBase64: string;
  mimeType: string;
  timestamp: number;
  width?: number;
  height?: number;
  analysis?: string;
}

export interface StreamSession {
  id: string;
  userId: string;
  source: VideoSource;
  status: 'active' | 'stopped' | 'error';
  fps: number;
  frameCount: number;
  startedAt: number;
  stoppedAt?: number;
  config: VideoStreamConfig;
}

export type FrameCallback = (frame: StreamFrame) => void;
export type SessionCallback = (event: {
  type: 'session_started' | 'session_stopped' | 'session_error';
  session: StreamSession;
  error?: string;
}) => void;

export interface VisionAnalyzer {
  analyzeImage(req: {
    imageBase64: string;
    mimeType: string;
    prompt?: string;
  }): Promise<{ description: string }>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_CONCURRENT_SESSIONS = 3;
const DEFAULT_FPS = 5;
const MAX_FPS = 30;
const DEFAULT_MAX_DURATION_S = 600;
const MAX_DURATION_S = 1800; // 30 min hard cap

// ── Manager ──────────────────────────────────────────────────────────────────

interface ActiveSession {
  session: StreamSession;
  interval: NodeJS.Timeout;
  timeout: NodeJS.Timeout;
  frameSubscribers: Set<FrameCallback>;
  sessionSubscribers: Set<SessionCallback>;
  lastAgnosSequence: number;
}

export class VideoStreamManager {
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly logger: SecureLogger;
  private readonly agnosBridge: AgnosVideoBridge | null;
  private readonly visionAnalyzer: VisionAnalyzer | null;

  constructor(opts: {
    logger: SecureLogger;
    agnosBridge?: AgnosVideoBridge | null;
    visionAnalyzer?: VisionAnalyzer | null;
  }) {
    this.logger = opts.logger;
    this.agnosBridge = opts.agnosBridge ?? null;
    this.visionAnalyzer = opts.visionAnalyzer ?? null;
  }

  // ── Session lifecycle ──────────────────────────────────────────────────

  async startSession(userId: string, config: VideoStreamConfig): Promise<StreamSession> {
    if (this.sessions.size >= MAX_CONCURRENT_SESSIONS) {
      throw new Error(
        `Maximum concurrent video sessions (${MAX_CONCURRENT_SESSIONS}) reached. Stop an existing session first.`
      );
    }

    if (config.source === 'agnos' && !this.agnosBridge) {
      throw new Error(
        'AGNOS video bridge is not configured. Set AGNOS_RUNTIME_URL and enable the AGNOS ecosystem service.'
      );
    }

    const fps = Math.min(Math.max(config.fps ?? DEFAULT_FPS, 1), MAX_FPS);
    const maxDurationS = Math.min(config.maxDurationS ?? DEFAULT_MAX_DURATION_S, MAX_DURATION_S);

    const sessionId = randomUUID();
    const session: StreamSession = {
      id: sessionId,
      userId,
      source: config.source,
      status: 'active',
      fps,
      frameCount: 0,
      startedAt: Date.now(),
      config,
    };

    // For AGNOS source, start a recording session if no agnosSessionId provided
    let agnosSessionId = config.agnosSessionId;
    if (config.source === 'agnos' && !agnosSessionId) {
      const agnosSession = await this.agnosBridge!.startRecording({ fps });
      agnosSessionId = agnosSession.id;
      session.config = { ...config, agnosSessionId };
    }

    const frameSubscribers = new Set<FrameCallback>();
    const sessionSubscribers = new Set<SessionCallback>();

    // Capture loop
    const intervalMs = Math.floor(1000 / fps);
    const interval = setInterval(() => {
      void this.captureAndBroadcast(sessionId).catch((err: unknown) => {
        this.logger.warn(
          { sessionId, error: errorToString(err) },
          'Video stream frame capture error'
        );
      });
    }, intervalMs);

    // Auto-stop timeout
    const timeout = setTimeout(() => {
      void this.stopSession(sessionId);
    }, maxDurationS * 1000);

    this.sessions.set(sessionId, {
      session,
      interval,
      timeout,
      frameSubscribers,
      sessionSubscribers,
      lastAgnosSequence: 0,
    });

    this.logger.info(
      { sessionId, source: config.source, fps, maxDurationS, userId },
      'Video stream session started'
    );

    // Notify subscribers
    for (const cb of sessionSubscribers) {
      try {
        cb({ type: 'session_started', session });
      } catch {
        /* swallow */
      }
    }

    return session;
  }

  async stopSession(sessionId: string): Promise<StreamSession | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;

    clearInterval(entry.interval);
    clearTimeout(entry.timeout);

    entry.session.status = 'stopped';
    entry.session.stoppedAt = Date.now();

    // Stop AGNOS recording if we started one
    if (
      entry.session.source === 'agnos' &&
      entry.session.config.agnosSessionId &&
      this.agnosBridge
    ) {
      try {
        await this.agnosBridge.stopRecording(entry.session.config.agnosSessionId);
      } catch (err) {
        this.logger.warn(
          { sessionId, error: errorToString(err) },
          'Failed to stop AGNOS recording'
        );
      }
    }

    // Notify subscribers
    for (const cb of entry.sessionSubscribers) {
      try {
        cb({ type: 'session_stopped', session: entry.session });
      } catch {
        /* swallow */
      }
    }

    this.sessions.delete(sessionId);
    this.logger.info(
      { sessionId, frameCount: entry.session.frameCount },
      'Video stream session stopped'
    );

    return entry.session;
  }

  // ── Subscription ───────────────────────────────────────────────────────

  subscribeFrames(sessionId: string, callback: FrameCallback): () => void {
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new Error(`Session ${sessionId} not found`);
    entry.frameSubscribers.add(callback);
    return () => {
      entry.frameSubscribers.delete(callback);
    };
  }

  subscribeSession(sessionId: string, callback: SessionCallback): () => void {
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new Error(`Session ${sessionId} not found`);
    entry.sessionSubscribers.add(callback);
    return () => {
      entry.sessionSubscribers.delete(callback);
    };
  }

  // ── Queries ────────────────────────────────────────────────────────────

  getSession(sessionId: string): StreamSession | null {
    return this.sessions.get(sessionId)?.session ?? null;
  }

  getActiveSessions(): StreamSession[] {
    return Array.from(this.sessions.values()).map((e) => e.session);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  async dispose(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      await this.stopSession(id);
    }
  }

  // ── Private: capture + broadcast ───────────────────────────────────────

  private async captureAndBroadcast(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (entry?.session.status !== 'active') return;
    if (entry.frameSubscribers.size === 0) return; // No listeners — skip capture

    try {
      const frames = await this.captureFrames(entry);

      for (const frame of frames) {
        entry.session.frameCount++;

        // Optional vision analysis (every Nth frame)
        let analysis: string | undefined;
        const analyzeEveryN = entry.session.config.visionAnalyzeEveryN ?? 10;
        if (
          entry.session.config.enableVisionAnalysis &&
          this.visionAnalyzer &&
          entry.session.frameCount % analyzeEveryN === 0
        ) {
          try {
            const result = await this.visionAnalyzer.analyzeImage({
              imageBase64: frame.imageBase64,
              mimeType: frame.mimeType,
              prompt:
                entry.session.config.visionPrompt ?? 'Describe what you see in this video frame.',
            });
            analysis = result.description;
          } catch (err) {
            this.logger.debug(
              { sessionId, error: errorToString(err) },
              'Vision analysis failed for frame'
            );
          }
        }

        const streamFrame: StreamFrame = {
          sessionId,
          sequence: entry.session.frameCount,
          imageBase64: frame.imageBase64,
          mimeType: frame.mimeType,
          timestamp: frame.timestamp ?? Date.now(),
          width: frame.width,
          height: frame.height,
          analysis,
        };

        for (const cb of entry.frameSubscribers) {
          try {
            cb(streamFrame);
          } catch {
            /* swallow per-subscriber errors */
          }
        }
      }
    } catch (err) {
      this.logger.warn({ sessionId, error: errorToString(err) }, 'Video stream capture failed');
      // Don't kill the session on transient errors
    }
  }

  private async captureFrames(
    entry: ActiveSession
  ): Promise<
    { imageBase64: string; mimeType: string; timestamp?: number; width?: number; height?: number }[]
  > {
    const { session } = entry;

    switch (session.source) {
      case 'agnos': {
        if (!this.agnosBridge || !session.config.agnosSessionId) return [];
        const frames = await this.agnosBridge.pollFrames(
          session.config.agnosSessionId,
          entry.lastAgnosSequence
        );
        if (frames.length > 0) {
          entry.lastAgnosSequence = frames[frames.length - 1]!.sequence;
        }
        return frames.map((f: AgnosFrame) => ({
          imageBase64: f.imageBase64,
          mimeType: f.mimeType,
          timestamp: f.timestamp,
          width: f.width,
          height: f.height,
        }));
      }

      case 'local_camera': {
        const frame: CameraFrame = await captureCamera(session.config.deviceId);
        return [
          {
            imageBase64: frame.imageBase64,
            mimeType: frame.mimeType,
            timestamp: Date.now(),
          },
        ];
      }

      case 'local_screen': {
        const result: CaptureResult = await captureScreen(
          session.config.region ? { target: { type: 'region', region: session.config.region } } : {}
        );
        return [
          {
            imageBase64: result.imageBase64,
            mimeType: result.mimeType,
            timestamp: Date.now(),
            width: result.width,
            height: result.height,
          },
        ];
      }

      default:
        return [];
    }
  }
}
