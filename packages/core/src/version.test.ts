/**
 * Version Module Tests
 */

import { describe, it, expect } from 'vitest';
import { VERSION } from './version.js';

describe('VERSION', () => {
  it('exports a non-empty string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it('matches semver or date-based version pattern', () => {
    // Accepts: 1.2.3, 2026.2.23, 2026.02.23, etc.
    expect(VERSION).toMatch(/^\d+\.\d+(\.\d+)?/);
  });
});
