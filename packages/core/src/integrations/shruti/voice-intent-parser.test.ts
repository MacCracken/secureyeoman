import { describe, it, expect } from 'vitest';
import { parseVoiceInput } from './voice-intent-parser.js';

describe('parseVoiceInput', () => {
  describe('transport commands', () => {
    it('parses "play"', () => {
      const intent = parseVoiceInput('play');
      expect(intent.action).toEqual({ kind: 'transport', command: 'play' });
      expect(intent.confidence).toBeGreaterThan(0.9);
    });

    it('parses "stop"', () => {
      const intent = parseVoiceInput('stop');
      expect(intent.action).toEqual({ kind: 'transport', command: 'stop' });
    });

    it('parses "start recording"', () => {
      const intent = parseVoiceInput('start recording');
      expect(intent.action).toEqual({ kind: 'transport', command: 'record' });
    });

    it('parses "pause"', () => {
      const intent = parseVoiceInput('pause');
      expect(intent.action).toEqual({ kind: 'transport', command: 'pause' });
    });

    it('parses "hit play"', () => {
      const intent = parseVoiceInput('hit play');
      expect(intent.action).toEqual({ kind: 'transport', command: 'play' });
    });
  });

  describe('seek commands', () => {
    it('parses "go to bar 16"', () => {
      const intent = parseVoiceInput('go to bar 16');
      expect(intent.action).toEqual({ kind: 'seek', target: { type: 'bar', bar: 16 } });
    });

    it('parses "play from bar 8"', () => {
      const intent = parseVoiceInput('play from bar 8');
      expect(intent.action).toEqual({ kind: 'seek', target: { type: 'bar', bar: 8 } });
    });

    it('parses "go to the beginning"', () => {
      const intent = parseVoiceInput('go to the beginning');
      expect(intent.action).toEqual({ kind: 'seek', target: { type: 'beginning' } });
    });

    it('parses "rewind"', () => {
      const intent = parseVoiceInput('rewind');
      expect(intent.action).toEqual({ kind: 'seek', target: { type: 'beginning' } });
    });

    it('parses "go to the end"', () => {
      const intent = parseVoiceInput('go to the end');
      expect(intent.action).toEqual({ kind: 'seek', target: { type: 'end' } });
    });
  });

  describe('track control', () => {
    it('parses "mute the drums"', () => {
      const intent = parseVoiceInput('mute the drums');
      expect(intent.action).toEqual({
        kind: 'track_control',
        command: { action: 'mute', track: 'drums' },
      });
    });

    it('parses "unmute vocals"', () => {
      const intent = parseVoiceInput('unmute vocals');
      expect(intent.action).toEqual({
        kind: 'track_control',
        command: { action: 'unmute', track: 'vocals' },
      });
    });

    it('parses "solo vocals"', () => {
      const intent = parseVoiceInput('solo vocals');
      expect(intent.action).toEqual({
        kind: 'track_control',
        command: { action: 'solo', track: 'vocals' },
      });
    });

    it('parses "louder on the vocals"', () => {
      const intent = parseVoiceInput('louder on the vocals');
      expect(intent.action).toEqual({
        kind: 'track_control',
        command: { action: 'volume', track: 'vocals', direction: 'up' },
      });
    });

    it('parses "turn down the bass"', () => {
      const intent = parseVoiceInput('turn down the bass');
      expect(intent.action).toEqual({
        kind: 'track_control',
        command: { action: 'volume', track: 'bass', direction: 'down' },
      });
    });

    it('parses "pan left on the guitar"', () => {
      const intent = parseVoiceInput('pan left on the guitar');
      expect(intent.action).toEqual({
        kind: 'track_control',
        command: { action: 'pan', track: 'guitar', direction: 'left' },
      });
    });

    it('parses "pan center"', () => {
      const intent = parseVoiceInput('pan center');
      expect(intent.action.kind).toBe('track_control');
      if (intent.action.kind === 'track_control') {
        expect(intent.action.command.direction).toBe('center');
      }
    });
  });

  describe('tempo commands', () => {
    it('parses "set tempo to 128"', () => {
      const intent = parseVoiceInput('set tempo to 128');
      expect(intent.action).toEqual({
        kind: 'tempo',
        command: { action: 'set', bpm: 128 },
      });
    });

    it('parses "faster"', () => {
      const intent = parseVoiceInput('faster');
      expect(intent.action).toEqual({
        kind: 'tempo',
        command: { action: 'faster' },
      });
    });

    it('parses "slow down"', () => {
      const intent = parseVoiceInput('slow down');
      expect(intent.action).toEqual({
        kind: 'tempo',
        command: { action: 'slower' },
      });
    });
  });

  describe('mix commands', () => {
    it('parses "auto mix"', () => {
      const intent = parseVoiceInput('auto mix');
      expect(intent.action).toEqual({
        kind: 'mix',
        command: { action: 'auto_mix' },
      });
    });

    it('parses "balance the mix"', () => {
      const intent = parseVoiceInput('balance the mix');
      expect(intent.action).toEqual({
        kind: 'mix',
        command: { action: 'auto_mix' },
      });
    });
  });

  describe('analysis commands', () => {
    it('parses "analyze the spectrum on vocals"', () => {
      const intent = parseVoiceInput('analyze the spectrum on vocals');
      expect(intent.action).toEqual({
        kind: 'analyze',
        command: { type: 'spectrum', track: 'vocals' },
      });
    });

    it('parses "check the dynamics"', () => {
      const intent = parseVoiceInput('check the dynamics');
      expect(intent.action.kind).toBe('analyze');
      if (intent.action.kind === 'analyze') {
        expect(intent.action.command.type).toBe('dynamics');
      }
    });

    it('parses "analyze the mix"', () => {
      const intent = parseVoiceInput('analyze the mix');
      expect(intent.action).toEqual({
        kind: 'analyze',
        command: { type: 'full_mix' },
      });
    });
  });

  describe('unknown commands', () => {
    it('returns unknown for unrecognized input', () => {
      const intent = parseVoiceInput('make me a sandwich');
      expect(intent.action.kind).toBe('unknown');
      expect(intent.confidence).toBe(0.0);
    });
  });

  describe('edge cases', () => {
    it('handles leading/trailing whitespace', () => {
      const intent = parseVoiceInput('  play  ');
      expect(intent.action).toEqual({ kind: 'transport', command: 'play' });
    });

    it('handles mixed case', () => {
      const intent = parseVoiceInput('PLAY');
      expect(intent.action).toEqual({ kind: 'transport', command: 'play' });
    });

    it('preserves original text', () => {
      const intent = parseVoiceInput('Go To Bar 16');
      expect(intent.original).toBe('Go To Bar 16');
    });
  });
});
