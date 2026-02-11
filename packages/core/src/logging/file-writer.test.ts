import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AppendOnlyLogWriter } from './file-writer.js';

describe('AppendOnlyLogWriter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'file-writer-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should write JSONL entries to the file', () => {
    const filePath = join(tmpDir, 'test.jsonl');
    const writer = new AppendOnlyLogWriter(filePath);

    writer.write({ level: 'info', message: 'hello' });
    writer.write({ level: 'error', message: 'oops' });
    writer.close();

    const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ level: 'info', message: 'hello' });
    expect(JSON.parse(lines[1])).toEqual({ level: 'error', message: 'oops' });
  });

  it('should create parent directories if they do not exist', () => {
    const filePath = join(tmpDir, 'deep', 'nested', 'dir', 'test.jsonl');
    const writer = new AppendOnlyLogWriter(filePath);

    writer.write({ ok: true });
    writer.close();

    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8').trim();
    expect(JSON.parse(content)).toEqual({ ok: true });
  });

  it('should return the current file path', () => {
    const filePath = join(tmpDir, 'path.jsonl');
    const writer = new AppendOnlyLogWriter(filePath);

    expect(writer.getCurrentPath()).toBe(filePath);
    writer.close();
  });

  it('should throw when writing after close', () => {
    const filePath = join(tmpDir, 'closed.jsonl');
    const writer = new AppendOnlyLogWriter(filePath);
    writer.close();

    expect(() => writer.write({ a: 1 })).toThrow('Writer is closed');
  });

  it('should support close followed by reopen', () => {
    const filePath = join(tmpDir, 'reopen.jsonl');
    const writer = new AppendOnlyLogWriter(filePath);

    writer.write({ phase: 1 });
    writer.close();

    // reopen and append more
    writer.reopen();
    writer.write({ phase: 2 });
    writer.close();

    const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ phase: 1 });
    expect(JSON.parse(lines[1])).toEqual({ phase: 2 });
  });

  it('should handle entries with special characters', () => {
    const filePath = join(tmpDir, 'special.jsonl');
    const writer = new AppendOnlyLogWriter(filePath);

    writer.write({ msg: 'line\nbreak', emoji: '\u2603', quotes: '"hello"' });
    writer.close();

    const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.msg).toBe('line\nbreak');
    expect(parsed.quotes).toBe('"hello"');
  });

  it('should handle concurrent sequential writes without corruption', () => {
    const filePath = join(tmpDir, 'concurrent.jsonl');
    const writer = new AppendOnlyLogWriter(filePath);

    const count = 200;
    for (let i = 0; i < count; i++) {
      writer.write({ index: i });
    }
    writer.close();

    const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(count);

    // Every line must parse successfully
    for (let i = 0; i < count; i++) {
      const parsed = JSON.parse(lines[i]);
      expect(parsed.index).toBe(i);
    }
  });

  it('should produce valid JSONL with nested objects and arrays', () => {
    const filePath = join(tmpDir, 'nested.jsonl');
    const writer = new AppendOnlyLogWriter(filePath);

    const entry = {
      level: 'debug',
      metadata: { tags: ['a', 'b'], nested: { x: 1 } },
      list: [1, 2, 3],
    };
    writer.write(entry);
    writer.close();

    const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(entry);
  });
});
