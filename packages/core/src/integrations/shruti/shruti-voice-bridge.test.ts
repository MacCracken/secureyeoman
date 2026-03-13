import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShrutiVoiceBridge } from './shruti-voice-bridge.js';
import type { ShrutiClient } from './shruti-client.js';

function createMockClient(): ShrutiClient {
  return {
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
    transport: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    seek: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    setTempo: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    muteTrack: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    soloTrack: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    setTrackGain: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    setTrackPan: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    autoMixSuggest: vi.fn().mockResolvedValue([]),
    analyzeSpectrum: vi.fn().mockResolvedValue({ type: 'spectrum', track_index: 0, data: {} }),
    analyzeDynamics: vi.fn().mockResolvedValue({ type: 'dynamics', track_index: 0, data: {} }),
    sessionInfo: vi.fn().mockResolvedValue({
      name: 'Test',
      path: null,
      sample_rate: 44100,
      channels: 2,
      tempo: 120,
      track_count: 3,
      duration_frames: 441000,
    }),
    listTracks: vi.fn().mockResolvedValue([
      {
        index: 0,
        name: 'Drums',
        track_type: 'audio',
        gain_db: 0,
        pan: 0,
        muted: false,
        soloed: false,
        region_count: 1,
      },
      {
        index: 1,
        name: 'Bass',
        track_type: 'audio',
        gain_db: -3,
        pan: 0,
        muted: false,
        soloed: false,
        region_count: 1,
      },
      {
        index: 2,
        name: 'Vocals',
        track_type: 'audio',
        gain_db: -1,
        pan: 0,
        muted: false,
        soloed: false,
        region_count: 2,
      },
    ]),
  } as unknown as ShrutiClient;
}

describe('ShrutiVoiceBridge', () => {
  let client: ShrutiClient;
  let bridge: ShrutiVoiceBridge;

  beforeEach(() => {
    client = createMockClient();
    bridge = new ShrutiVoiceBridge(client);
  });

  describe('transport commands', () => {
    it('executes play', async () => {
      const result = await bridge.processTranscript('play');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Playing.');
      expect(client.transport).toHaveBeenCalledWith('play');
    });

    it('executes stop', async () => {
      const result = await bridge.processTranscript('stop');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Stopped.');
    });

    it('executes pause', async () => {
      const result = await bridge.processTranscript('pause');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Paused.');
    });

    it('executes record', async () => {
      const result = await bridge.processTranscript('start recording');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Recording.');
    });
  });

  describe('seek commands', () => {
    it('seeks to a bar number', async () => {
      const result = await bridge.processTranscript('go to bar 16');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Moved to bar 16.');
      expect(client.seek).toHaveBeenCalled();
      // Bar 16 at 120 BPM, 44100 Hz = (16-1) * 4 * (44100*60/120) = 15 * 4 * 22050
      const frames = (client.seek as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(frames).toBe(15 * 4 * 22050);
    });

    it('seeks to beginning', async () => {
      const result = await bridge.processTranscript('rewind');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Moved to the beginning.');
      expect(client.seek).toHaveBeenCalledWith(0);
    });

    it('seeks to end', async () => {
      const result = await bridge.processTranscript('go to the end');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Moved to the end.');
      expect(client.seek).toHaveBeenCalledWith(441000);
    });
  });

  describe('track control', () => {
    it('mutes a track by name', async () => {
      const result = await bridge.processTranscript('mute the drums');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Muted drums.');
      expect(client.muteTrack).toHaveBeenCalledWith(0, true);
    });

    it('unmutes a track', async () => {
      const result = await bridge.processTranscript('unmute vocals');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Unmuted vocals.');
      expect(client.muteTrack).toHaveBeenCalledWith(2, false);
    });

    it('solos a track', async () => {
      const result = await bridge.processTranscript('solo vocals');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Soloed vocals.');
      expect(client.soloTrack).toHaveBeenCalledWith(2, true);
    });

    it('increases volume on a track', async () => {
      const result = await bridge.processTranscript('louder on the vocals');
      expect(result.executed).toBe(true);
      // Vocals current gain is -1, step is 3, so new = 2.0
      expect(result.confirmation).toContain('Turned vocals up');
      expect(client.setTrackGain).toHaveBeenCalledWith(2, 2);
    });

    it('decreases volume', async () => {
      const result = await bridge.processTranscript('turn down the bass');
      expect(result.executed).toBe(true);
      // Bass current gain is -3, step is 3, so new = -6.0
      expect(client.setTrackGain).toHaveBeenCalledWith(1, -6);
    });

    it('pans a track left', async () => {
      const result = await bridge.processTranscript('pan left on the guitar');
      expect(result.executed).toBe(true);
      // "guitar" won't match any track, defaults to 0
      expect(client.setTrackPan).toHaveBeenCalledWith(0, -0.5);
    });
  });

  describe('tempo commands', () => {
    it('sets specific tempo', async () => {
      const result = await bridge.processTranscript('set tempo to 140');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Tempo set to 140 BPM.');
      expect(client.setTempo).toHaveBeenCalledWith(140);
    });

    it('increases tempo', async () => {
      const result = await bridge.processTranscript('faster');
      expect(result.executed).toBe(true);
      // Current tempo 120 + step 10 = 130
      expect(result.confirmation).toBe('Tempo increased to 130 BPM.');
      expect(client.setTempo).toHaveBeenCalledWith(130);
    });

    it('decreases tempo', async () => {
      const result = await bridge.processTranscript('slower');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Tempo decreased to 110 BPM.');
      expect(client.setTempo).toHaveBeenCalledWith(110);
    });
  });

  describe('mix commands', () => {
    it('runs auto mix', async () => {
      const result = await bridge.processTranscript('auto mix');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toContain('Auto-mix complete');
      expect(client.autoMixSuggest).toHaveBeenCalled();
    });
  });

  describe('analysis commands', () => {
    it('analyzes spectrum', async () => {
      const result = await bridge.processTranscript('analyze the spectrum on vocals');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toContain('Spectrum analysis complete');
      expect(client.analyzeSpectrum).toHaveBeenCalledWith(2);
    });

    it('analyzes full mix', async () => {
      const result = await bridge.processTranscript('analyze the mix');
      expect(result.executed).toBe(true);
      expect(result.confirmation).toBe('Full mix analysis complete.');
    });
  });

  describe('low confidence / unknown', () => {
    it('rejects unknown commands', async () => {
      const result = await bridge.processTranscript('make me a sandwich');
      expect(result.executed).toBe(false);
      expect(result.confirmation).toContain("didn't understand");
    });
  });

  describe('error handling', () => {
    it('returns error when client call fails', async () => {
      (client.transport as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection refused')
      );

      const result = await bridge.processTranscript('play');
      expect(result.executed).toBe(false);
      expect(result.error).toBe('Connection refused');
      expect(result.confirmation).toContain('Command failed');
    });
  });

  describe('track resolution', () => {
    it('resolves partial track names', async () => {
      // "drum" should match "Drums" via partial match
      const result = await bridge.processTranscript('mute drum');
      expect(result.executed).toBe(true);
      // Parser extracts "drum" from "mute drum"
      expect(client.muteTrack).toHaveBeenCalledWith(0, true);
    });

    it('defaults to track 0 for empty track name', async () => {
      const result = await bridge.processTranscript('mute');
      expect(result.executed).toBe(true);
      expect(client.muteTrack).toHaveBeenCalledWith(0, true);
    });
  });

  describe('custom config', () => {
    it('uses custom gain step', async () => {
      bridge = new ShrutiVoiceBridge(client, { gainStepDb: 6 });

      const result = await bridge.processTranscript('louder on the vocals');
      expect(result.executed).toBe(true);
      // Vocals current gain is -1, step is 6, so new = 5
      expect(client.setTrackGain).toHaveBeenCalledWith(2, 5);
    });

    it('uses custom min confidence', async () => {
      bridge = new ShrutiVoiceBridge(client, { minConfidence: 0.95 });

      // "louder" has 0.8 confidence, below 0.95 threshold
      const result = await bridge.processTranscript('louder on the vocals');
      expect(result.executed).toBe(false);
    });
  });
});
