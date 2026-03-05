/**
 * WatermarkEngine — invisible text watermarking for content provenance.
 *
 * Three algorithms:
 *   1. unicode-steganography — zero-width characters (default)
 *   2. whitespace — trailing spaces on lines
 *   3. homoglyph — Cyrillic lookalike substitution
 */

export interface WatermarkPayload {
  tenantId: string;
  userId: string;
  contentId: string;
  timestamp: number;
}

export type WatermarkAlgorithm = 'unicode-steganography' | 'whitespace' | 'homoglyph';

// Zero-width characters for unicode-steganography
const ZW_ZERO = '\u200B';   // ZERO WIDTH SPACE = bit 0
const ZW_ONE = '\u200C';    // ZERO WIDTH NON-JOINER = bit 1
const ZW_SEP = '\u200D';    // ZERO WIDTH JOINER = separator/marker

// Homoglyph map: Latin -> Cyrillic lookalike
const HOMOGLYPH_MAP: Record<string, string> = {
  a: '\u0430', // Cyrillic а
  e: '\u0435', // Cyrillic е
  o: '\u043E', // Cyrillic о
  p: '\u0440', // Cyrillic р
  c: '\u0441', // Cyrillic с
  x: '\u0445', // Cyrillic х
};

const REVERSE_HOMOGLYPH: Record<string, string> = Object.fromEntries(
  Object.entries(HOMOGLYPH_MAP).map(([latin, cyrillic]) => [cyrillic, latin]),
);

// All Cyrillic homoglyph code points for detection
const CYRILLIC_HOMOGLYPHS = new Set(Object.values(HOMOGLYPH_MAP));

// ── Helpers ────────────────────────────────────────────────────────

function stringToBits(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }
  return bits;
}

function bitsToString(bits: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    const chunk = bits.slice(i, i + 8);
    if (chunk.length === 8) {
      bytes.push(parseInt(chunk, 2));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function payloadToJson(payload: WatermarkPayload): string {
  return JSON.stringify({
    t: payload.tenantId,
    u: payload.userId,
    c: payload.contentId,
    s: payload.timestamp,
  });
}

function jsonToPayload(json: string): WatermarkPayload | null {
  try {
    const obj = JSON.parse(json);
    if (obj && typeof obj.t === 'string' && typeof obj.u === 'string' && typeof obj.c === 'string' && typeof obj.s === 'number') {
      return { tenantId: obj.t, userId: obj.u, contentId: obj.c, timestamp: obj.s };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Unicode Steganography ──────────────────────────────────────────

function embedUnicode(text: string, payload: WatermarkPayload): string {
  const json = payloadToJson(payload);
  const bits = stringToBits(json);
  let encoded = ZW_SEP; // start marker
  for (const bit of bits) {
    encoded += bit === '0' ? ZW_ZERO : ZW_ONE;
  }
  encoded += ZW_SEP; // end marker

  // Insert after first word boundary
  const match = text.match(/^(\S+)/);
  if (match) {
    const pos = match[0].length;
    return text.slice(0, pos) + encoded + text.slice(pos);
  }
  return encoded + text;
}

function extractUnicode(text: string): WatermarkPayload | null {
  const startIdx = text.indexOf(ZW_SEP);
  if (startIdx === -1) return null;
  const endIdx = text.indexOf(ZW_SEP, startIdx + 1);
  if (endIdx === -1) return null;

  const segment = text.slice(startIdx + 1, endIdx);
  let bits = '';
  for (const ch of segment) {
    if (ch === ZW_ZERO) bits += '0';
    else if (ch === ZW_ONE) bits += '1';
    // skip any other characters
  }

  if (bits.length < 8) return null;
  const json = bitsToString(bits);
  return jsonToPayload(json);
}

function detectUnicode(text: string): boolean {
  return text.includes(ZW_SEP) && (text.includes(ZW_ZERO) || text.includes(ZW_ONE));
}

// ── Whitespace ─────────────────────────────────────────────────────

function embedWhitespace(text: string, payload: WatermarkPayload): string {
  const json = payloadToJson(payload);
  const bits = stringToBits(json);
  let lines = text.split('\n');

  // Pad with empty lines if needed
  while (lines.length < bits.length) {
    lines.push('');
  }

  for (let i = 0; i < bits.length; i++) {
    // Strip existing trailing spaces first
    lines[i] = lines[i]!.replace(/ +$/, '');
    if (bits[i] === '1') {
      lines[i]! += ' ';
    }
  }

  return lines.join('\n');
}

function extractWhitespace(text: string): WatermarkPayload | null {
  const lines = text.split('\n');
  let bits = '';
  for (const line of lines) {
    bits += line.endsWith(' ') ? '1' : '0';
  }

  // Trim trailing zeros to byte boundary
  const trimmed = bits.replace(/0+$/, '');
  const padded = trimmed.padEnd(Math.ceil(trimmed.length / 8) * 8, '0');
  if (padded.length < 8) return null;

  const json = bitsToString(padded);
  return jsonToPayload(json);
}

function detectWhitespace(text: string): boolean {
  const lines = text.split('\n');
  if (lines.length < 8) return false; // need at least 1 byte worth of lines
  let trailingSpaceCount = 0;
  for (const line of lines) {
    if (line.endsWith(' ')) trailingSpaceCount++;
  }
  // Heuristic: at least 3 lines with trailing spaces suggests watermark
  return trailingSpaceCount >= 3;
}

// ── Homoglyph ──────────────────────────────────────────────────────

function embedHomoglyph(text: string, payload: WatermarkPayload): string {
  const json = payloadToJson(payload);
  const dataBits = stringToBits(json);
  // Prefix with 16-bit length header so extraction knows where data ends
  const lengthBits = dataBits.length.toString(2).padStart(16, '0');
  const bits = lengthBits + dataBits;
  const chars = [...text];
  let bitIdx = 0;

  for (let i = 0; i < chars.length && bitIdx < bits.length; i++) {
    const lower = chars[i]!.toLowerCase();
    if (HOMOGLYPH_MAP[lower]) {
      if (bits[bitIdx] === '1') {
        // Replace with Cyrillic lookalike, preserving case
        chars[i] = chars[i]! === chars[i]!.toUpperCase()
          ? HOMOGLYPH_MAP[lower]!.toUpperCase()
          : HOMOGLYPH_MAP[lower]!;
      }
      // bit 0 = keep original Latin
      bitIdx++;
    }
  }

  // If not enough substitutable characters, embedding is partial
  return chars.join('');
}

function extractHomoglyph(text: string): WatermarkPayload | null {
  const chars = [...text];
  let bits = '';

  for (const ch of chars) {
    const lower = ch.toLowerCase();
    if (REVERSE_HOMOGLYPH[lower]) {
      bits += '1';
    } else if (HOMOGLYPH_MAP[lower]) {
      bits += '0';
    }
    // else: not a substitutable character, skip
  }

  // First 16 bits encode the data length
  if (bits.length < 16) return null;
  const dataLength = parseInt(bits.slice(0, 16), 2);
  if (dataLength <= 0 || bits.length < 16 + dataLength) return null;

  const dataBits = bits.slice(16, 16 + dataLength);
  const json = bitsToString(dataBits);
  return jsonToPayload(json);
}

function detectHomoglyph(text: string): boolean {
  for (const ch of text) {
    if (CYRILLIC_HOMOGLYPHS.has(ch) || CYRILLIC_HOMOGLYPHS.has(ch.toLowerCase())) return true;
  }
  return false;
}

// ── Engine ─────────────────────────────────────────────────────────

export class WatermarkEngine {
  private algorithm: WatermarkAlgorithm;

  constructor(algorithm: WatermarkAlgorithm = 'unicode-steganography') {
    this.algorithm = algorithm;
  }

  getAlgorithm(): WatermarkAlgorithm {
    return this.algorithm;
  }

  embed(text: string, payload: WatermarkPayload): string {
    switch (this.algorithm) {
      case 'unicode-steganography':
        return embedUnicode(text, payload);
      case 'whitespace':
        return embedWhitespace(text, payload);
      case 'homoglyph':
        return embedHomoglyph(text, payload);
      default:
        return embedUnicode(text, payload);
    }
  }

  extract(text: string): WatermarkPayload | null {
    switch (this.algorithm) {
      case 'unicode-steganography':
        return extractUnicode(text);
      case 'whitespace':
        return extractWhitespace(text);
      case 'homoglyph':
        return extractHomoglyph(text);
      default:
        return extractUnicode(text);
    }
  }

  detect(text: string): boolean {
    switch (this.algorithm) {
      case 'unicode-steganography':
        return detectUnicode(text);
      case 'whitespace':
        return detectWhitespace(text);
      case 'homoglyph':
        return detectHomoglyph(text);
      default:
        return detectUnicode(text);
    }
  }
}
