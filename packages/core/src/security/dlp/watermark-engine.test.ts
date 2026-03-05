import { describe, it, expect } from 'vitest';
import { WatermarkEngine, type WatermarkPayload } from './watermark-engine.js';

const PAYLOAD: WatermarkPayload = {
  tenantId: 'tenant-1',
  userId: 'user-42',
  contentId: 'doc-abc',
  timestamp: 1700000000000,
};

// ── Unicode steganography ────────────────────────────────────────────

describe('WatermarkEngine — unicode-steganography', () => {
  const engine = new WatermarkEngine('unicode-steganography');

  it('embed then extract roundtrip', () => {
    const text = 'Hello world, this is a test document.';
    const watermarked = engine.embed(text, PAYLOAD);
    const extracted = engine.extract(watermarked);
    expect(extracted).not.toBeNull();
    expect(extracted!.tenantId).toBe(PAYLOAD.tenantId);
    expect(extracted!.userId).toBe(PAYLOAD.userId);
    expect(extracted!.contentId).toBe(PAYLOAD.contentId);
    expect(extracted!.timestamp).toBe(PAYLOAD.timestamp);
  });

  it('detect returns true for watermarked text', () => {
    const watermarked = engine.embed('Some text here', PAYLOAD);
    expect(engine.detect(watermarked)).toBe(true);
  });

  it('detect returns false for clean text', () => {
    expect(engine.detect('Just a normal string')).toBe(false);
  });

  it('extract returns null for non-watermarked text', () => {
    expect(engine.extract('No watermark here')).toBeNull();
  });

  it('preserves visible text content', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const watermarked = engine.embed(text, PAYLOAD);
    // Strip zero-width characters to recover visible text
    const visible = watermarked.replace(/[\u200B\u200C\u200D]/g, '');
    expect(visible).toBe(text);
  });

  it('handles text starting with whitespace', () => {
    const text = '  leading spaces';
    const watermarked = engine.embed(text, PAYLOAD);
    const extracted = engine.extract(watermarked);
    // May insert before or after — just check roundtrip works or returns null gracefully
    // With leading spaces, the regex won't match a word so it prepends
    expect(extracted).not.toBeNull();
  });
});

// ── Whitespace ─────────────────────────────────────────────────────

describe('WatermarkEngine — whitespace', () => {
  const engine = new WatermarkEngine('whitespace');

  it('embed then extract roundtrip', () => {
    // Need enough lines for the payload bits; create a multi-line doc
    const lines = Array.from({ length: 300 }, (_, i) => `Line ${i + 1} of the document`);
    const text = lines.join('\n');
    const watermarked = engine.embed(text, PAYLOAD);
    const extracted = engine.extract(watermarked);
    expect(extracted).not.toBeNull();
    expect(extracted!.tenantId).toBe(PAYLOAD.tenantId);
    expect(extracted!.userId).toBe(PAYLOAD.userId);
    expect(extracted!.contentId).toBe(PAYLOAD.contentId);
    expect(extracted!.timestamp).toBe(PAYLOAD.timestamp);
  });

  it('detect returns true for watermarked text', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `Line ${i}`);
    const watermarked = engine.embed(lines.join('\n'), PAYLOAD);
    expect(engine.detect(watermarked)).toBe(true);
  });

  it('detect returns false for clean text', () => {
    expect(engine.detect('single line no trailing spaces')).toBe(false);
  });

  it('extract returns null for non-watermarked text', () => {
    expect(engine.extract('no watermark')).toBeNull();
  });

  it('pads short text with newlines if needed', () => {
    const watermarked = engine.embed('short', PAYLOAD);
    expect(watermarked.split('\n').length).toBeGreaterThan(1);
  });
});

// ── Homoglyph ──────────────────────────────────────────────────────

describe('WatermarkEngine — homoglyph', () => {
  const engine = new WatermarkEngine('homoglyph');

  it('embed then extract roundtrip', () => {
    // Need lots of substitutable characters (a, e, o, p, c, x)
    const text = 'a]e]o]p]c]x]'.repeat(100);
    const watermarked = engine.embed(text, PAYLOAD);
    const extracted = engine.extract(watermarked);
    expect(extracted).not.toBeNull();
    expect(extracted!.tenantId).toBe(PAYLOAD.tenantId);
    expect(extracted!.userId).toBe(PAYLOAD.userId);
    expect(extracted!.contentId).toBe(PAYLOAD.contentId);
    expect(extracted!.timestamp).toBe(PAYLOAD.timestamp);
  });

  it('detect returns true for watermarked text', () => {
    const text = 'accept exceptional operations';
    const watermarked = engine.embed(text, PAYLOAD);
    expect(engine.detect(watermarked)).toBe(true);
  });

  it('detect returns false for clean text', () => {
    expect(engine.detect('Hello World 123')).toBe(false);
  });

  it('extract returns null for non-watermarked text', () => {
    // Text with no Cyrillic characters
    expect(engine.extract('HHHHHHH')).toBeNull();
  });

  it('preserves text readability', () => {
    const text = 'acceptable pace';
    const watermarked = engine.embed(text, PAYLOAD);
    // Should still look similar (same length)
    expect(watermarked.length).toBe(text.length);
  });
});

// ── Cross-cutting ──────────────────────────────────────────────────

describe('WatermarkEngine — cross-cutting', () => {
  it('default algorithm is unicode-steganography', () => {
    const engine = new WatermarkEngine();
    expect(engine.getAlgorithm()).toBe('unicode-steganography');
  });

  it('payload fields preserved for all algorithms', () => {
    const algorithms = ['unicode-steganography', 'whitespace', 'homoglyph'] as const;
    for (const algo of algorithms) {
      const engine = new WatermarkEngine(algo);
      const text = algo === 'homoglyph'
        ? 'a]e]o]p]c]x]'.repeat(100)
        : algo === 'whitespace'
          ? Array.from({ length: 300 }, (_, i) => `Line ${i}`).join('\n')
          : 'Hello world test document content.';
      const watermarked = engine.embed(text, PAYLOAD);
      const extracted = engine.extract(watermarked);
      expect(extracted, `roundtrip failed for ${algo}`).not.toBeNull();
      expect(extracted!.tenantId).toBe(PAYLOAD.tenantId);
      expect(extracted!.userId).toBe(PAYLOAD.userId);
      expect(extracted!.contentId).toBe(PAYLOAD.contentId);
      expect(extracted!.timestamp).toBe(PAYLOAD.timestamp);
    }
  });

  it('empty text handling — unicode', () => {
    const engine = new WatermarkEngine('unicode-steganography');
    const watermarked = engine.embed('', PAYLOAD);
    // Should still embed the payload markers
    expect(watermarked.length).toBeGreaterThan(0);
    const extracted = engine.extract(watermarked);
    expect(extracted).not.toBeNull();
  });

  it('long text handling — unicode', () => {
    const engine = new WatermarkEngine('unicode-steganography');
    const text = 'A'.repeat(10_000);
    const watermarked = engine.embed(text, PAYLOAD);
    const extracted = engine.extract(watermarked);
    expect(extracted).not.toBeNull();
    expect(extracted!.contentId).toBe(PAYLOAD.contentId);
  });
});
