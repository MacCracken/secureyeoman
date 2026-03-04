import { describe, it, expect, vi, afterEach } from 'vitest';
import { sanitizeErrorForClient, AppError } from './sanitize-error.js';

describe('sanitizeErrorForClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns generic message for unknown errors in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const result = sanitizeErrorForClient(new Error('secret db connection string leaked'));
    expect(result.message).toBe('An internal error occurred');
    expect(result.debug).toBeUndefined();
  });

  it('includes debug field in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const result = sanitizeErrorForClient(new Error('some internal error'));
    expect(result.message).toBe('An internal error occurred');
    expect(result.debug).toBe('some internal error');
  });

  it('preserves AppError message in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const result = sanitizeErrorForClient(new AppError('Invalid input format', 'INVALID_INPUT'));
    expect(result.message).toBe('Invalid input format');
    expect(result.code).toBe('INVALID_INPUT');
    expect(result.debug).toBeUndefined();
  });

  it('preserves AppError message in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const result = sanitizeErrorForClient(new AppError('Bad request', 'BAD_REQUEST'));
    expect(result.message).toBe('Bad request');
    expect(result.code).toBe('BAD_REQUEST');
  });

  it('handles string errors', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const result = sanitizeErrorForClient('string error');
    expect(result.message).toBe('An internal error occurred');
    expect(result.debug).toBe('string error');
  });

  it('handles null/undefined errors', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(sanitizeErrorForClient(null).message).toBe('An internal error occurred');
    expect(sanitizeErrorForClient(undefined).message).toBe('An internal error occurred');
  });

  it('handles non-Error objects', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const result = sanitizeErrorForClient({ code: 'ECONNREFUSED' });
    expect(result.message).toBe('An internal error occurred');
    expect(result.debug).toBeDefined();
  });

  it('AppError without code works', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const result = sanitizeErrorForClient(new AppError('Validation failed'));
    expect(result.message).toBe('Validation failed');
    expect(result.code).toBeUndefined();
  });

  it('never leaks stack traces in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const err = new Error('connection refused to postgres:5432');
    const result = sanitizeErrorForClient(err);
    expect(result.message).not.toContain('postgres');
    expect(JSON.stringify(result)).not.toContain('stack');
  });

  it('handles TypeError in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const result = sanitizeErrorForClient(new TypeError("Cannot read properties of undefined (reading 'foo')"));
    expect(result.message).toBe('An internal error occurred');
  });

  it('default NODE_ENV (unset) is treated as development', () => {
    vi.stubEnv('NODE_ENV', '');
    const result = sanitizeErrorForClient(new Error('dev error'));
    expect(result.debug).toBe('dev error');
  });
});
