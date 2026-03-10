/**
 * Piper TTS Provider
 *
 * HTTP client for a local Piper TTS server. ONNX-based, runs on CPU,
 * supports 35+ languages with a variety of voices.
 *
 * Env vars:
 *   - PIPER_URL (default: http://localhost:17502)
 */

const FETCH_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 3_000;

function getPiperUrl(): string {
  return (process.env.PIPER_URL ?? 'http://localhost:17502').replace(/\/$/, '');
}

/**
 * Check whether the Piper TTS server is reachable.
 */
export async function isPiperAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${getPiperUrl()}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Synthesize speech using the local Piper TTS server.
 *
 * POST /api/tts with JSON body { text, voice, output_format }.
 * Returns audio buffer (WAV by default).
 */
export async function synthesizePiper(
  text: string,
  voice?: string,
  outputFormat?: string
): Promise<{ audioBase64: string; format: string }> {
  const baseUrl = getPiperUrl();
  const format = outputFormat ?? 'wav';

  const res = await fetch(`${baseUrl}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: voice ?? 'en_US-lessac-medium',
      output_format: format,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Piper TTS error (${res.status}): ${errBody}`);
  }

  const buf = await res.arrayBuffer();
  return { audioBase64: Buffer.from(buf).toString('base64'), format };
}
