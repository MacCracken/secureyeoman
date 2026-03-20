/**
 * Shruti Integration Tests — runs against a live Shruti container.
 *
 * Prerequisites:
 *   docker run -d --name shruti-test --network host ghcr.io/maccracken/shruti:latest
 *
 * Run with:
 *   SHRUTI_URL=http://127.0.0.1:8050 npx vitest run --project core:unit -- shruti-integration
 *
 * Skipped when SHRUTI_URL is not set.
 */

import { describe, it, expect } from 'vitest';

const SHRUTI_URL = process.env.SHRUTI_URL;
const skip = !SHRUTI_URL;

async function shrutiGet(path: string): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`${SHRUTI_URL}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const body = await resp.json().catch(() => resp.text());
  return { status: resp.status, body };
}

async function shrutiPost(
  path: string,
  data: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const resp = await fetch(`${SHRUTI_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await resp.json()) as Record<string, unknown>;
  return { status: resp.status, body };
}

describe.skipIf(skip)('Shruti Integration', () => {
  // ── Health ────────────────────────────────────────────────────────────────

  describe('health', () => {
    it('returns ok with version', async () => {
      const { status, body } = await shrutiGet('/health');
      expect(status).toBe(200);
      const data = body as Record<string, unknown>;
      expect(data.status).toBe('ok');
      expect(data.version).toBeDefined();
    });
  });

  // ── Session lifecycle ─────────────────────────────────────────────────────

  describe('session', () => {
    it('reports no session initially or creates one', async () => {
      const { body } = await shrutiPost('/api/session', { action: 'info' });
      // May be "no active session" or an existing session — both valid
      expect(body.success !== undefined || body.message !== undefined).toBe(true);
    });

    it('creates a new session', async () => {
      const { body } = await shrutiPost('/api/session', {
        action: 'create',
        name: 'integration-test',
        sample_rate: 44100,
        channels: 2,
      });
      expect(body.success).toBe(true);
      expect(body.message).toContain('integration-test');
    });

    it('returns session info after creation', async () => {
      const { body } = await shrutiPost('/api/session', { action: 'info' });
      expect(body.success).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect(data.name).toBe('integration-test');
      expect(data.sample_rate).toBe(44100);
    });
  });

  // ── Track management ──────────────────────────────────────────────────────

  describe('tracks', () => {
    it('adds an audio track', async () => {
      const { body } = await shrutiPost('/api/tracks', {
        action: 'add',
        name: 'Vocals',
        track_type: 'audio',
      });
      expect(body.success).toBe(true);
      expect(body.message).toContain('Vocals');
    });

    it('lists tracks including new track', async () => {
      const { body } = await shrutiPost('/api/tracks', { action: 'list' });
      expect(body.success).toBe(true);
      const data = body.data as Record<string, unknown>;
      const tracks = data.tracks as Record<string, unknown>[];
      expect(tracks.length).toBeGreaterThanOrEqual(1);
      const vocal = tracks.find((t) => t.name === 'Vocals');
      expect(vocal).toBeDefined();
      expect(vocal!.kind).toBe('Audio');
    });

    it('master track always present', async () => {
      const { body } = await shrutiPost('/api/tracks', { action: 'list' });
      const data = body.data as Record<string, unknown>;
      const tracks = data.tracks as Record<string, unknown>[];
      const master = tracks.find((t) => t.kind === 'Master');
      expect(master).toBeDefined();
    });
  });

  // ── Transport ─────────────────────────────────────────────────────────────

  describe('transport', () => {
    it('responds to transport control', async () => {
      const { body } = await shrutiPost('/api/transport', { action: 'stop' });
      // May succeed or report already stopped — both valid
      expect(body.success !== undefined || body.message !== undefined).toBe(true);
    });
  });

  // ── Repeated health (heartbeat simulation) ────────────────────────────────

  describe('heartbeat', () => {
    it('repeated health calls succeed', async () => {
      for (let i = 0; i < 3; i++) {
        const { status } = await shrutiGet('/health');
        expect(status).toBe(200);
      }
    });
  });
});
