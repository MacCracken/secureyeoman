/**
 * SecretsFilter Performance Benchmarks
 *
 * Filter with varying secret counts and input lengths.
 *
 * Run:  cd packages/core && npx vitest bench
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import { createSecretsFilter } from './secrets-filter.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const _savedEnv = { ...process.env };

function setupSecrets(count: number): void {
  for (let i = 0; i < count; i++) {
    process.env[`BENCH_${i}_API_KEY`] = `secret_value_bench_${i}_xyz`;
  }
}

function cleanupSecrets(count: number): void {
  for (let i = 0; i < count; i++) {
    delete process.env[`BENCH_${i}_API_KEY`];
  }
}

const SHORT_INPUT = 'Log line with secret_value_bench_0_xyz in it';
const MEDIUM_INPUT = 'Processing request. '.repeat(50) + 'secret_value_bench_0_xyz found.';
const LONG_INPUT = 'Data processing log entry with details. '.repeat(200);

// ── Benchmarks ────────────────────────────────────────────────────────────────

describe('SecretsFilter — 10 secrets', () => {
  let filter: (line: string) => string;

  beforeEach(() => {
    setupSecrets(10);
    filter = createSecretsFilter();
  });

  afterEach(() => {
    cleanupSecrets(10);
  });

  bench('short input (hit)', () => {
    filter(SHORT_INPUT);
  });

  bench('medium input (hit)', () => {
    filter(MEDIUM_INPUT);
  });

  bench('long input (miss)', () => {
    filter(LONG_INPUT);
  });
});

describe('SecretsFilter — 50 secrets', () => {
  let filter: (line: string) => string;

  beforeEach(() => {
    setupSecrets(50);
    filter = createSecretsFilter();
  });

  afterEach(() => {
    cleanupSecrets(50);
  });

  bench('short input', () => {
    filter(SHORT_INPUT);
  });

  bench('medium input', () => {
    filter(MEDIUM_INPUT);
  });
});

describe('SecretsFilter — 200 secrets (at cap)', () => {
  let filter: (line: string) => string;

  beforeEach(() => {
    setupSecrets(200);
    filter = createSecretsFilter();
  });

  afterEach(() => {
    cleanupSecrets(200);
  });

  bench('short input', () => {
    filter(SHORT_INPUT);
  });

  bench('medium input', () => {
    filter(MEDIUM_INPUT);
  });
});
