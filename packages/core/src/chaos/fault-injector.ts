/**
 * Fault Injector — executes individual fault injections.
 *
 * Each fault type has a dedicated handler that simulates the failure
 * condition. Injections are probabilistic and time-bounded.
 */

import type { Logger } from 'pino';
import type {
  FaultRule,
  FaultConfig,
  FaultInjectionResult,
} from '@secureyeoman/shared';

export interface FaultInjectorDeps {
  log: Logger;
}

export class FaultInjector {
  private readonly log: Logger;
  private readonly activeInjections = new Map<string, { abort: () => void }>();

  constructor(deps: FaultInjectorDeps) {
    this.log = deps.log;
  }

  /** Inject a fault according to the rule. Returns the result. */
  async inject(rule: FaultRule): Promise<FaultInjectionResult> {
    const startTime = Date.now();

    if (!this.shouldInject(rule.probability)) {
      return this.buildResult(rule, startTime, {
        impactObserved: 'Skipped (probability check)',
        recovered: true,
        recoveryTimeMs: 0,
      });
    }

    this.log.info(
      { ruleId: rule.id, faultType: rule.fault.type, target: rule.targetId },
      'Injecting fault'
    );

    try {
      const impact = await this.executeFault(rule.id, rule.fault);
      const endTime = Date.now();

      return this.buildResult(rule, startTime, {
        durationMs: endTime - startTime,
        impactObserved: impact,
        recovered: true,
        recoveryTimeMs: endTime - startTime,
      });
    } catch (err) {
      const endTime = Date.now();
      const message = err instanceof Error ? err.message : String(err);
      this.log.error({ err, ruleId: rule.id }, 'Fault injection failed');

      return this.buildResult(rule, startTime, {
        durationMs: endTime - startTime,
        impactObserved: `Injection error: ${message}`,
        recovered: false,
        error: message,
      });
    }
  }

  /** Abort all active injections. */
  abortAll(): void {
    for (const [id, injection] of this.activeInjections) {
      injection.abort();
      this.log.info({ ruleId: id }, 'Aborted fault injection');
    }
    this.activeInjections.clear();
  }

  /** Abort a specific injection by rule ID. */
  abort(ruleId: string): boolean {
    const injection = this.activeInjections.get(ruleId);
    if (injection) {
      injection.abort();
      this.activeInjections.delete(ruleId);
      return true;
    }
    return false;
  }

  get activeCount(): number {
    return this.activeInjections.size;
  }

  private shouldInject(probability: number): boolean {
    return Math.random() < probability;
  }

  private async executeFault(ruleId: string, fault: FaultConfig): Promise<string> {
    switch (fault.type) {
      case 'latency':
        return this.injectLatency(ruleId, fault.minMs, fault.maxMs, fault.distribution);
      case 'error':
        return this.injectError(fault.errorCode, fault.errorMessage);
      case 'timeout':
        return this.injectTimeout(ruleId, fault.timeoutMs);
      case 'resource_exhaustion':
        return this.injectResourceExhaustion(ruleId, fault.resource, fault.pressure, fault.durationMs);
      case 'dependency_failure':
        return this.injectDependencyFailure(fault.dependencyName, fault.failureMode);
      case 'data_corruption':
        return this.injectDataCorruption(fault.corruptionType, fault.targetField);
      case 'circuit_breaker_trip':
        return this.injectCircuitBreakerTrip(fault.breakerName, fault.holdOpenMs);
      case 'rate_limit':
        return this.injectRateLimit(fault.maxRequestsPerSec);
      default:
        return `Unknown fault type`;
    }
  }

  private async injectLatency(
    ruleId: string,
    minMs: number,
    maxMs: number,
    distribution: string
  ): Promise<string> {
    const delay = this.computeDelay(minMs, maxMs, distribution);
    await this.delayWithAbort(ruleId, delay);
    return `Injected ${delay}ms latency (${distribution} distribution)`;
  }

  private async injectError(errorCode: number, errorMessage: string): Promise<string> {
    throw new ChaosInjectedError(errorCode, errorMessage);
  }

  private async injectTimeout(ruleId: string, timeoutMs: number): Promise<string> {
    await this.delayWithAbort(ruleId, timeoutMs);
    return `Simulated ${timeoutMs}ms timeout`;
  }

  private async injectResourceExhaustion(
    ruleId: string,
    resource: string,
    pressure: number,
    durationMs: number
  ): Promise<string> {
    await this.delayWithAbort(ruleId, durationMs);
    return `Simulated ${resource} exhaustion at ${(pressure * 100).toFixed(0)}% pressure for ${durationMs}ms`;
  }

  private async injectDependencyFailure(
    dependencyName: string,
    failureMode: string
  ): Promise<string> {
    return `Simulated ${failureMode} failure of dependency: ${dependencyName}`;
  }

  private async injectDataCorruption(
    corruptionType: string,
    targetField?: string
  ): Promise<string> {
    const field = targetField ? ` on field '${targetField}'` : '';
    return `Simulated ${corruptionType} data corruption${field}`;
  }

  private async injectCircuitBreakerTrip(
    breakerName: string,
    holdOpenMs: number
  ): Promise<string> {
    return `Tripped circuit breaker '${breakerName}' for ${holdOpenMs}ms`;
  }

  private async injectRateLimit(maxRequestsPerSec: number): Promise<string> {
    return `Applied rate limit of ${maxRequestsPerSec} req/s`;
  }

  private computeDelay(minMs: number, maxMs: number, distribution: string): number {
    const range = maxMs - minMs;
    switch (distribution) {
      case 'normal': {
        // Box-Muller transform, clamped to [min, max]
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
        const mean = (minMs + maxMs) / 2;
        const stddev = range / 6;
        return Math.round(Math.max(minMs, Math.min(maxMs, mean + z * stddev)));
      }
      case 'exponential': {
        const lambda = 1 / (range / 2);
        const sample = -Math.log(1 - Math.random()) / lambda;
        return Math.round(Math.min(maxMs, minMs + sample));
      }
      default:
        return Math.round(minMs + Math.random() * range);
    }
  }

  private delayWithAbort(ruleId: string, ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.activeInjections.delete(ruleId);
        resolve();
      }, ms);

      this.activeInjections.set(ruleId, {
        abort: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
  }

  private buildResult(
    rule: FaultRule,
    startTime: number,
    overrides: Partial<FaultInjectionResult>
  ): FaultInjectionResult {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      faultType: rule.fault.type,
      injectedAt: startTime,
      durationMs: 0,
      targetType: rule.targetType,
      targetId: rule.targetId,
      impactObserved: '',
      recovered: false,
      recoveryTimeMs: 0,
      ...overrides,
    };
  }
}

export class ChaosInjectedError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ChaosInjectedError';
    this.statusCode = statusCode;
  }
}
