/**
 * Bundle Compiler — validates and compiles policy bundles.
 *
 * Validates Rego syntax (via OPA compile endpoint) and CEL expressions
 * (via local parser). Produces a compiled PolicyBundle with validation status.
 */

import { createHash } from 'node:crypto';
import type { OpaClient } from '../intent/opa-client.js';
import { evalCel } from '../intent/cel-evaluator.js';
import type {
  PolicyBundle,
  PolicyFile,
  BundleMetadata,
  PolicyLanguage,
  PolicyAsCodeConfig,
} from '@secureyeoman/shared';
import { errorToString } from '../utils/errors.js';

export interface CompileResult {
  bundle: PolicyBundle;
  valid: boolean;
  errors: string[];
}

export class BundleCompiler {
  constructor(
    private readonly opaClient: OpaClient | null,
    private readonly config: PolicyAsCodeConfig
  ) {}

  /**
   * Compile a bundle from raw policy files. Validates each file and
   * produces a PolicyBundle with validation status.
   */
  async compile(
    bundleId: string,
    metadata: BundleMetadata,
    files: { path: string; language: PolicyLanguage; source: string }[],
    commitSha = '',
    ref = 'main'
  ): Promise<CompileResult> {
    const errors: string[] = [];
    const compiled: PolicyFile[] = [];

    // Validate bundle-level constraints
    if (files.length > this.config.maxBundleFiles) {
      errors.push(`Bundle exceeds max files (${files.length} > ${this.config.maxBundleFiles})`);
    }

    for (const file of files) {
      // Size check
      const sizeBytes = Buffer.byteLength(file.source, 'utf-8');
      if (sizeBytes > this.config.maxFileSizeBytes) {
        errors.push(
          `${file.path}: exceeds max size (${sizeBytes} > ${this.config.maxFileSizeBytes} bytes)`
        );
        continue;
      }

      // Language-specific validation
      const fileErrors =
        file.language === 'rego'
          ? await this.validateRego(file.path, file.source)
          : this.validateCel(file.path, file.source);

      if (fileErrors.length > 0) {
        errors.push(...fileErrors);
        continue;
      }

      const sha256 = createHash('sha256').update(file.source).digest('hex');
      compiled.push({
        path: file.path,
        language: file.language,
        source: file.source,
        sha256,
      });
    }

    const valid = errors.length === 0;
    const bundle: PolicyBundle = {
      id: bundleId,
      metadata,
      files: compiled,
      commitSha,
      ref,
      compiledAt: Date.now(),
      valid,
      validationErrors: errors,
    };

    return { bundle, valid, errors };
  }

  /**
   * Validate a Rego policy file. If OPA is available, attempts a compile check.
   * Falls back to basic syntax heuristics when OPA is unavailable.
   */
  private async validateRego(path: string, source: string): Promise<string[]> {
    const errors: string[] = [];

    // Basic syntax checks
    if (!source.includes('package ')) {
      errors.push(`${path}: Rego file missing 'package' declaration`);
    }

    // If OPA is available, do a compile check by uploading and deleting
    if (this.opaClient) {
      const tempId = `__validate_${Date.now()}`;
      try {
        await this.opaClient.uploadPolicy(tempId, source);
        await this.opaClient.deletePolicy(tempId);
      } catch (err) {
        errors.push(
          `${path}: OPA compile error — ${errorToString(err)}`
        );
      }
    }

    return errors;
  }

  /**
   * Validate a CEL expression file. Each line is treated as a separate
   * expression (blank lines and comments starting with # are skipped).
   */
  private validateCel(path: string, source: string): string[] {
    const errors: string[] = [];
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line || line.startsWith('#')) continue;

      // Try parsing the expression with an empty context
      try {
        evalCel(line, {});
      } catch (err) {
        errors.push(
          `${path}:${i + 1}: CEL parse error — ${errorToString(err)}`
        );
      }
    }

    return errors;
  }

  /** Compute SHA-256 hash of a string. */
  static hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
