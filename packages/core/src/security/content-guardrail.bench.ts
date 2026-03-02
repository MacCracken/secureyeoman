/**
 * Content Guardrail Performance Benchmarks
 *
 * PII scanning, block-list matching, and redaction at various text sizes.
 *
 * Run:  cd packages/core && npx vitest bench
 */

import { bench, describe } from 'vitest';
import { ContentGuardrail } from './content-guardrail.js';
import type { ContentGuardrailConfig } from '@secureyeoman/shared';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ContentGuardrailConfig> = {}): ContentGuardrailConfig {
  return {
    enabled: true,
    piiMode: 'redact',
    toxicityEnabled: false,
    toxicityMode: 'warn',
    toxicityThreshold: 0.7,
    blockList: ['forbidden', 'regex:secret\\s+key'],
    blockedTopics: [],
    topicThreshold: 0.75,
    groundingEnabled: false,
    groundingMode: 'flag',
    ...overrides,
  };
}

const deps = { brainManager: null, auditRecord: () => {} };
const ctx = { source: 'bench' };

const guardrail = new ContentGuardrail(makeConfig(), deps);
const detectOnly = new ContentGuardrail(makeConfig({ piiMode: 'detect_only' }), deps);

const CLEAN_100 = 'The quick brown fox jumps over the lazy dog. '.repeat(2).slice(0, 100);
const CLEAN_1000 = CLEAN_100.repeat(10);
const CLEAN_5000 = CLEAN_100.repeat(50);

const PII_TEXT = 'Contact alice@example.com or call 555-123-4567. SSN: 123-45-6789. Card: 4111-1111-1111-1111.';
const PII_LONG = PII_TEXT.repeat(10);

const BLOCK_HIT = 'This contains a forbidden word and a secret key value.';

// ── Benchmarks ────────────────────────────────────────────────────────────────

describe('ContentGuardrail.scanSync — clean text', () => {
  bench('100 chars', () => {
    guardrail.scanSync(CLEAN_100, ctx);
  });

  bench('1000 chars', () => {
    guardrail.scanSync(CLEAN_1000, ctx);
  });

  bench('5000 chars', () => {
    guardrail.scanSync(CLEAN_5000, ctx);
  });
});

describe('ContentGuardrail.scanSync — PII redaction', () => {
  bench('PII text (93 chars)', () => {
    guardrail.scanSync(PII_TEXT, ctx);
  });

  bench('PII text long (930 chars)', () => {
    guardrail.scanSync(PII_LONG, ctx);
  });

  bench('PII detect-only (no redaction)', () => {
    detectOnly.scanSync(PII_TEXT, ctx);
  });
});

describe('ContentGuardrail.scanSync — block list', () => {
  bench('block list hit', () => {
    guardrail.scanSync(BLOCK_HIT, ctx);
  });

  bench('block list miss (clean 1000)', () => {
    guardrail.scanSync(CLEAN_1000, ctx);
  });
});
