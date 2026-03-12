import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChaosAutoresearch } from './chaos-autoresearch.js';
import { createNoopLogger } from '../logging/logger.js';
import type { ExperimentSession } from '../simulation/experiment-runner.js';

function makeSession(overrides: Partial<ExperimentSession> = {}): ExperimentSession {
  return {
    id: 'sess-1',
    personalityId: 'p-1',
    name: 'Chaos Sweep',
    objective: 'Maximize resilience',
    metricName: 'resilience_score',
    lowerIsBetter: false,
    budget: { maxDurationMs: 120_000, maxSteps: 0, maxConcurrent: 1 },
    constraints: { mutableKeys: [], bounds: {}, frozenKeys: [] },
    baselineParams: {},
    bestMetric: null,
    bestRunId: null,
    totalRuns: 0,
    retainedRuns: 0,
    discardedRuns: 0,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('ChaosAutoresearch', () => {
  let logger: ReturnType<typeof createNoopLogger>;

  beforeEach(() => {
    logger = createNoopLogger();
  });

  describe('createProposer', () => {
    it('proposes baseline experiment at level 1', async () => {
      const ar = new ChaosAutoresearch({ logger });
      const propose = ar.createProposer();

      const hypothesis = await propose(makeSession());

      expect(hypothesis).not.toBeNull();
      expect(hypothesis!.description).toContain('Baseline');
      expect(hypothesis!.modifications.escalationLevel).toBe(1);
      expect(hypothesis!.modifications.faultCount).toBe(1);
    });

    it('proposes escalation after consecutive passes', async () => {
      const ar = new ChaosAutoresearch({
        logger,
        passesForEscalation: 2,
      });

      ar.recordResult(
        {},
        {
          totalFaults: 1,
          faultsRecovered: 1,
          meanRecoveryTimeMs: 100,
          circuitBreakersTripped: 0,
          passed: true,
        },
        true
      );
      ar.recordResult(
        {},
        {
          totalFaults: 1,
          faultsRecovered: 1,
          meanRecoveryTimeMs: 90,
          circuitBreakersTripped: 0,
          passed: true,
        },
        true
      );

      const propose = ar.createProposer();
      const hypothesis = await propose(makeSession());

      expect(hypothesis!.modifications.escalationLevel).toBe(2);
      expect(hypothesis!.description).toContain('L2');
    });

    it('cycles through target types', async () => {
      const ar = new ChaosAutoresearch({
        logger,
        targetTypes: ['workflow_step', 'ai_provider'],
      });

      ar.recordResult(
        {},
        {
          totalFaults: 1,
          faultsRecovered: 1,
          meanRecoveryTimeMs: 100,
          circuitBreakersTripped: 0,
          passed: true,
        },
        true
      );

      const propose = ar.createProposer();
      const h = await propose(makeSession());
      expect(h!.modifications.targetType).toBe('ai_provider');
    });
  });

  describe('createExecutor', () => {
    it('runs trial with real callback', async () => {
      const runChaos = vi.fn().mockResolvedValue({
        totalFaults: 3,
        faultsRecovered: 2,
        meanRecoveryTimeMs: 200,
        circuitBreakersTripped: 1,
        passed: true,
      });

      const ar = new ChaosAutoresearch({ logger, runChaosExperiment: runChaos });
      const executor = ar.createExecutor();

      const result = await executor(
        makeSession(),
        { faultCount: 3, targetType: 'workflow_step', escalationLevel: 1 },
        { maxDurationMs: 60_000, maxSteps: 0, maxConcurrent: 1 }
      );

      expect(runChaos).toHaveBeenCalledOnce();
      expect(result.metrics.recovery_rate).toBeCloseTo(2 / 3);
      expect(result.metrics.faults_injected).toBe(3);
      expect(result.metrics.faults_recovered).toBe(2);
      expect(result.lowerIsBetter).toBe(false);
    });

    it('uses simulated results when no callback', async () => {
      const ar = new ChaosAutoresearch({ logger });
      const executor = ar.createExecutor();

      const result = await executor(
        makeSession(),
        { faultCount: 1, escalationLevel: 1 },
        { maxDurationMs: 60_000, maxSteps: 0, maxConcurrent: 1 }
      );

      expect(result.metrics.faults_injected).toBe(1);
      expect(result.metrics.recovery_rate).toBeGreaterThanOrEqual(0);
      expect(result.primaryMetric).toBeGreaterThan(0);
    });
  });

  describe('escalation', () => {
    it('starts at level 1', () => {
      const ar = new ChaosAutoresearch({ logger });
      expect(ar.getEscalation().level).toBe(1);
    });

    it('escalates after passesForEscalation consecutive passes', () => {
      const ar = new ChaosAutoresearch({
        logger,
        passesForEscalation: 3,
      });

      const pass = {
        totalFaults: 1,
        faultsRecovered: 1,
        meanRecoveryTimeMs: 100,
        circuitBreakersTripped: 0,
        passed: true,
      };

      ar.recordResult({}, pass, true);
      ar.recordResult({}, pass, true);
      expect(ar.getEscalation().level).toBe(1);

      ar.recordResult({}, pass, true);
      expect(ar.getEscalation().level).toBe(2);
    });

    it('resets consecutive passes on failure', () => {
      const ar = new ChaosAutoresearch({ logger, passesForEscalation: 2 });

      const pass = {
        totalFaults: 1,
        faultsRecovered: 1,
        meanRecoveryTimeMs: 100,
        circuitBreakersTripped: 0,
        passed: true,
      };
      const fail = {
        totalFaults: 1,
        faultsRecovered: 0,
        meanRecoveryTimeMs: 500,
        circuitBreakersTripped: 1,
        passed: false,
      };

      ar.recordResult({}, pass, true);
      ar.recordResult({}, fail, false);
      expect(ar.getEscalation().consecutivePasses).toBe(0);

      // Need 2 more passes to escalate
      ar.recordResult({}, pass, true);
      expect(ar.getEscalation().level).toBe(1);
      ar.recordResult({}, pass, true);
      expect(ar.getEscalation().level).toBe(2);
    });

    it('respects maxEscalationLevel', () => {
      const ar = new ChaosAutoresearch({
        logger,
        passesForEscalation: 1,
        maxEscalationLevel: 2,
      });

      const pass = {
        totalFaults: 1,
        faultsRecovered: 1,
        meanRecoveryTimeMs: 100,
        circuitBreakersTripped: 0,
        passed: true,
      };

      ar.recordResult({}, pass, true); // → level 2
      ar.recordResult({}, pass, true); // stays at 2
      expect(ar.getEscalation().level).toBe(2);
    });
  });

  describe('baseline tracking', () => {
    it('builds baseline from retained results', () => {
      const ar = new ChaosAutoresearch({ logger });

      ar.recordResult(
        {},
        {
          totalFaults: 2,
          faultsRecovered: 2,
          meanRecoveryTimeMs: 100,
          circuitBreakersTripped: 0,
          passed: true,
        },
        true
      );
      ar.recordResult(
        {},
        {
          totalFaults: 2,
          faultsRecovered: 1,
          meanRecoveryTimeMs: 200,
          circuitBreakersTripped: 0,
          passed: true,
        },
        true
      );

      const baseline = ar.getBaseline();
      expect(baseline.recoveryRate).toBeCloseTo(0.75); // avg of 1.0 and 0.5
      expect(baseline.meanRecoveryTimeMs).toBe(150);
      expect(baseline.trialCount).toBe(2);
    });

    it('does not update baseline on discarded results', () => {
      const ar = new ChaosAutoresearch({ logger });

      ar.recordResult(
        {},
        {
          totalFaults: 2,
          faultsRecovered: 2,
          meanRecoveryTimeMs: 100,
          circuitBreakersTripped: 0,
          passed: true,
        },
        true
      );
      ar.recordResult(
        {},
        {
          totalFaults: 2,
          faultsRecovered: 0,
          meanRecoveryTimeMs: 500,
          circuitBreakersTripped: 2,
          passed: false,
        },
        false
      );

      const baseline = ar.getBaseline();
      expect(baseline.trialCount).toBe(1);
      expect(baseline.recoveryRate).toBe(1);
    });
  });

  describe('user-configurable thresholds', () => {
    it('custom passesForEscalation controls escalation speed', () => {
      const fast = new ChaosAutoresearch({ logger, passesForEscalation: 1 });
      const slow = new ChaosAutoresearch({ logger, passesForEscalation: 5 });
      const pass = {
        totalFaults: 1,
        faultsRecovered: 1,
        meanRecoveryTimeMs: 100,
        circuitBreakersTripped: 0,
        passed: true,
      };

      fast.recordResult({}, pass, true);
      expect(fast.getEscalation().level).toBe(2);

      slow.recordResult({}, pass, true);
      expect(slow.getEscalation().level).toBe(1);
    });

    it('custom maxEscalationLevel caps escalation', () => {
      const ar = new ChaosAutoresearch({ logger, passesForEscalation: 1, maxEscalationLevel: 3 });
      const pass = {
        totalFaults: 1,
        faultsRecovered: 1,
        meanRecoveryTimeMs: 100,
        circuitBreakersTripped: 0,
        passed: true,
      };

      for (let i = 0; i < 10; i++) ar.recordResult({}, pass, true);
      expect(ar.getEscalation().level).toBe(3);
    });

    it('custom maxDurationMs controls trial budget', () => {
      const ar = new ChaosAutoresearch({ logger, maxDurationMs: 300_000 });
      expect(ar.getMaxDurationMs()).toBe(300_000);
    });

    it('defaults maxDurationMs to 120_000', () => {
      const ar = new ChaosAutoresearch({ logger });
      expect(ar.getMaxDurationMs()).toBe(120_000);
    });

    it('custom targetTypes controls experiment scope', async () => {
      const ar = new ChaosAutoresearch({
        logger,
        targetTypes: ['circuit_breaker'],
      });

      const propose = ar.createProposer();
      const h = await propose(makeSession());
      expect(h!.modifications.targetType).toBe('circuit_breaker');
    });
  });
});
