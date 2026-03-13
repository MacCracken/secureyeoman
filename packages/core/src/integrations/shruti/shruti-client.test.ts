import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShrutiClient } from './shruti-client.js';

describe('ShrutiClient', () => {
  let client: ShrutiClient;

  beforeEach(() => {
    client = new ShrutiClient({
      baseUrl: 'http://localhost:8050',
      apiKey: 'test-key',
      timeoutMs: 5000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(body: unknown, status = 200) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);
  }

  describe('health', () => {
    it('calls GET /health with auth header', async () => {
      const mockResponse = {
        status: 'ok',
        version: '2026.3.11-0',
        uptime_secs: 120,
        session: null,
        audio_device: null,
      };
      const spy = mockFetch(mockResponse);

      const result = await client.health();
      expect(result).toEqual(mockResponse);
      expect(spy).toHaveBeenCalledOnce();

      const [url, opts] = spy.mock.calls[0];
      expect(url).toBe('http://localhost:8050/health');
      expect((opts as RequestInit).method).toBe('GET');
      expect((opts as RequestInit).headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer test-key' })
      );
    });
  });

  describe('createSession', () => {
    it('posts to /api/v1/session/create with correct body', async () => {
      const spy = mockFetch({ success: true, message: 'Session created' });

      await client.createSession('My Song', 48000, 2);

      const [url, opts] = spy.mock.calls[0];
      expect(url).toBe('http://localhost:8050/api/v1/session/create');
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body).toEqual({ name: 'My Song', sample_rate: 48000, channels: 2 });
    });

    it('uses defaults for sample rate and channels', async () => {
      const spy = mockFetch({ success: true, message: 'ok' });

      await client.createSession('Default');

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body.sample_rate).toBe(44100);
      expect(body.channels).toBe(2);
    });
  });

  describe('openSession', () => {
    it('posts path to /api/v1/session/open', async () => {
      const spy = mockFetch({ success: true, message: 'Opened' });

      await client.openSession('/home/user/songs/track.shruti');

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body.path).toBe('/home/user/songs/track.shruti');
    });
  });

  describe('saveSession', () => {
    it('posts to /api/v1/session/save', async () => {
      const spy = mockFetch({ success: true, message: 'Saved' });

      await client.saveSession();
      expect(spy.mock.calls[0][0]).toBe('http://localhost:8050/api/v1/session/save');
    });
  });

  describe('sessionInfo', () => {
    it('returns session metadata', async () => {
      const info = {
        name: 'My Song',
        path: '/tmp/song.shruti',
        sample_rate: 44100,
        channels: 2,
        tempo: 120,
        track_count: 4,
        duration_frames: 441000,
      };
      mockFetch(info);

      const result = await client.sessionInfo();
      expect(result.name).toBe('My Song');
      expect(result.tempo).toBe(120);
      expect(result.track_count).toBe(4);
    });
  });

  describe('track operations', () => {
    it('addTrack posts correct body', async () => {
      const spy = mockFetch({ success: true, message: 'Track added' });

      await client.addTrack('Vocals', 'audio');

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ name: 'Vocals', track_type: 'audio' });
    });

    it('listTracks returns array from data field', async () => {
      mockFetch({
        success: true,
        message: 'ok',
        data: [
          {
            index: 0,
            name: 'Drums',
            track_type: 'audio',
            gain_db: 0,
            pan: 0,
            muted: false,
            soloed: false,
            region_count: 2,
          },
          {
            index: 1,
            name: 'Bass',
            track_type: 'audio',
            gain_db: -3,
            pan: -0.2,
            muted: false,
            soloed: false,
            region_count: 1,
          },
        ],
      });

      const tracks = await client.listTracks();
      expect(tracks).toHaveLength(2);
      expect(tracks[0].name).toBe('Drums');
      expect(tracks[1].gain_db).toBe(-3);
    });

    it('setTrackGain sends correct values', async () => {
      const spy = mockFetch({ success: true, message: 'ok' });

      await client.setTrackGain(1, -6.5);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ track_index: 1, gain_db: -6.5 });
    });

    it('setTrackPan sends correct values', async () => {
      const spy = mockFetch({ success: true, message: 'ok' });

      await client.setTrackPan(0, 0.75);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ track_index: 0, pan: 0.75 });
    });

    it('muteTrack sends muted flag', async () => {
      const spy = mockFetch({ success: true, message: 'ok' });

      await client.muteTrack(2);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ track_index: 2, muted: true });
    });

    it('soloTrack sends soloed flag', async () => {
      const spy = mockFetch({ success: true, message: 'ok' });

      await client.soloTrack(1, false);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ track_index: 1, soloed: false });
    });

    it('addRegion sends file path and position', async () => {
      const spy = mockFetch({ success: true, message: 'ok' });

      await client.addRegion(0, '/audio/kick.wav', 44100);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({
        track_index: 0,
        file_path: '/audio/kick.wav',
        position_frames: 44100,
      });
    });
  });

  describe('transport', () => {
    it('sends transport action', async () => {
      const spy = mockFetch({ success: true, message: 'Playing' });

      await client.transport('play');

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ action: 'play' });
    });

    it('seek sends position', async () => {
      const spy = mockFetch({ success: true, message: 'ok' });

      await client.seek(88200);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ position_frames: 88200 });
    });

    it('setTempo sends bpm', async () => {
      const spy = mockFetch({ success: true, message: 'ok' });

      await client.setTempo(140);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ bpm: 140 });
    });
  });

  describe('export', () => {
    it('sends export params with defaults', async () => {
      const spy = mockFetch({ success: true, message: 'Exported' });

      await client.exportAudio('/output/mix.wav');

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ path: '/output/mix.wav', format: 'wav', bit_depth: 24 });
    });

    it('respects custom format and bit depth', async () => {
      const spy = mockFetch({ success: true, message: 'Exported' });

      await client.exportAudio('/output/mix.flac', 'flac', 16);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ path: '/output/mix.flac', format: 'flac', bit_depth: 16 });
    });
  });

  describe('analysis', () => {
    it('analyzeSpectrum sends track index and fft size', async () => {
      const spy = mockFetch({ type: 'spectrum', track_index: 0, data: {} });

      await client.analyzeSpectrum(0, 8192);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ track_index: 0, fft_size: 8192 });
    });

    it('analyzeDynamics sends track index', async () => {
      const spy = mockFetch({ type: 'dynamics', track_index: 1, data: {} });

      await client.analyzeDynamics(1);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ track_index: 1 });
    });

    it('autoMixSuggest returns suggestions array', async () => {
      mockFetch({
        success: true,
        message: 'ok',
        data: [
          {
            track_index: 0,
            suggested_gain_db: -3,
            suggested_pan: 0,
            eq_suggestion: null,
            reasoning: 'test',
          },
        ],
      });

      const suggestions = await client.autoMixSuggest();
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].suggested_gain_db).toBe(-3);
    });

    it('compositionSuggest returns suggestion', async () => {
      mockFetch({
        success: true,
        message: 'ok',
        data: {
          structure: 'verse-chorus',
          instrumentation: ['drums', 'bass'],
          tempo_suggestion: 120,
          reasoning: 'test',
        },
      });

      const suggestion = await client.compositionSuggest();
      expect(suggestion.structure).toBe('verse-chorus');
      expect(suggestion.instrumentation).toContain('bass');
    });
  });

  describe('edit operations', () => {
    it('undo calls POST /api/v1/undo', async () => {
      const spy = mockFetch({ success: true, message: 'Undone' });

      await client.undo();
      expect(spy.mock.calls[0][0]).toBe('http://localhost:8050/api/v1/undo');
    });

    it('redo calls POST /api/v1/redo', async () => {
      const spy = mockFetch({ success: true, message: 'Redone' });

      await client.redo();
      expect(spy.mock.calls[0][0]).toBe('http://localhost:8050/api/v1/redo');
    });

    it('splitRegion sends correct body', async () => {
      const spy = mockFetch({ success: true, message: 'Split' });

      await client.splitRegion(0, 1, 22050);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ track_index: 0, region_index: 1, at_frame: 22050 });
    });

    it('trimRegion sends start and end frames', async () => {
      const spy = mockFetch({ success: true, message: 'Trimmed' });

      await client.trimRegion(0, 0, 1000, 50000);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({
        track_index: 0,
        region_index: 0,
        start_frame: 1000,
        end_frame: 50000,
      });
    });

    it('setFade sends fade frames', async () => {
      const spy = mockFetch({ success: true, message: 'ok' });

      await client.setFade(0, 0, 4410, 8820);

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({
        track_index: 0,
        region_index: 0,
        fade_in_frames: 4410,
        fade_out_frames: 8820,
      });
    });
  });

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: () => Promise.resolve('Internal Server Error'),
      } as Response);

      await expect(client.health()).rejects.toThrow('Shruti API 500: Internal Server Error');
    });

    it('constructs without apiKey', () => {
      const noAuth = new ShrutiClient({ baseUrl: 'http://localhost:8050' });
      expect(noAuth).toBeDefined();
    });
  });

  describe('trailing slash normalization', () => {
    it('strips trailing slash from baseUrl', async () => {
      const c = new ShrutiClient({ baseUrl: 'http://localhost:8050/' });
      const spy = mockFetch({ status: 'ok' });

      await c.health();
      expect(spy.mock.calls[0][0]).toBe('http://localhost:8050/health');
    });
  });

  describe('mcpToolCall', () => {
    it('posts tool name and args', async () => {
      const spy = mockFetch({ success: true, message: 'ok' });

      await client.mcpToolCall('shruti_transport', { action: 'play' });

      const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({
        tool_name: 'shruti_transport',
        arguments: { action: 'play' },
      });
    });
  });
});
