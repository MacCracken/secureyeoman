import { describe, it, expect } from 'vitest';
import {
  AIProviderError,
  RateLimitError,
  TokenLimitError,
  InvalidResponseError,
  ProviderUnavailableError,
  AuthenticationError,
} from './errors.js';

describe('AIProviderError', () => {
  it('sets all fields correctly', () => {
    const cause = new Error('original');
    const err = new AIProviderError('Something failed', {
      provider: 'openai',
      code: 'SOME_ERROR',
      recoverable: true,
      retryAfter: 30,
      statusCode: 503,
      cause,
    });
    expect(err.message).toBe('Something failed');
    expect(err.provider).toBe('openai');
    expect(err.code).toBe('SOME_ERROR');
    expect(err.recoverable).toBe(true);
    expect(err.retryAfter).toBe(30);
    expect(err.statusCode).toBe(503);
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('AIProviderError');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof AIProviderError).toBe(true);
  });

  it('works without optional fields', () => {
    const err = new AIProviderError('Minimal error', {
      provider: 'anthropic',
      code: 'GENERIC',
      recoverable: false,
    });
    expect(err.retryAfter).toBeUndefined();
    expect(err.statusCode).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });
});

describe('RateLimitError', () => {
  it('sets correct defaults', () => {
    const err = new RateLimitError('openai', 60);
    expect(err.name).toBe('RateLimitError');
    expect(err.provider).toBe('openai');
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.recoverable).toBe(true);
    expect(err.retryAfter).toBe(60);
    expect(err.statusCode).toBe(429);
    expect(err.message).toContain('Rate limited');
    expect(err.message).toContain('openai');
  });

  it('works without retryAfter', () => {
    const err = new RateLimitError('anthropic');
    expect(err.retryAfter).toBeUndefined();
  });

  it('is instanceof AIProviderError', () => {
    expect(new RateLimitError('openai') instanceof AIProviderError).toBe(true);
  });
});

describe('TokenLimitError', () => {
  it('sets correct fields', () => {
    const err = new TokenLimitError('openai');
    expect(err.name).toBe('TokenLimitError');
    expect(err.provider).toBe('openai');
    expect(err.code).toBe('TOKEN_LIMIT');
    expect(err.recoverable).toBe(false);
    expect(err.message).toContain('Token limit');
    expect(err.message).toContain('openai');
  });
});

describe('InvalidResponseError', () => {
  it('includes detail in message', () => {
    const err = new InvalidResponseError('grok', 'no content field');
    expect(err.name).toBe('InvalidResponseError');
    expect(err.provider).toBe('grok');
    expect(err.code).toBe('INVALID_RESPONSE');
    expect(err.recoverable).toBe(false);
    expect(err.message).toContain('grok');
    expect(err.message).toContain('no content field');
  });
});

describe('ProviderUnavailableError', () => {
  it('marks as recoverable', () => {
    const err = new ProviderUnavailableError('openai', 503);
    expect(err.name).toBe('ProviderUnavailableError');
    expect(err.provider).toBe('openai');
    expect(err.code).toBe('PROVIDER_UNAVAILABLE');
    expect(err.recoverable).toBe(true);
    expect(err.statusCode).toBe(503);
    expect(err.message).toContain('openai');
  });

  it('works without statusCode', () => {
    const err = new ProviderUnavailableError('localai');
    expect(err.statusCode).toBeUndefined();
  });
});

describe('AuthenticationError', () => {
  it('sets 401 status code', () => {
    const err = new AuthenticationError('anthropic');
    expect(err.name).toBe('AuthenticationError');
    expect(err.provider).toBe('anthropic');
    expect(err.code).toBe('AUTH_FAILED');
    expect(err.recoverable).toBe(false);
    expect(err.statusCode).toBe(401);
    expect(err.message).toContain('anthropic');
  });
});
