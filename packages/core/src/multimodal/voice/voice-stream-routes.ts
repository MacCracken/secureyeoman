/**
 * Voice Stream Routes — WebSocket endpoints for real-time voice I/O.
 *
 * Routes:
 * - GET /api/v1/multimodal/audio/stream          — TTS streaming (text -> audio chunks)
 * - GET /api/v1/multimodal/audio/transcribe/stream — STT streaming (audio chunks -> text)
 * - GET /api/v1/multimodal/audio/agent            — Full voice agent pipeline
 */

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { MultimodalManager } from '../manager.js';
import type { VoicePromptCache } from './voice-cache.js';
import { VoiceAgentSession, type VoiceAgentConfig } from './voice-agent.js';

// @fastify/websocket augments FastifyInstance at registration time, but the
// augmented type is not visible in stand-alone route-registration functions
// that receive a plain FastifyInstance. We cast once here to keep the rest
// of the file clean.

type WsApp = any;

// ─── Types ──────────────────────────────────────────────────────────

export interface VoiceStreamRoutesOptions {
  multimodalManager: MultimodalManager;
  voiceCache?: VoicePromptCache | null;
}

/** TTS streaming: client sends JSON, server responds with binary audio chunks */
interface TTSSpeakMessage {
  action: 'speak';
  text: string;
  provider?: string;
  voiceId?: string;
  profileId?: string;
}

/** STT streaming: client sends binary audio or JSON control messages */
interface STTControlMessage {
  action: 'stop';
}

/** Voice agent: client sends JSON control or binary audio */
interface AgentStartMessage {
  action: 'start';
  personalityId: string;
  voiceProfileId?: string;
  sttProvider?: string;
  ttsProvider?: string;
  language?: string;
}

interface _AgentControlMessage {
  action: 'interrupt' | 'stop';
}

/** Frame size for chunking audio over WebSocket */
const CHUNK_SIZE = 4096;

/** Maximum text length for TTS requests */
const MAX_TEXT_LENGTH = 10_000;

/** Maximum audio buffer size for STT (5MB) */
const MAX_AUDIO_BUFFER = 5 * 1024 * 1024;

// ─── Helpers ────────────────────────────────────────────────────────

function sendJson(socket: WebSocket, data: Record<string, unknown>): void {
  if (socket.readyState === 1 /* OPEN */) {
    socket.send(JSON.stringify(data));
  }
}

function sendBinary(socket: WebSocket, data: Buffer): void {
  if (socket.readyState === 1 /* OPEN */) {
    socket.send(data);
  }
}

function tryParseJson(data: unknown): Record<string, unknown> | null {
  try {
    const str = typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString('utf8');
    // Quick check: if it starts with '{', try parsing
    if (str.trimStart().startsWith('{')) {
      return JSON.parse(str) as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Route Registration ─────────────────────────────────────────────

export function registerVoiceStreamRoutes(
  app: FastifyInstance,
  opts: VoiceStreamRoutesOptions
): void {
  const { multimodalManager, voiceCache } = opts;
  const wsApp = app as WsApp;

  // ── TTS Streaming WebSocket ─────────────────────────────────────
  // Client sends JSON { action: "speak", text: "..." }
  // Server responds with binary audio chunks, then JSON { action: "done" }
  wsApp.get(
    '/api/v1/multimodal/audio/stream',
    { websocket: true },
    async (socket: WebSocket, _request: unknown) => {
      socket.on('message', (raw: Buffer | ArrayBuffer | string) => {
        void handleTTSMessage(socket, raw, multimodalManager, voiceCache ?? null);
      });

      socket.on('error', () => {
        // Connection-level errors — nothing to do
      });
    }
  );

  // ── STT Streaming WebSocket ─────────────────────────────────────
  // Client streams binary audio chunks
  // Server responds with JSON interim/final transcripts
  wsApp.get(
    '/api/v1/multimodal/audio/transcribe/stream',
    { websocket: true },
    async (socket: WebSocket, _request: unknown) => {
      const state: STTSessionState = {
        audioChunks: [],
        totalBytes: 0,
        stopped: false,
        silenceTimer: null,
      };

      socket.on('message', (raw: Buffer | ArrayBuffer | string) => {
        void handleSTTMessage(socket, raw, state, multimodalManager);
      });

      socket.on('close', () => {
        cleanupSTTSession(state);
      });

      socket.on('error', () => {
        cleanupSTTSession(state);
      });
    }
  );

  // ── Voice Agent WebSocket ───────────────────────────────────────
  // Full duplex: audio in -> STT -> LLM -> TTS -> audio out
  wsApp.get(
    '/api/v1/multimodal/audio/agent',
    { websocket: true },
    async (socket: WebSocket, _request: unknown) => {
      let session: VoiceAgentSession | null = null;

      socket.on('message', (raw: Buffer | ArrayBuffer | string) => {
        void handleAgentMessage(socket, raw, session, multimodalManager, (s) => {
          session = s;
        });
      });

      socket.on('close', () => {
        if (session) {
          void session.close();
          session = null;
        }
      });

      socket.on('error', () => {
        if (session) {
          void session.close();
          session = null;
        }
      });
    }
  );
}

// ─── TTS Handler ────────────────────────────────────────────────────

async function handleTTSMessage(
  socket: WebSocket,
  raw: Buffer | ArrayBuffer | string,
  manager: MultimodalManager,
  cache: VoicePromptCache | null
): Promise<void> {
  const json = tryParseJson(raw);
  if (json?.action !== 'speak') {
    sendJson(socket, { action: 'error', message: 'Expected JSON with action: "speak"' });
    return;
  }

  const msg = json as unknown as TTSSpeakMessage;

  if (!msg.text || typeof msg.text !== 'string') {
    sendJson(socket, { action: 'error', message: 'Missing or invalid "text" field' });
    return;
  }

  if (msg.text.length > MAX_TEXT_LENGTH) {
    sendJson(socket, {
      action: 'error',
      message: `Text exceeds maximum length of ${MAX_TEXT_LENGTH}`,
    });
    return;
  }

  const start = Date.now();

  try {
    // Check voice cache first
    const provider = msg.provider ?? 'openai';
    const voiceId = msg.voiceId ?? 'alloy';

    if (cache) {
      const cached = cache.get(provider, voiceId, msg.text);
      if (cached) {
        // Stream cached audio in chunks
        for (let offset = 0; offset < cached.length; offset += CHUNK_SIZE) {
          const chunk = cached.subarray(offset, Math.min(offset + CHUNK_SIZE, cached.length));
          sendBinary(socket, chunk);
        }
        sendJson(socket, { action: 'done', durationMs: Date.now() - start, cached: true });
        return;
      }
    }

    // Synthesize via the manager
    const { buffer, durationMs } = await manager.synthesizeSpeechBinary({
      text: msg.text,
      voice: msg.voiceId ?? 'alloy',
      model: 'tts-1',
      responseFormat: 'mp3',
    });

    // Cache the result
    if (cache) {
      cache.set(provider, voiceId, msg.text, buffer);
    }

    // Stream audio in chunks
    for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
      if (socket.readyState !== 1) return; // connection closed
      const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, buffer.length));
      sendBinary(socket, chunk);
    }

    sendJson(socket, { action: 'done', durationMs: durationMs ?? Date.now() - start });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(socket, { action: 'error', message: sanitize(message) });
  }
}

// ─── STT Handler ────────────────────────────────────────────────────

interface STTSessionState {
  audioChunks: Buffer[];
  totalBytes: number;
  stopped: boolean;
  silenceTimer: ReturnType<typeof setTimeout> | null;
}

const SILENCE_FLUSH_MS = 1500;

async function handleSTTMessage(
  socket: WebSocket,
  raw: Buffer | ArrayBuffer | string,
  state: STTSessionState,
  manager: MultimodalManager
): Promise<void> {
  if (state.stopped) return;

  // Check for JSON control messages
  const json = tryParseJson(raw);
  if (json) {
    const ctrl = json as unknown as STTControlMessage;
    if (ctrl.action === 'stop') {
      state.stopped = true;
      // Flush any remaining audio
      await flushSTTBuffer(socket, state, manager);
      cleanupSTTSession(state);
      return;
    }
    return;
  }

  // Binary audio data
  const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);

  if (state.totalBytes + chunk.length > MAX_AUDIO_BUFFER) {
    sendJson(socket, { type: 'error', message: 'Audio buffer limit exceeded' });
    return;
  }

  state.audioChunks.push(chunk);
  state.totalBytes += chunk.length;

  // Emit interim indicator
  sendJson(socket, { type: 'interim', text: '...' });

  // Reset silence timer — flush on silence
  if (state.silenceTimer) {
    clearTimeout(state.silenceTimer);
  }
  state.silenceTimer = setTimeout(() => {
    void flushSTTBuffer(socket, state, manager);
  }, SILENCE_FLUSH_MS);
}

async function flushSTTBuffer(
  socket: WebSocket,
  state: STTSessionState,
  manager: MultimodalManager
): Promise<void> {
  if (state.audioChunks.length === 0) return;

  const combined = Buffer.concat(state.audioChunks);
  state.audioChunks = [];
  state.totalBytes = 0;

  if (state.silenceTimer) {
    clearTimeout(state.silenceTimer);
    state.silenceTimer = null;
  }

  const start = Date.now();

  try {
    const result = await manager.transcribeAudio({
      audioBase64: combined.toString('base64'),
      format: 'webm',
    });

    sendJson(socket, {
      type: 'final',
      text: result.text,
      language: result.language,
      durationMs: result.durationMs ?? Date.now() - start,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(socket, { type: 'error', message: sanitize(message) });
  }
}

function cleanupSTTSession(state: STTSessionState): void {
  state.stopped = true;
  if (state.silenceTimer) {
    clearTimeout(state.silenceTimer);
    state.silenceTimer = null;
  }
  state.audioChunks = [];
  state.totalBytes = 0;
}

// ─── Voice Agent Handler ────────────────────────────────────────────

async function handleAgentMessage(
  socket: WebSocket,
  raw: Buffer | ArrayBuffer | string,
  session: VoiceAgentSession | null,
  manager: MultimodalManager,
  setSession: (s: VoiceAgentSession | null) => void
): Promise<void> {
  // Check for JSON control messages
  const json = tryParseJson(raw);

  if (json) {
    const action = json.action as string;

    switch (action) {
      case 'start': {
        if (session && !session.isClosed) {
          sendJson(socket, { action: 'error', message: 'Session already active' });
          return;
        }

        const msg = json as unknown as AgentStartMessage;
        if (!msg.personalityId) {
          sendJson(socket, { action: 'error', message: 'personalityId is required' });
          return;
        }

        const config: VoiceAgentConfig = {
          personalityId: msg.personalityId,
          sttProvider: msg.sttProvider ?? 'deepgram',
          ttsProvider: msg.ttsProvider ?? 'openai',
          voiceProfileId: msg.voiceProfileId,
          language: msg.language ?? 'en',
        };

        const newSession = new VoiceAgentSession(config, manager);

        // Wire up events to the WebSocket
        newSession.on('transcript', (data) => {
          sendJson(socket, { action: 'transcript', ...data });
        });

        newSession.on('response-text', (text) => {
          sendJson(socket, { type: 'response-text', text });
        });

        newSession.on('response-audio', (chunk) => {
          sendBinary(socket, chunk);
        });

        newSession.on('done', () => {
          sendJson(socket, { type: 'done' });
        });

        newSession.on('error', (error) => {
          sendJson(socket, { type: 'error', message: sanitize(error.message) });
        });

        setSession(newSession);
        sendJson(socket, { action: 'started', personalityId: msg.personalityId });
        return;
      }

      case 'interrupt': {
        if (session && !session.isClosed) {
          await session.interrupt();
          sendJson(socket, { action: 'interrupted' });
        }
        return;
      }

      case 'stop': {
        if (session) {
          await session.close();
          setSession(null);
          sendJson(socket, { action: 'stopped' });
        }
        return;
      }

      default:
        sendJson(socket, { action: 'error', message: `Unknown action: ${action}` });
        return;
    }
  }

  // Binary audio data — forward to active session
  if (!session || session.isClosed) {
    sendJson(socket, {
      action: 'error',
      message: 'No active session. Send { action: "start" } first.',
    });
    return;
  }

  const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
  await session.processAudioChunk(chunk);
}

// ─── Utilities ──────────────────────────────────────────────────────

function sanitize(message: string): string {
  return message
    .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED]')
    .replace(/sk_[a-zA-Z0-9]{20,}/g, '[REDACTED]')
    .replace(/Bearer [a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/Token [a-zA-Z0-9._-]{20,}/g, 'Token [REDACTED]');
}
