/**
 * Voice Intent Parser — TypeScript port of Shruti's `parse_voice_input()`.
 *
 * Parses natural-language text (typically from STT transcription) into
 * structured VoiceIntent objects that map to Shruti DAW operations.
 *
 * This is a local reimplementation so SY can parse intents without
 * requiring the Shruti HTTP server to be running.
 */

// ── Intent Types ─────────────────────────────────────────────────────

export type TransportCommand = 'play' | 'stop' | 'pause' | 'record';

export interface SeekTarget {
  type: 'bar' | 'beginning' | 'end';
  bar?: number;
}

export interface TrackCommand {
  action: 'mute' | 'unmute' | 'solo' | 'unsolo' | 'volume' | 'pan';
  track: string;
  direction?: 'up' | 'down' | 'left' | 'right' | 'center';
  value?: number;
}

export interface MixCommand {
  action: 'auto_mix' | 'add_effect';
  track?: string;
  effect?: string;
}

export interface TempoCommand {
  action: 'set' | 'faster' | 'slower';
  bpm?: number;
}

export interface AnalyzeCommand {
  type: 'spectrum' | 'dynamics' | 'full_mix';
  track?: string;
}

export type VoiceAction =
  | { kind: 'transport'; command: TransportCommand }
  | { kind: 'seek'; target: SeekTarget }
  | { kind: 'track_control'; command: TrackCommand }
  | { kind: 'mix'; command: MixCommand }
  | { kind: 'tempo'; command: TempoCommand }
  | { kind: 'analyze'; command: AnalyzeCommand }
  | { kind: 'unknown'; text: string };

export interface VoiceIntent {
  action: VoiceAction;
  confidence: number;
  original: string;
}

// ── Parser ───────────────────────────────────────────────────────────

/**
 * Parse natural-language input into a VoiceIntent.
 * Mirrors Shruti's `parse_voice_input()` in crates/shruti-ai/src/voice.rs.
 */
export function parseVoiceInput(input: string): VoiceIntent {
  const lower = input.trim().toLowerCase();
  const words = lower.split(/\s+/);

  const [action, confidence] = parseAction(lower, words);

  return { action, confidence, original: input };
}

function parseAction(lower: string, words: string[]): [VoiceAction, number] {
  // Seek commands (check before transport — "play from bar 8" is a seek)
  if (
    (lower.includes('go to bar') ||
      lower.includes('jump to bar') ||
      lower.includes('skip to bar')) &&
    extractNumber(words) != null
  ) {
    return [{ kind: 'seek', target: { type: 'bar', bar: extractNumber(words)! } }, 0.9];
  }
  if (
    (lower.includes('from bar') || lower.includes('play from bar')) &&
    extractNumber(words) != null
  ) {
    return [{ kind: 'seek', target: { type: 'bar', bar: extractNumber(words)! } }, 0.85];
  }

  // Transport commands
  if (matchesAny(lower, ['play', 'start playing', 'start playback', 'hit play'])) {
    return [{ kind: 'transport', command: 'play' }, 0.95];
  }
  if (matchesAny(lower, ['stop', 'stop playing', 'stop playback', 'hit stop'])) {
    return [{ kind: 'transport', command: 'stop' }, 0.95];
  }
  if (matchesAny(lower, ['pause', 'hold', 'freeze'])) {
    return [{ kind: 'transport', command: 'pause' }, 0.9];
  }
  if (matchesAny(lower, ['record', 'start recording', 'arm and record', 'hit record'])) {
    return [{ kind: 'transport', command: 'record' }, 0.95];
  }

  // Seek to beginning/end
  if (matchesAny(lower, ['go to the beginning', 'go to start', 'rewind', 'back to start'])) {
    return [{ kind: 'seek', target: { type: 'beginning' } }, 0.9];
  }
  if (matchesAny(lower, ['go to the end', 'jump to end', 'skip to end'])) {
    return [{ kind: 'seek', target: { type: 'end' } }, 0.9];
  }

  // Mute/unmute
  if (lower.includes('unmute')) {
    const track = extractTrackName(lower, 'unmute');
    return [{ kind: 'track_control', command: { action: 'unmute', track } }, 0.9];
  }
  if (lower.includes('mute')) {
    const track = extractTrackName(lower, 'mute');
    return [{ kind: 'track_control', command: { action: 'mute', track } }, 0.9];
  }

  // Solo/unsolo
  if (lower.includes('unsolo')) {
    const track = extractTrackName(lower, 'unsolo');
    return [{ kind: 'track_control', command: { action: 'unsolo', track } }, 0.9];
  }
  if (lower.includes('solo')) {
    const track = extractTrackName(lower, 'solo');
    return [{ kind: 'track_control', command: { action: 'solo', track } }, 0.9];
  }

  // Volume
  if (lower.includes('louder') || lower.includes('turn up') || lower.includes('volume up')) {
    const track = extractTrackContext(lower);
    return [{ kind: 'track_control', command: { action: 'volume', track, direction: 'up' } }, 0.8];
  }
  if (
    lower.includes('quieter') ||
    lower.includes('turn down') ||
    lower.includes('volume down') ||
    lower.includes('softer')
  ) {
    const track = extractTrackContext(lower);
    return [
      { kind: 'track_control', command: { action: 'volume', track, direction: 'down' } },
      0.8,
    ];
  }

  // Pan
  if (lower.includes('pan left') || lower.includes('move left')) {
    const track = extractTrackContext(lower);
    return [
      { kind: 'track_control', command: { action: 'pan', track, direction: 'left' } },
      0.85,
    ];
  }
  if (lower.includes('pan right') || lower.includes('move right')) {
    const track = extractTrackContext(lower);
    return [
      { kind: 'track_control', command: { action: 'pan', track, direction: 'right' } },
      0.85,
    ];
  }
  if (lower.includes('pan center') || lower.includes('center pan')) {
    const track = extractTrackContext(lower);
    return [
      { kind: 'track_control', command: { action: 'pan', track, direction: 'center' } },
      0.85,
    ];
  }

  // Tempo
  if (
    (lower.includes('set tempo') || lower.includes('set bpm') || lower.includes('tempo to')) &&
    extractNumber(words) != null
  ) {
    return [{ kind: 'tempo', command: { action: 'set', bpm: extractNumber(words)! } }, 0.9];
  }
  if (matchesAny(lower, ['faster', 'speed up', 'increase tempo'])) {
    return [{ kind: 'tempo', command: { action: 'faster' } }, 0.8];
  }
  if (matchesAny(lower, ['slower', 'slow down', 'decrease tempo'])) {
    return [{ kind: 'tempo', command: { action: 'slower' } }, 0.8];
  }

  // Auto-mix
  if (matchesAny(lower, ['auto mix', 'auto-mix', 'automix', 'mix it', 'balance the mix'])) {
    return [{ kind: 'mix', command: { action: 'auto_mix' } }, 0.85];
  }

  // Analysis
  if (lower.includes('analyze') || lower.includes('analyse') || lower.includes('check')) {
    if (lower.includes('spectrum') || lower.includes('frequencies')) {
      const track = extractTrackContext(lower);
      return [{ kind: 'analyze', command: { type: 'spectrum', track } }, 0.8];
    }
    if (
      lower.includes('dynamics') ||
      lower.includes('levels') ||
      lower.includes('loudness')
    ) {
      const track = extractTrackContext(lower);
      return [{ kind: 'analyze', command: { type: 'dynamics', track } }, 0.8];
    }
    if (lower.includes('mix') || lower.includes('everything') || lower.includes('all')) {
      return [{ kind: 'analyze', command: { type: 'full_mix' } }, 0.8];
    }
  }

  // Unknown
  return [{ kind: 'unknown', text: lower }, 0.0];
}

function matchesAny(input: string, patterns: string[]): boolean {
  return patterns.some((p) => input === p || input.startsWith(`${p} `));
}

function extractNumber(words: string[]): number | undefined {
  for (const w of words) {
    const n = Number(w);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function extractTrackName(input: string, keyword: string): string {
  const pos = input.indexOf(keyword);
  if (pos === -1) return '';
  let after = input.slice(pos + keyword.length).trim();
  if (after.startsWith('the ')) after = after.slice(4);
  const name = after.split(/\s+/)[0] ?? '';
  return name;
}

function extractTrackContext(input: string): string {
  const markers = ['on the ', 'on ', 'the ', 'for '];
  for (const marker of markers) {
    const pos = input.lastIndexOf(marker);
    if (pos !== -1) {
      const after = input.slice(pos + marker.length);
      const name = after.split(/\s+/)[0] ?? '';
      if (name && !['mix', 'everything', 'all', 'it'].includes(name)) {
        return name;
      }
    }
  }
  return '';
}
