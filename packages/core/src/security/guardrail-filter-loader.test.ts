/**
 * Tests for GuardrailFilterLoader — Phase 143
 */

import { describe, it, expect, vi } from 'vitest';
import { loadCustomFilters } from './guardrail-filter-loader.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadCustomFilters', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  it('returns empty array when directory does not exist', async () => {
    const filters = await loadCustomFilters({
      filterDir: '/nonexistent/path/guardrails',
      logger,
    });
    expect(filters).toEqual([]);
    expect(logger.info).toHaveBeenCalled();
  });

  it('returns empty array when directory is empty', async () => {
    const dir = join(tmpdir(), `guardrail-test-empty-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    try {
      const filters = await loadCustomFilters({ filterDir: dir, logger });
      expect(filters).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads a valid filter module', async () => {
    const dir = join(tmpdir(), `guardrail-test-valid-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    const code = `
      export default {
        createFilter() {
          return {
            id: 'my-filter',
            name: 'My Filter',
            priority: 500,
            enabled: true,
            async onOutput(text, ctx) {
              return { passed: true, text, findings: [] };
            },
          };
        },
      };
    `;
    writeFileSync(join(dir, 'my-filter.mjs'), code);

    try {
      const filters = await loadCustomFilters({ filterDir: dir, logger });
      expect(filters).toHaveLength(1);
      expect(filters[0]!.id).toBe('custom:my-filter');
      expect(filters[0]!.name).toBe('My Filter');
      expect(filters[0]!.priority).toBe(500);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips module with missing createFilter', async () => {
    const dir = join(tmpdir(), `guardrail-test-bad-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    writeFileSync(join(dir, 'bad.mjs'), 'export default { notAFilter: true };');

    try {
      const filters = await loadCustomFilters({ filterDir: dir, logger });
      expect(filters).toEqual([]);
      expect(logger.warn).toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips module with missing required fields', async () => {
    const dir = join(tmpdir(), `guardrail-test-incomplete-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    const code = `
      export default {
        createFilter() {
          return { id: '', name: '', priority: 'not-a-number', enabled: true };
        },
      };
    `;
    writeFileSync(join(dir, 'incomplete.mjs'), code);

    try {
      const filters = await loadCustomFilters({ filterDir: dir, logger });
      expect(filters).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not re-prefix custom: IDs', async () => {
    const dir = join(tmpdir(), `guardrail-test-prefix-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    const code = `
      export default {
        createFilter() {
          return { id: 'custom:already-prefixed', name: 'Pre', priority: 100, enabled: true };
        },
      };
    `;
    writeFileSync(join(dir, 'pre.mjs'), code);

    try {
      const filters = await loadCustomFilters({ filterDir: dir, logger });
      expect(filters[0]!.id).toBe('custom:already-prefixed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores non-js files', async () => {
    const dir = join(tmpdir(), `guardrail-test-nojs-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    writeFileSync(join(dir, 'readme.txt'), 'not a filter');
    writeFileSync(join(dir, 'data.json'), '{}');

    try {
      const filters = await loadCustomFilters({ filterDir: dir, logger });
      expect(filters).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
