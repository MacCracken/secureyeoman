/**
 * Tests for GuardrailPipeline — Phase 143
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuardrailPipeline } from './guardrail-pipeline.js';
import type {
  GuardrailFilter,
  GuardrailFilterContext,
  GuardrailFilterResult,
  GuardrailPipelineConfig,
} from '@secureyeoman/shared';

function makeConfig(overrides: Partial<GuardrailPipelineConfig> = {}): GuardrailPipelineConfig {
  return {
    enabled: true,
    dryRun: false,
    metricsEnabled: true,
    customFilterDir: 'guardrails',
    autoLoadCustomFilters: false,
    disabledFilters: [],
    ...overrides,
  };
}

function makeDeps() {
  return {
    auditRecord: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

function makeFilter(overrides: Partial<GuardrailFilter> = {}): GuardrailFilter {
  return {
    id: 'test:filter-1',
    name: 'Test Filter',
    priority: 100,
    enabled: true,
    ...overrides,
  };
}

describe('GuardrailPipeline', () => {
  let pipeline: GuardrailPipeline;
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
    pipeline = new GuardrailPipeline(makeConfig(), deps);
  });

  describe('filter registration', () => {
    it('registers and lists filters', () => {
      const f1 = makeFilter({ id: 'a', priority: 200 });
      const f2 = makeFilter({ id: 'b', priority: 100 });
      pipeline.registerFilter(f1);
      pipeline.registerFilter(f2);

      const list = pipeline.listFilters();
      expect(list).toHaveLength(2);
      expect(list[0]!.id).toBe('b'); // sorted by priority
      expect(list[1]!.id).toBe('a');
    });

    it('replaces existing filter on re-register', () => {
      const dispose = vi.fn();
      const f1 = makeFilter({ id: 'a', dispose });
      pipeline.registerFilter(f1);

      const f2 = makeFilter({ id: 'a', priority: 50 });
      pipeline.registerFilter(f2);

      expect(dispose).toHaveBeenCalled();
      expect(pipeline.listFilters()).toHaveLength(1);
    });

    it('unregisters filter', () => {
      const dispose = vi.fn();
      pipeline.registerFilter(makeFilter({ id: 'a', dispose }));
      expect(pipeline.unregisterFilter('a')).toBe(true);
      expect(dispose).toHaveBeenCalled();
      expect(pipeline.listFilters()).toHaveLength(0);
    });

    it('returns false for unknown unregister', () => {
      expect(pipeline.unregisterFilter('nope')).toBe(false);
    });
  });

  describe('runOutput', () => {
    it('returns passed when pipeline is disabled', async () => {
      const disabled = new GuardrailPipeline(makeConfig({ enabled: false }), deps);
      disabled.registerFilter(
        makeFilter({
          onOutput: vi.fn().mockResolvedValue({ passed: false, text: '', findings: [] }),
        })
      );
      const result = await disabled.runOutput('hello', { source: 'test' });
      expect(result.passed).toBe(true);
    });

    it('chains filters in priority order', async () => {
      const order: string[] = [];
      pipeline.registerFilter(
        makeFilter({
          id: 'second',
          priority: 200,
          onOutput: async (text) => {
            order.push('second');
            return { passed: true, text: text + ' B', findings: [] };
          },
        })
      );
      pipeline.registerFilter(
        makeFilter({
          id: 'first',
          priority: 100,
          onOutput: async (text) => {
            order.push('first');
            return { passed: true, text: text + ' A', findings: [] };
          },
        })
      );

      const result = await pipeline.runOutput('start', { source: 'test' });
      expect(order).toEqual(['first', 'second']);
      expect(result.text).toBe('start A B');
      expect(result.passed).toBe(true);
    });

    it('stops chain on block', async () => {
      pipeline.registerFilter(
        makeFilter({
          id: 'blocker',
          priority: 100,
          onOutput: async (text) => ({
            passed: false,
            text,
            findings: [
              { filterId: 'blocker', type: 'test', action: 'block', detail: 'blocked' },
            ],
          }),
        })
      );

      const afterBlocker = vi.fn().mockResolvedValue({ passed: true, text: '', findings: [] });
      pipeline.registerFilter(
        makeFilter({ id: 'after', priority: 200, onOutput: afterBlocker })
      );

      const result = await pipeline.runOutput('text', { source: 'test' });
      expect(result.passed).toBe(false);
      expect(afterBlocker).not.toHaveBeenCalled();
      expect(deps.auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'guardrail_pipeline_blocked' })
      );
    });

    it('dry-run mode records block but returns passed', async () => {
      const dryPipeline = new GuardrailPipeline(makeConfig({ dryRun: true }), deps);
      dryPipeline.registerFilter(
        makeFilter({
          id: 'blocker',
          priority: 100,
          onOutput: async (text) => ({
            passed: false,
            text,
            findings: [
              { filterId: 'blocker', type: 'test', action: 'block', detail: 'blocked' },
            ],
          }),
        })
      );

      const afterBlocker = vi
        .fn()
        .mockResolvedValue({ passed: true, text: 'continued', findings: [] });
      dryPipeline.registerFilter(
        makeFilter({ id: 'after', priority: 200, onOutput: afterBlocker })
      );

      const result = await dryPipeline.runOutput('text', { source: 'test' });
      expect(result.passed).toBe(true); // dry-run never blocks
      expect(afterBlocker).toHaveBeenCalled(); // chain continues
      expect(result.findings).toHaveLength(1);
    });

    it('personality dry-run override', async () => {
      pipeline.registerFilter(
        makeFilter({
          id: 'blocker',
          priority: 100,
          onOutput: async (text) => ({
            passed: false,
            text,
            findings: [
              { filterId: 'blocker', type: 'test', action: 'block', detail: 'blocked' },
            ],
          }),
        })
      );

      const result = await pipeline.runOutput('text', { source: 'test' }, { dryRun: true, disabledFilters: [] });
      expect(result.passed).toBe(true);
    });

    it('skips disabled filters', async () => {
      const spy = vi.fn().mockResolvedValue({ passed: true, text: 'x', findings: [] });
      pipeline.registerFilter(makeFilter({ id: 'skipped', enabled: false, onOutput: spy }));

      await pipeline.runOutput('text', { source: 'test' });
      expect(spy).not.toHaveBeenCalled();
    });

    it('skips globally disabled filter IDs', async () => {
      const p = new GuardrailPipeline(
        makeConfig({ disabledFilters: ['test:disabled'] }),
        deps
      );
      const spy = vi.fn().mockResolvedValue({ passed: true, text: 'x', findings: [] });
      p.registerFilter(makeFilter({ id: 'test:disabled', onOutput: spy }));

      await p.runOutput('text', { source: 'test' });
      expect(spy).not.toHaveBeenCalled();
    });

    it('skips personality-disabled filters', async () => {
      const spy = vi.fn().mockResolvedValue({ passed: true, text: 'x', findings: [] });
      pipeline.registerFilter(makeFilter({ id: 'skip-me', onOutput: spy }));

      await pipeline.runOutput(
        'text',
        { source: 'test' },
        { disabledFilters: ['skip-me'] }
      );
      expect(spy).not.toHaveBeenCalled();
    });

    it('personality enabledFilters allowlist', async () => {
      const allowed = vi.fn().mockResolvedValue({ passed: true, text: 'ok', findings: [] });
      const blocked = vi.fn().mockResolvedValue({ passed: true, text: 'x', findings: [] });
      pipeline.registerFilter(makeFilter({ id: 'allowed', onOutput: allowed }));
      pipeline.registerFilter(makeFilter({ id: 'blocked', priority: 200, onOutput: blocked }));

      await pipeline.runOutput(
        'text',
        { source: 'test' },
        { enabledFilters: ['allowed'], disabledFilters: [] }
      );
      expect(allowed).toHaveBeenCalled();
      expect(blocked).not.toHaveBeenCalled();
    });

    it('fails open on filter error', async () => {
      pipeline.registerFilter(
        makeFilter({
          id: 'broken',
          priority: 100,
          onOutput: async () => {
            throw new Error('kaboom');
          },
        })
      );
      const next = vi.fn().mockResolvedValue({ passed: true, text: 'ok', findings: [] });
      pipeline.registerFilter(makeFilter({ id: 'next', priority: 200, onOutput: next }));

      const result = await pipeline.runOutput('text', { source: 'test' });
      expect(result.passed).toBe(true);
      expect(next).toHaveBeenCalled();
      expect(deps.logger.error).toHaveBeenCalled();
    });

    it('skips filters without the right hook', async () => {
      const inputOnly = vi
        .fn()
        .mockResolvedValue({ passed: true, text: 'x', findings: [] });
      pipeline.registerFilter(makeFilter({ id: 'input-only', onInput: inputOnly }));

      await pipeline.runOutput('text', { source: 'test' });
      expect(inputOnly).not.toHaveBeenCalled();
    });

    it('collects filter metrics', async () => {
      pipeline.registerFilter(
        makeFilter({
          id: 'metered',
          onOutput: async (text) => ({
            passed: true,
            text,
            findings: [{ filterId: 'metered', type: 't', action: 'warn', detail: 'd' }],
          }),
        })
      );

      const result = await pipeline.runOutput('text', { source: 'test' });
      expect(result.filterMetrics).toBeDefined();
      expect(result.filterMetrics).toHaveLength(1);
      expect(result.filterMetrics![0]!.filterId).toBe('metered');
      expect(result.filterMetrics![0]!.findingCount).toBe(1);
    });
  });

  describe('runInput', () => {
    it('runs input hooks', async () => {
      pipeline.registerFilter(
        makeFilter({
          id: 'input-filter',
          onInput: async (text) => ({
            passed: true,
            text: text.toUpperCase(),
            findings: [],
          }),
        })
      );

      const result = await pipeline.runInput('hello', { source: 'test' });
      expect(result.text).toBe('HELLO');
      expect(result.passed).toBe(true);
    });
  });

  describe('dispose', () => {
    it('disposes all filters', () => {
      const d1 = vi.fn();
      const d2 = vi.fn();
      pipeline.registerFilter(makeFilter({ id: 'a', dispose: d1 }));
      pipeline.registerFilter(makeFilter({ id: 'b', dispose: d2 }));

      pipeline.dispose();
      expect(d1).toHaveBeenCalled();
      expect(d2).toHaveBeenCalled();
      expect(pipeline.listFilters()).toHaveLength(0);
    });
  });
});
