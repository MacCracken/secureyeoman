/**
 * Retry Manager with Exponential Backoff
 *
 * Implements jittered exponential backoff for transient AI provider failures.
 * Only retries recoverable errors (rate limits, 502/503, timeouts, ECONNRESET).
 * Never retries auth errors, invalid requests, or token limits.
 */

import { AIProviderError } from './errors.js';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

export class RetryManager {
  private readonly config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Execute an operation with retry logic.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt >= this.config.maxRetries || !this.shouldRetry(lastError)) {
          throw lastError;
        }

        const delay = this.calculateDelay(attempt, lastError);
        await this.sleep(delay);
      }
    }

    // Unreachable, but TypeScript needs it
    throw lastError;
  }

  /**
   * Determine whether the error is retryable.
   */
  shouldRetry(error: Error): boolean {
    if (error instanceof AIProviderError) {
      return error.recoverable;
    }

    const message = error.message.toLowerCase();

    // Retryable network errors
    if (
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('socket hang up') ||
      message.includes('fetch failed')
    ) {
      return true;
    }

    // Retryable HTTP status codes in error messages
    if (message.includes('502') || message.includes('503') || message.includes('timeout')) {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay with jittered exponential backoff.
   */
  calculateDelay(attempt: number, error?: Error): number {
    // If the error specifies a retryAfter, use it
    if (error instanceof AIProviderError && error.retryAfter !== undefined) {
      return Math.min(error.retryAfter * 1000, this.config.maxDelayMs);
    }

    // Exponential backoff: baseDelay * 2^attempt
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attempt);

    // Clamp to max
    const clampedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter: random value between 0 and clampedDelay
    const jitter = Math.random() * clampedDelay;

    return Math.floor(clampedDelay / 2 + jitter / 2);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
