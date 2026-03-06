import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CorpusLoader } from './corpus-loader.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
}

describe('CorpusLoader', () => {
  let loader: CorpusLoader;
  let tempDir: string;

  beforeEach(() => {
    loader = new CorpusLoader({ log: makeLogger() });
    tempDir = mkdtempSync(join(tmpdir(), 'corpus-test-'));
  });

  // ── Format Detection ─────────────────────────────────────────────

  it('detects plaintext format', () => {
    expect(loader.detectFormat('data.txt')).toBe('plaintext');
  });

  it('detects jsonl format', () => {
    expect(loader.detectFormat('data.jsonl')).toBe('jsonl');
    expect(loader.detectFormat('data.ndjson')).toBe('jsonl');
  });

  it('detects csv format', () => {
    expect(loader.detectFormat('data.csv')).toBe('csv');
  });

  it('detects markdown format', () => {
    expect(loader.detectFormat('doc.md')).toBe('markdown');
  });

  it('detects parquet format', () => {
    expect(loader.detectFormat('data.parquet')).toBe('parquet');
  });

  // ── Validation ───────────────────────────────────────────────────

  it('validates a plaintext file', () => {
    const file = join(tempDir, 'corpus.txt');
    writeFileSync(file, 'Hello world. This is a test corpus with some text.');
    const result = loader.validateSource(file);
    expect(result.valid).toBe(true);
    expect(result.tokenEstimate).toBeGreaterThan(0);
    expect(result.documentCount).toBe(1);
  });

  it('validates a jsonl file', () => {
    const file = join(tempDir, 'data.jsonl');
    writeFileSync(file, '{"text":"Line one"}\n{"text":"Line two"}\n');
    const result = loader.validateSource(file, 'jsonl');
    expect(result.valid).toBe(true);
    expect(result.documentCount).toBe(2);
  });

  it('reports errors for invalid jsonl', () => {
    const file = join(tempDir, 'bad.jsonl');
    writeFileSync(file, 'not json\n{"text":"ok"}\n');
    const result = loader.validateSource(file, 'jsonl');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.documentCount).toBe(1); // one valid line
  });

  it('reports error for missing text field in jsonl', () => {
    const file = join(tempDir, 'notext.jsonl');
    writeFileSync(file, '{"content":"hello"}\n');
    const result = loader.validateSource(file, 'jsonl', 'text');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('missing');
  });

  it('validates a csv file', () => {
    const file = join(tempDir, 'data.csv');
    writeFileSync(file, 'id,text\n1,hello world\n2,another line\n');
    const result = loader.validateSource(file, 'csv');
    expect(result.valid).toBe(true);
    expect(result.documentCount).toBe(2);
  });

  it('reports error for csv missing text column', () => {
    const file = join(tempDir, 'bad.csv');
    writeFileSync(file, 'id,content\n1,hello\n');
    const result = loader.validateSource(file, 'csv', 'text');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('missing');
  });

  it('validates a directory of files', () => {
    writeFileSync(join(tempDir, 'a.txt'), 'First document');
    writeFileSync(join(tempDir, 'b.txt'), 'Second document');
    const result = loader.validateSource(tempDir);
    expect(result.valid).toBe(true);
    expect(result.documentCount).toBe(2);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it('reports error for empty directory', () => {
    const emptyDir = join(tempDir, 'empty');
    mkdirSync(emptyDir);
    const result = loader.validateSource(emptyDir);
    expect(result.valid).toBe(false);
  });

  it('reports error for nonexistent path', () => {
    const result = loader.validateSource('/nonexistent/path');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Cannot access');
  });

  it('reports error for empty file', () => {
    const file = join(tempDir, 'empty.txt');
    writeFileSync(file, '');
    const result = loader.validateSource(file, 'plaintext');
    expect(result.valid).toBe(false);
  });

  // ── Source Registry ──────────────────────────────────────────────

  it('registers and retrieves a source', () => {
    const source = {
      id: 'src-1', name: 'Wiki', format: 'jsonl' as const,
      path: '/data/wiki.jsonl', sizeBytes: 1000, tokenCount: 250,
      documentCount: 10, textField: 'text', validated: true, addedAt: Date.now(),
    };
    loader.registerSource(source);
    expect(loader.getSource('src-1')).toEqual(source);
  });

  it('lists all sources', () => {
    loader.registerSource({ id: 'a', name: 'A', format: 'plaintext', path: '/a', sizeBytes: 0, tokenCount: 0, documentCount: 0, textField: 'text', validated: true, addedAt: 0 });
    loader.registerSource({ id: 'b', name: 'B', format: 'jsonl', path: '/b', sizeBytes: 0, tokenCount: 0, documentCount: 0, textField: 'text', validated: true, addedAt: 0 });
    expect(loader.listSources()).toHaveLength(2);
  });

  it('removes a source', () => {
    loader.registerSource({ id: 'x', name: 'X', format: 'plaintext', path: '/x', sizeBytes: 0, tokenCount: 0, documentCount: 0, textField: 'text', validated: true, addedAt: 0 });
    expect(loader.removeSource('x')).toBe(true);
    expect(loader.getSource('x')).toBeNull();
  });

  it('returns false when removing nonexistent source', () => {
    expect(loader.removeSource('nope')).toBe(false);
  });

  // ── Stats ────────────────────────────────────────────────────────

  it('computes aggregate stats', () => {
    loader.registerSource({ id: 'a', name: 'A', format: 'plaintext', path: '/a', sizeBytes: 1000, tokenCount: 250, documentCount: 5, textField: 'text', validated: true, addedAt: 0 });
    loader.registerSource({ id: 'b', name: 'B', format: 'jsonl', path: '/b', sizeBytes: 2000, tokenCount: 500, documentCount: 10, textField: 'text', validated: true, addedAt: 0 });
    const stats = loader.getStats();
    expect(stats.totalSources).toBe(2);
    expect(stats.totalTokens).toBe(750);
    expect(stats.totalDocuments).toBe(15);
    expect(stats.totalSizeBytes).toBe(3000);
    expect(stats.formatBreakdown.plaintext).toBe(1);
    expect(stats.formatBreakdown.jsonl).toBe(1);
  });
});
