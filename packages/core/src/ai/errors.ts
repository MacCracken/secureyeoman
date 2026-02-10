/**
 * AI-specific Error Types
 *
 * Hierarchical error types for the AI provider layer.
 * Each error carries structured metadata for retry logic and observability.
 */

export class AIProviderError extends Error {
  readonly provider: string;
  readonly code: string;
  readonly recoverable: boolean;
  readonly retryAfter?: number;
  readonly statusCode?: number;

  constructor(
    message: string,
    options: {
      provider: string;
      code: string;
      recoverable: boolean;
      retryAfter?: number;
      statusCode?: number;
      cause?: Error;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'AIProviderError';
    this.provider = options.provider;
    this.code = options.code;
    this.recoverable = options.recoverable;
    this.retryAfter = options.retryAfter;
    this.statusCode = options.statusCode;
  }
}

export class RateLimitError extends AIProviderError {
  constructor(provider: string, retryAfter?: number, cause?: Error) {
    super(`Rate limited by ${provider}`, {
      provider,
      code: 'RATE_LIMIT',
      recoverable: true,
      retryAfter,
      statusCode: 429,
      cause,
    });
    this.name = 'RateLimitError';
  }
}

export class TokenLimitError extends AIProviderError {
  constructor(provider: string, cause?: Error) {
    super(`Token limit exceeded for ${provider}`, {
      provider,
      code: 'TOKEN_LIMIT',
      recoverable: false,
      cause,
    });
    this.name = 'TokenLimitError';
  }
}

export class InvalidResponseError extends AIProviderError {
  constructor(provider: string, detail: string, cause?: Error) {
    super(`Invalid response from ${provider}: ${detail}`, {
      provider,
      code: 'INVALID_RESPONSE',
      recoverable: false,
      cause,
    });
    this.name = 'InvalidResponseError';
  }
}

export class ProviderUnavailableError extends AIProviderError {
  constructor(provider: string, statusCode?: number, cause?: Error) {
    super(`Provider ${provider} is unavailable`, {
      provider,
      code: 'PROVIDER_UNAVAILABLE',
      recoverable: true,
      statusCode,
      cause,
    });
    this.name = 'ProviderUnavailableError';
  }
}

export class AuthenticationError extends AIProviderError {
  constructor(provider: string, cause?: Error) {
    super(`Authentication failed for ${provider}`, {
      provider,
      code: 'AUTH_FAILED',
      recoverable: false,
      statusCode: 401,
      cause,
    });
    this.name = 'AuthenticationError';
  }
}
