/**
 * faster-whisper STT Provider
 *
 * HTTP client for a local faster-whisper server. OpenAI Whisper-compatible
 * API for speech-to-text using CTranslate2-optimized Whisper models.
 *
 * Supports models: tiny, base, small, medium, large-v3
 *
 * Env vars:
 *   - FASTER_WHISPER_URL (default: http://localhost:17501)
 */

const FETCH_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 3_000;

/** Available faster-whisper model sizes. */
export const FASTER_WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large-v3'] as const;
export type FasterWhisperModel = (typeof FASTER_WHISPER_MODELS)[number];

function getFasterWhisperUrl(): string {
  return (process.env.FASTER_WHISPER_URL ?? 'http://localhost:17501').replace(/\/$/, '');
}

/**
 * Check whether the faster-whisper server is reachable.
 */
export async function isFasterWhisperAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${getFasterWhisperUrl()}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Transcribe audio using the local faster-whisper server.
 *
 * POST /v1/audio/transcriptions with multipart form data (OpenAI Whisper-compatible).
 * Returns { text, language, duration }.
 */
export async function transcribeFasterWhisper(
  audioBuffer: Buffer,
  format?: string,
  language?: string,
  model?: string
): Promise<{ text: string; language?: string; duration?: number }> {
  const baseUrl = getFasterWhisperUrl();
  const audioFormat = format ?? 'wav';

  const blob = new Blob([new Uint8Array(audioBuffer)], { type: `audio/${audioFormat}` });
  const formData = new FormData();
  formData.append('file', blob, `audio.${audioFormat}`);
  formData.append('model', model ?? 'base');
  if (language) formData.append('language', language);

  const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`faster-whisper STT error (${res.status}): ${errBody}`);
  }

  const data = (await res.json()) as { text: string; language?: string; duration?: number };
  return { text: data.text, language: data.language, duration: data.duration };
}
