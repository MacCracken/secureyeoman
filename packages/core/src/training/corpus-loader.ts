/**
 * Corpus Loader — Ingests and validates text corpora for pre-training.
 *
 * Supports plaintext, JSONL, CSV, Parquet (metadata only), and Markdown
 * formats. Computes token estimates and validates corpus integrity.
 */

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { SecureLogger } from '../logging/logger.js';
import type { CorpusSource, CorpusFormat } from '@secureyeoman/shared';

export interface CorpusLoaderDeps {
  log: SecureLogger;
}

export interface CorpusValidationResult {
  valid: boolean;
  errors: string[];
  tokenEstimate: number;
  documentCount: number;
  sizeBytes: number;
}

export interface CorpusStats {
  totalSources: number;
  totalTokens: number;
  totalDocuments: number;
  totalSizeBytes: number;
  formatBreakdown: Record<string, number>;
}

// Rough token estimate: ~4 chars per token for English text
const CHARS_PER_TOKEN = 4;

export class CorpusLoader {
  private readonly log: SecureLogger;
  private readonly sources = new Map<string, CorpusSource>();

  constructor(deps: CorpusLoaderDeps) {
    this.log = deps.log;
  }

  /** Detect format from file extension. */
  detectFormat(path: string): CorpusFormat {
    const ext = extname(path).toLowerCase();
    switch (ext) {
      case '.jsonl':
      case '.ndjson':
        return 'jsonl';
      case '.parquet':
        return 'parquet';
      case '.csv':
      case '.tsv':
        return 'csv';
      case '.md':
      case '.markdown':
        return 'markdown';
      default:
        return 'plaintext';
    }
  }

  /** Validate a corpus source file/directory. */
  validateSource(path: string, format?: CorpusFormat, textField = 'text'): CorpusValidationResult {
    const errors: string[] = [];
    let totalChars = 0;
    let documentCount = 0;
    let sizeBytes = 0;

    try {
      const stat = statSync(path);

      if (stat.isDirectory()) {
        const files = readdirSync(path).filter((f) => !f.startsWith('.'));
        if (files.length === 0) {
          errors.push('Directory is empty');
          return { valid: false, errors, tokenEstimate: 0, documentCount: 0, sizeBytes: 0 };
        }
        for (const file of files) {
          const filePath = join(path, file);
          const fileStat = statSync(filePath);
          if (!fileStat.isFile()) continue;
          sizeBytes += fileStat.size;
          const result = this.validateSingleFile(filePath, format ?? this.detectFormat(filePath), textField);
          totalChars += result.chars;
          documentCount += result.documents;
          errors.push(...result.errors);
        }
      } else {
        sizeBytes = stat.size;
        const result = this.validateSingleFile(path, format ?? this.detectFormat(path), textField);
        totalChars = result.chars;
        documentCount = result.documents;
        errors.push(...result.errors);
      }
    } catch (err) {
      errors.push(`Cannot access path: ${(err as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      tokenEstimate: Math.floor(totalChars / CHARS_PER_TOKEN),
      documentCount,
      sizeBytes,
    };
  }

  /** Register a validated corpus source. */
  registerSource(source: CorpusSource): void {
    this.sources.set(source.id, source);
    this.log.info('Corpus source registered', { sourceId: source.id, name: source.name, format: source.format });
  }

  /** Get a registered source by ID. */
  getSource(id: string): CorpusSource | null {
    return this.sources.get(id) ?? null;
  }

  /** List all registered sources. */
  listSources(): CorpusSource[] {
    return [...this.sources.values()];
  }

  /** Remove a registered source. */
  removeSource(id: string): boolean {
    const deleted = this.sources.delete(id);
    if (deleted) this.log.info('Corpus source removed', { sourceId: id });
    return deleted;
  }

  /** Get aggregate stats across all registered sources. */
  getStats(): CorpusStats {
    const formatBreakdown: Record<string, number> = {};
    let totalTokens = 0;
    let totalDocuments = 0;
    let totalSizeBytes = 0;

    for (const source of this.sources.values()) {
      totalTokens += source.tokenCount;
      totalDocuments += source.documentCount;
      totalSizeBytes += source.sizeBytes;
      formatBreakdown[source.format] = (formatBreakdown[source.format] ?? 0) + 1;
    }

    return {
      totalSources: this.sources.size,
      totalTokens,
      totalDocuments,
      totalSizeBytes,
      formatBreakdown,
    };
  }

  // ── Private ────────────────────────────────────────────────────

  private validateSingleFile(
    filePath: string,
    format: CorpusFormat,
    textField: string
  ): { chars: number; documents: number; errors: string[] } {
    const errors: string[] = [];
    let chars = 0;
    let documents = 0;

    try {
      if (format === 'parquet') {
        // Parquet: can't read natively in Node, just validate existence
        documents = 1;
        const stat = statSync(filePath);
        chars = Math.floor(stat.size * 0.6); // rough estimate
        return { chars, documents, errors };
      }

      const content = readFileSync(filePath, 'utf-8');

      switch (format) {
        case 'jsonl': {
          const lines = content.split('\n').filter((l) => l.trim());
          for (let i = 0; i < lines.length; i++) {
            try {
              const obj = JSON.parse(lines[i]!);
              const text = obj[textField];
              if (typeof text !== 'string') {
                errors.push(`Line ${i + 1}: missing or non-string "${textField}" field`);
                continue;
              }
              chars += text.length;
              documents++;
            } catch {
              errors.push(`Line ${i + 1}: invalid JSON`);
            }
          }
          break;
        }
        case 'csv': {
          const lines = content.split('\n').filter((l) => l.trim());
          if (lines.length < 2) {
            errors.push('CSV must have at least a header and one data row');
          } else {
            const header = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
            const textIdx = header.indexOf(textField);
            if (textIdx === -1) {
              errors.push(`CSV header missing "${textField}" column`);
            } else {
              for (let i = 1; i < lines.length; i++) {
                const cols = lines[i]!.split(',');
                const text = cols[textIdx]?.replace(/^"|"$/g, '') ?? '';
                chars += text.length;
                documents++;
              }
            }
          }
          break;
        }
        case 'plaintext':
        case 'markdown':
        default:
          chars = content.length;
          documents = 1;
          if (content.trim().length === 0) {
            errors.push('File is empty');
          }
          break;
      }
    } catch (err) {
      errors.push(`Cannot read file: ${(err as Error).message}`);
    }

    return { chars, documents, errors };
  }
}
