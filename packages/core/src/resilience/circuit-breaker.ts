/**
 * CircuitBreaker — Lightweight circuit breaker for external service calls.
 *
 * States:
 *   CLOSED  — requests pass through normally; failures are counted.
 *   OPEN    — requests fail immediately with CircuitBreakerOpenError.
 *   HALF_OPEN — one probe request is allowed; success closes, failure re-opens.
 *
 * Transitions:
 *   CLOSED → OPEN:      when `failureThreshold` consecutive failures are reached.
 *   OPEN → HALF_OPEN:   after `resetTimeoutMs` elapses.
 *   HALF_OPEN → CLOSED:  on a successful probe.
 *   HALF_OPEN → OPEN:    on a failed probe (resets the timeout).
 */

export interface CircuitBreakerOptions {
  /** Consecutive failures before opening the circuit (default: 5). */
  failureThreshold?: number;
  /** Time in ms before transitioning from OPEN to HALF_OPEN (default: 30_000). */
  resetTimeoutMs?: number;
  /** Optional name for logging / metrics. */
  name?: string;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreakerOpenError extends Error {
  readonly circuitName: string;
  constructor(name: string) {
    super(`Circuit breaker "${name}" is open — request rejected`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = name;
  }
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30_000;

export class CircuitBreaker {
  readonly name: string;
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.name = opts.name ?? 'default';
    this.failureThreshold = opts.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
  }

  getState(): CircuitState {
    if (this.state === 'open' && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
      this.state = 'half-open';
    }
    return this.state;
  }

  /**
   * Execute `fn` through the circuit breaker.
   * Throws CircuitBreakerOpenError when the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.getState();

    if (current === 'open') {
      throw new CircuitBreakerOpenError(this.name);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /** Record a manual success (e.g. from health checks). */
  recordSuccess(): void {
    this.getState(); // ensure open→half-open transition
    this.onSuccess();
  }

  /** Record a manual failure. */
  recordFailure(): void {
    this.getState(); // ensure open→half-open transition
    this.onFailure();
  }

  /** Reset to closed state. */
  reset(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
    }
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'open';
    }
  }
}

/**
 * CircuitBreakerRegistry — Manages named circuit breakers.
 *
 * Provides a single shared registry so AI providers and integrations
 * each get their own breaker keyed by name (e.g. "ai:anthropic", "integration:slack").
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly defaults: CircuitBreakerOptions;

  constructor(defaults: CircuitBreakerOptions = {}) {
    this.defaults = defaults;
  }

  /** Get or create a circuit breaker for the given key. */
  get(key: string, opts?: CircuitBreakerOptions): CircuitBreaker {
    let breaker = this.breakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker({ ...this.defaults, name: key, ...opts });
      this.breakers.set(key, breaker);
    }
    return breaker;
  }

  /** Get all breaker states for monitoring. */
  getAll(): Record<string, { state: CircuitState; name: string }> {
    const result: Record<string, { state: CircuitState; name: string }> = {};
    for (const [key, breaker] of this.breakers) {
      result[key] = { state: breaker.getState(), name: breaker.name };
    }
    return result;
  }

  /** Reset all breakers. */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /** Number of registered breakers. */
  get size(): number {
    return this.breakers.size;
  }
}
