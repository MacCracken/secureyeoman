import { describe, it, expect } from 'vitest';
import { DataScanner } from './data-scanner.js';
import type { SandboxArtifact } from './types.js';
import { randomUUID } from 'node:crypto';

function makeArtifact(
  content: string | Buffer,
  overrides: Partial<SandboxArtifact> = {},
): SandboxArtifact {
  const buf = typeof content === 'string' ? Buffer.from(content) : content;
  return {
    id: randomUUID(),
    type: 'text/plain',
    content,
    sourceContext: 'test',
    sizeBytes: buf.length,
    ...overrides,
  };
}

describe('DataScanner', () => {
  const scanner = new DataScanner();

  it('has correct name and version', () => {
    expect(scanner.name).toBe('data-scanner');
    expect(scanner.version).toBe('1.0.0');
  });

  // ── Size checks ──
  describe('oversized payloads', () => {
    it('flags artifacts > 50MB', async () => {
      const art = makeArtifact('small', { sizeBytes: 60_000_000 });
      const findings = await scanner.scan(art);
      expect(findings.some((f) => f.category === 'oversized')).toBe(true);
    });

    it('does not flag normal-sized artifacts', async () => {
      const findings = await scanner.scan(makeArtifact('normal content'));
      expect(findings.some((f) => f.category === 'oversized')).toBe(false);
    });
  });

  // ── Embedded Executables ──
  describe('embedded executables', () => {
    it('detects ELF binary', async () => {
      const buf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x00]);
      const findings = await scanner.scan(makeArtifact(buf));
      expect(findings.some((f) => f.category === 'embedded_executable' && f.message.includes('ELF'))).toBe(true);
    });

    it('detects PE/MZ binary', async () => {
      const buf = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
      const findings = await scanner.scan(makeArtifact(buf));
      expect(findings.some((f) => f.message.includes('PE'))).toBe(true);
    });

    it('detects Mach-O 64-bit binary', async () => {
      const buf = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x07, 0x00]);
      const findings = await scanner.scan(makeArtifact(buf));
      expect(findings.some((f) => f.message.includes('Mach-O 64'))).toBe(true);
    });

    it('detects Java class file', async () => {
      const buf = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00]);
      const findings = await scanner.scan(makeArtifact(buf));
      expect(findings.some((f) => f.message.includes('Java'))).toBe(true);
    });

    it('detects WebAssembly module', async () => {
      const buf = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00]);
      const findings = await scanner.scan(makeArtifact(buf));
      expect(findings.some((f) => f.message.includes('WebAssembly'))).toBe(true);
    });

    it('detects ZIP archive', async () => {
      const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
      const findings = await scanner.scan(makeArtifact(buf));
      expect(findings.some((f) => f.message.includes('ZIP'))).toBe(true);
    });

    it('does not flag clean text content', async () => {
      const findings = await scanner.scan(makeArtifact('Hello, world!'));
      expect(findings.some((f) => f.category === 'embedded_executable')).toBe(false);
    });
  });

  // ── Polyglot Detection ──
  describe('polyglot detection', () => {
    it('flags text type with binary content', async () => {
      const buf = Buffer.alloc(100);
      for (let i = 0; i < 20; i++) buf[i * 5] = 0; // lots of null bytes
      const findings = await scanner.scan(makeArtifact(buf, { type: 'text/javascript' }));
      expect(findings.some((f) => f.category === 'polyglot')).toBe(true);
    });

    it('flags JSON type with binary content', async () => {
      const buf = Buffer.alloc(100);
      for (let i = 0; i < 10; i++) buf[i * 10] = 0;
      const findings = await scanner.scan(makeArtifact(buf, { type: 'application/json' }));
      expect(findings.some((f) => f.category === 'polyglot')).toBe(true);
    });

    it('does not flag binary type with binary content', async () => {
      const buf = Buffer.alloc(100);
      for (let i = 0; i < 10; i++) buf[i * 10] = 0;
      const findings = await scanner.scan(makeArtifact(buf, { type: 'application/octet-stream' }));
      expect(findings.some((f) => f.category === 'polyglot')).toBe(false);
    });
  });

  // ── Serialization Attacks ──
  describe('serialization attacks', () => {
    it('detects Python pickle protocol 2', async () => {
      const buf = Buffer.from([0x80, 0x02, 0x63, 0x6f, 0x73]); // \x80\x02cos
      const findings = await scanner.scan(makeArtifact(buf));
      expect(findings.some((f) => f.category === 'serialization_attack' && f.message.includes('pickle'))).toBe(true);
    });

    it('detects Java serialized object', async () => {
      const buf = Buffer.from([0xac, 0xed, 0x00, 0x05, 0x73]);
      const findings = await scanner.scan(makeArtifact(buf));
      expect(findings.some((f) => f.message.includes('Java serialized'))).toBe(true);
    });

    it('detects PHP serialized object', async () => {
      const findings = await scanner.scan(makeArtifact('O:8:"stdClass":0:{}'));
      expect(findings.some((f) => f.message.includes('PHP'))).toBe(true);
    });

    it('detects YAML code execution tags', async () => {
      const findings = await scanner.scan(makeArtifact('!!python/object:os.system ["whoami"]'));
      expect(findings.some((f) => f.message.includes('YAML'))).toBe(true);
    });

    it('detects Node.js serialize-javascript injection', async () => {
      const findings = await scanner.scan(makeArtifact('{"rce":"_$$ND_FUNC$$_function(){require(\'child_process\').exec(\'ls\')}"}'));
      expect(findings.some((f) => f.message.includes('serialize-javascript'))).toBe(true);
    });

    it('does not flag normal JSON', async () => {
      const findings = await scanner.scan(makeArtifact('{"key": "value", "count": 42}'));
      expect(findings.some((f) => f.category === 'serialization_attack')).toBe(false);
    });
  });

  // ── Formula Injection ──
  describe('formula injection', () => {
    it('detects CSV formula with function call', async () => {
      const findings = await scanner.scan(
        makeArtifact('name,score\n=cmd("calc"),100', { type: 'text/csv', filename: 'data.csv' })
      );
      expect(findings.some((f) => f.category === 'formula_injection' && f.severity === 'high')).toBe(true);
    });

    it('detects formula in JSONL files', async () => {
      const findings = await scanner.scan(
        makeArtifact('=HYPERLINK("http://evil.com")', { filename: 'export.jsonl' })
      );
      expect(findings.some((f) => f.category === 'formula_injection')).toBe(true);
    });

    it('detects simple formula trigger characters', async () => {
      const findings = await scanner.scan(
        makeArtifact('+1+2+3', { filename: 'data.csv' })
      );
      expect(findings.some((f) => f.category === 'formula_injection' && f.severity === 'low')).toBe(true);
    });

    it('does not flag formulas in non-CSV files', async () => {
      const findings = await scanner.scan(makeArtifact('=cmd("calc")'));
      expect(findings.some((f) => f.category === 'formula_injection')).toBe(false);
    });

    it('does not flag normal CSV content', async () => {
      const findings = await scanner.scan(
        makeArtifact('name,age\nAlice,30\nBob,25', { filename: 'data.csv' })
      );
      expect(findings.some((f) => f.category === 'formula_injection')).toBe(false);
    });
  });

  // ── Edge Cases ──
  describe('edge cases', () => {
    it('returns empty for normal text', async () => {
      const findings = await scanner.scan(makeArtifact('Hello, world!'));
      expect(findings).toEqual([]);
    });

    it('respects abort signal', async () => {
      const ac = new AbortController();
      ac.abort();
      const findings = await scanner.scan(makeArtifact('content'), ac.signal);
      // Should return early
      expect(findings.length).toBeLessThanOrEqual(1);
    });

    it('handles empty content', async () => {
      const findings = await scanner.scan(makeArtifact(''));
      expect(findings).toEqual([]);
    });

    it('handles very small buffer', async () => {
      const buf = Buffer.from([0x01]);
      const findings = await scanner.scan(makeArtifact(buf));
      expect(findings).toEqual([]);
    });
  });
});
