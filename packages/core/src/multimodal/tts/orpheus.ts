/**
 * Orpheus TTS Provider
 *
 * HTTP client for a local Orpheus TTS server. Provides expressive,
 * emotion-aware text-to-speech with OpenAI-compatible API.
 *
 * Supports emotion markers in text: <laugh>, <sigh>, <excited>, <whisper>
 *
 * Env vars:
 *   - ORPHEUS_URL (default: http://localhost:17500)
 */

const FETCH_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 3_000;

/** Supported emotion markers that Orpheus can render inline. */
export const ORPHEUS_EMOTION_MARKERS = ['<laugh>', '<sigh>', '<excited>', '<whisper>'] as const;

function getOrpheusUrl(): string {
  return (process.env.ORPHEUS_URL ?? 'http://localhost:17500').replace(/\/$/, '');
}

/**
 * Check whether the Orpheus TTS server is reachable.
 */
export async function isOrpheusAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${getOrpheusUrl()}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Synthesize speech using the local Orpheus TTS server.
 *
 * Uses the OpenAI-compatible POST /v1/audio/speech endpoint.
 * Text may contain emotion markers: <laugh>, <sigh>, <excited>, <whisper>
 */
export async function synthesizeOrpheus(
  text: string,
  voice?: string,
  model?: string
): Promise<{ audioBase64: string; format: string }> {
  const baseUrl = getOrpheusUrl();

  const res = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: voice ?? 'default',
      model: model ?? 'orpheus',
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Orpheus TTS error (${res.status}): ${errBody}`);
  }

  const buf = await res.arrayBuffer();
  return { audioBase64: Buffer.from(buf).toString('base64'), format: 'mp3' };
}
