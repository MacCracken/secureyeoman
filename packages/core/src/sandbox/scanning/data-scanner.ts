/**
 * Data Scanner — Detects polyglot files, embedded executables,
 * serialization attacks, oversized payloads, formula injection (Phase 116-A)
 */

import { randomUUID } from 'node:crypto';
import type { ScanFinding } from '@secureyeoman/shared';
import type { ArtifactScanner, SandboxArtifact } from './types.js';

const MAX_FINDINGS = 200;

/** Number of leading bytes to sample for binary-content (polyglot) detection. */
const POLYGLOT_SAMPLE_SIZE = 512;

// ── Magic bytes for executable detection ──
const MAGIC_BYTES: { name: string; bytes: number[]; severity: ScanFinding['severity'] }[] = [
  { name: 'ELF executable', bytes: [0x7f, 0x45, 0x4c, 0x46], severity: 'critical' },
  { name: 'PE executable (MZ)', bytes: [0x4d, 0x5a], severity: 'critical' },
  { name: 'Mach-O 64-bit', bytes: [0xcf, 0xfa, 0xed, 0xfe], severity: 'critical' },
  { name: 'Mach-O 32-bit', bytes: [0xce, 0xfa, 0xed, 0xfe], severity: 'critical' },
  { name: 'Java class file', bytes: [0xca, 0xfe, 0xba, 0xbe], severity: 'high' },
  { name: 'WebAssembly module', bytes: [0x00, 0x61, 0x73, 0x6d], severity: 'high' },
  { name: 'Gzip archive', bytes: [0x1f, 0x8b], severity: 'medium' },
  { name: 'ZIP archive', bytes: [0x50, 0x4b, 0x03, 0x04], severity: 'medium' },
  { name: 'RAR archive', bytes: [0x52, 0x61, 0x72, 0x21], severity: 'medium' },
];

// ── Serialization attack patterns ──
interface SerializationPattern {
  id: string;
  name: string;
  severity: ScanFinding['severity'];
  pattern: RegExp | ((buf: Buffer) => boolean);
  message: string;
}

const SERIALIZATION_PATTERNS: SerializationPattern[] = [
  {
    id: 'serial-pickle',
    name: 'Python pickle',
    severity: 'critical',
    pattern: (buf: Buffer) => {
      for (let i = 0; i < buf.length - 1; i++) {
        const byte = buf[i]!;
        if (byte === 0x80 && buf[i + 1]! >= 0x02 && buf[i + 1]! <= 0x05) return true;
      }
      return false;
    },
    message: 'Python pickle payload detected — arbitrary code execution risk',
  },
  {
    id: 'serial-java',
    name: 'Java serialization',
    severity: 'critical',
    pattern: (buf: Buffer) => buf.length >= 2 && buf[0] === 0xac && buf[1] === 0xed,
    message: 'Java serialized object detected — deserialization attack risk',
  },
  {
    id: 'serial-php',
    name: 'PHP serialization',
    severity: 'high',
    pattern: /(?:^|[^a-z])O:\d+:"[A-Za-z_]/,
    message: 'PHP serialized object detected — object injection risk',
  },
  {
    id: 'serial-yaml-exec',
    name: 'YAML code execution',
    severity: 'critical',
    pattern: /!!python\/object|!!python\/apply|!!ruby\/object/,
    message: 'YAML deserialization with code execution tag detected',
  },
  {
    id: 'serial-node-serialize',
    name: 'Node.js serialize-javascript',
    severity: 'critical',
    pattern: /_\$\$ND_FUNC\$\$/,
    message: 'Node.js serialize-javascript function injection detected',
  },
];

// ── Formula injection in CSV/JSONL ──
const FORMULA_PATTERN = /^[=+\-@]\s*(?:cmd|system|exec|import|DDE|WEBSERVICE|HYPERLINK)\s*\(/i;
const FORMULA_SIMPLE = /^[=+\-@]/;

export class DataScanner implements ArtifactScanner {
  readonly name = 'data-scanner';
  readonly version = '1.0.0';

  async scan(artifact: SandboxArtifact, signal?: AbortSignal): Promise<ScanFinding[]> {
    const findings: ScanFinding[] = [];

    const buf =
      typeof artifact.content === 'string'
        ? Buffer.from(artifact.content, 'utf-8')
        : artifact.content;

    // Check size
    if (artifact.sizeBytes > 52_428_800) {
      findings.push({
        id: randomUUID(),
        scanner: this.name,
        severity: 'high',
        category: 'oversized',
        message: `Artifact exceeds 50MB size limit (${(artifact.sizeBytes / 1_048_576).toFixed(1)}MB)`,
      });
    }

    if (signal?.aborted) return findings;

    // Embedded executable detection via magic bytes
    this.scanMagicBytes(buf, findings);
    if (signal?.aborted || findings.length >= MAX_FINDINGS) return findings;

    // Polyglot detection (type mismatch)
    this.scanPolyglot(artifact, buf, findings);
    if (signal?.aborted || findings.length >= MAX_FINDINGS) return findings;

    // Serialization attack detection
    this.scanSerialization(buf, findings);
    if (signal?.aborted || findings.length >= MAX_FINDINGS) return findings;

    // Formula injection for CSV/JSONL content
    const contentStr =
      typeof artifact.content === 'string' ? artifact.content : artifact.content.toString('utf-8');
    this.scanFormulaInjection(artifact, contentStr, findings);

    return findings.slice(0, MAX_FINDINGS);
  }

  private scanMagicBytes(buf: Buffer, findings: ScanFinding[]): void {
    for (const magic of MAGIC_BYTES) {
      if (findings.length >= MAX_FINDINGS) break;
      if (buf.length < magic.bytes.length) continue;
      let match = true;
      for (let i = 0; i < magic.bytes.length; i++) {
        if (buf[i] !== magic.bytes[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        findings.push({
          id: randomUUID(),
          scanner: this.name,
          severity: magic.severity,
          category: 'embedded_executable',
          message: `Embedded ${magic.name} detected`,
          recommendation: 'Executable content should not appear in sandbox outputs',
        });
      }
    }
  }

  private scanPolyglot(artifact: SandboxArtifact, buf: Buffer, findings: ScanFinding[]): void {
    if (!artifact.type || findings.length >= MAX_FINDINGS) return;

    const declaredText = artifact.type.startsWith('text/') || artifact.type === 'application/json';
    if (declaredText) {
      // Check if content actually looks binary
      const sample = buf.subarray(0, Math.min(POLYGLOT_SAMPLE_SIZE, buf.length));
      let nullCount = 0;
      for (const b of sample) {
        if (b === 0) nullCount++;
      }
      if (nullCount > 5) {
        findings.push({
          id: randomUUID(),
          scanner: this.name,
          severity: 'high',
          category: 'polyglot',
          message: `Polyglot file: declared as ${artifact.type} but contains binary data`,
          recommendation: 'Verify file type matches actual content',
        });
      }
    }
  }

  private scanSerialization(buf: Buffer, findings: ScanFinding[]): void {
    const contentStr = buf.toString('utf-8').substring(0, 100_000); // Limit scan range

    for (const sp of SERIALIZATION_PATTERNS) {
      if (findings.length >= MAX_FINDINGS) break;
      let matched = false;
      if (typeof sp.pattern === 'function') {
        matched = sp.pattern(buf);
      } else {
        matched = sp.pattern.test(contentStr);
      }
      if (matched) {
        findings.push({
          id: randomUUID(),
          scanner: this.name,
          severity: sp.severity,
          category: 'serialization_attack',
          message: sp.message,
          recommendation: 'Do not deserialize untrusted data',
        });
      }
    }
  }

  private scanFormulaInjection(
    artifact: SandboxArtifact,
    content: string,
    findings: ScanFinding[]
  ): void {
    const isCsvOrJsonl =
      artifact.type?.includes('csv') ||
      artifact.filename?.endsWith('.csv') ||
      artifact.type?.includes('jsonl') ||
      artifact.filename?.endsWith('.jsonl');

    if (!isCsvOrJsonl) return;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length && findings.length < MAX_FINDINGS; i++) {
      const line = (lines[i] ?? '').trim();
      if (!line) continue;

      // Check each cell in CSV (split by comma)
      const cells = line.split(',');
      for (const cell of cells) {
        if (findings.length >= MAX_FINDINGS) break;
        const trimmedCell = cell.trim().replace(/^["']|["']$/g, '');
        if (FORMULA_PATTERN.test(trimmedCell)) {
          findings.push({
            id: randomUUID(),
            scanner: this.name,
            severity: 'high',
            category: 'formula_injection',
            message: 'CSV formula injection with function call detected',
            line: i + 1,
            evidence: trimmedCell.substring(0, 100),
            cwe: 'CWE-1236',
            recommendation:
              "Prefix cell values with a single quote (') to prevent formula execution",
          });
        } else if (FORMULA_SIMPLE.test(trimmedCell) && trimmedCell.length > 2) {
          findings.push({
            id: randomUUID(),
            scanner: this.name,
            severity: 'low',
            category: 'formula_injection',
            message: 'Cell starts with formula trigger character',
            line: i + 1,
            evidence: trimmedCell.substring(0, 100),
            cwe: 'CWE-1236',
          });
        }
      }
    }
  }
}
