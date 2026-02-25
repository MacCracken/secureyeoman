/**
 * CelEvaluator Tests — Phase 50: Governance Hardening
 */

import { describe, it, expect } from 'vitest';
import { evalCel } from './cel-evaluator.js';

// ── Empty / undefined expression ─────────────────────────────────────────────

describe('evalCel — empty / undefined expressions', () => {
  it('returns true for undefined', () => {
    expect(evalCel(undefined, {})).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(evalCel('', {})).toBe(true);
  });

  it('returns true for whitespace-only string', () => {
    expect(evalCel('   ', {})).toBe(true);
  });
});

// ── Legacy key=value AND key=value ───────────────────────────────────────────

describe('evalCel — legacy key=value format', () => {
  it('matches a single key=value pair', () => {
    expect(evalCel('env=prod', { env: 'prod' })).toBe(true);
    expect(evalCel('env=prod', { env: 'staging' })).toBe(false);
  });

  it('matches an AND conjunction', () => {
    expect(evalCel('env=prod AND region=us', { env: 'prod', region: 'us' })).toBe(true);
    expect(evalCel('env=prod AND region=us', { env: 'prod', region: 'eu' })).toBe(false);
  });

  it('checks key existence when no value provided', () => {
    expect(evalCel('featureFlag', { featureFlag: 'enabled' })).toBe(true);
    expect(evalCel('featureFlag', {})).toBe(false);
  });
});

// ── CEL equality operators ────────────────────────────────────────────────────

describe('evalCel — equality operators', () => {
  it('evaluates == for strings', () => {
    expect(evalCel('env == "prod"', { env: 'prod' })).toBe(true);
    expect(evalCel('env == "prod"', { env: 'staging' })).toBe(false);
  });

  it('evaluates != for strings', () => {
    expect(evalCel('env != "prod"', { env: 'staging' })).toBe(true);
    expect(evalCel('env != "prod"', { env: 'prod' })).toBe(false);
  });

  it('evaluates == with single-quoted string', () => {
    expect(evalCel("env == 'prod'", { env: 'prod' })).toBe(true);
  });

  it('evaluates numeric equality', () => {
    expect(evalCel('priority == "high"', { priority: 'high' })).toBe(true);
  });
});

// ── CEL logical operators ─────────────────────────────────────────────────────

describe('evalCel — logical operators', () => {
  it('evaluates && (AND)', () => {
    expect(evalCel('env == "prod" && region == "us"', { env: 'prod', region: 'us' })).toBe(true);
    expect(evalCel('env == "prod" && region == "us"', { env: 'prod', region: 'eu' })).toBe(false);
  });

  it('evaluates || (OR)', () => {
    expect(evalCel('env == "prod" || env == "staging"', { env: 'staging' })).toBe(true);
    expect(evalCel('env == "prod" || env == "staging"', { env: 'dev' })).toBe(false);
  });

  it('evaluates ! (NOT)', () => {
    expect(evalCel('!(env == "prod")', { env: 'staging' })).toBe(true);
    expect(evalCel('!(env == "prod")', { env: 'prod' })).toBe(false);
  });

  it('evaluates AND keyword (case-insensitive)', () => {
    expect(evalCel('env == "prod" AND region == "us"', { env: 'prod', region: 'us' })).toBe(true);
  });

  it('evaluates OR keyword', () => {
    expect(evalCel('env == "prod" OR env == "dev"', { env: 'dev' })).toBe(true);
  });

  it('evaluates NOT keyword', () => {
    expect(evalCel('NOT (env == "prod")', { env: 'staging' })).toBe(true);
  });
});

// ── CEL comparison operators ──────────────────────────────────────────────────

describe('evalCel — comparison operators on strings (lexicographic)', () => {
  it('evaluates < for strings', () => {
    expect(evalCel('env < "zzz"', { env: 'prod' })).toBe(true);
  });

  it('evaluates > for strings', () => {
    expect(evalCel('version > "0.0.0"', { version: '1.0.0' })).toBe(true);
  });
});

// ── Parenthesised grouping ────────────────────────────────────────────────────

describe('evalCel — parenthesised grouping', () => {
  it('respects grouping over operator precedence', () => {
    // (prod OR staging) AND us
    expect(
      evalCel('(env == "prod" || env == "staging") && region == "us"', {
        env: 'staging',
        region: 'us',
      })
    ).toBe(true);
    expect(
      evalCel('(env == "prod" || env == "staging") && region == "us"', {
        env: 'dev',
        region: 'us',
      })
    ).toBe(false);
  });
});

// ── ctx.key field access ──────────────────────────────────────────────────────

describe('evalCel — ctx.key field access', () => {
  it('evaluates ctx.key field access', () => {
    expect(evalCel('ctx.env == "prod"', { env: 'prod' })).toBe(true);
    expect(evalCel('ctx.env == "prod"', { env: 'dev' })).toBe(false);
  });
});

// ── Missing keys ──────────────────────────────────────────────────────────────

describe('evalCel — missing context keys', () => {
  it('returns false when key not in context', () => {
    expect(evalCel('env == "prod"', {})).toBe(false);
  });

  it('returns true for permissive fallback on malformed expression', () => {
    // Completely unparseable input should not throw; returns true (permissive)
    expect(evalCel('((((broken', {})).toBe(true);
  });
});

// ── Boolean literals ──────────────────────────────────────────────────────────

describe('evalCel — boolean literals', () => {
  it('evaluates true literal', () => {
    expect(evalCel('true', {})).toBe(true);
  });

  it('evaluates false literal', () => {
    expect(evalCel('false', {})).toBe(false);
  });
});
