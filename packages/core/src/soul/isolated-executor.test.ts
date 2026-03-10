import { describe, it, expect, beforeAll } from 'vitest';
import { isIsolatedVmAvailable, executeIsolated, ready } from './isolated-executor.js';

// ── Tests ─────────────────────────────────────────────────────────────────────
// These tests exercise the real isolated-vm module when it is available.
// If the native module is not installed (e.g., CI without build tools),
// the "with isolated-vm" suite is skipped and the "without" suite runs instead.

describe('isolated-executor', () => {
  let available: boolean;

  beforeAll(async () => {
    // Wait for the async module probe to complete before checking availability.
    await ready;
    available = isIsolatedVmAvailable();
  });

  it('isIsolatedVmAvailable returns a boolean', async () => {
    await ready;
    expect(typeof isIsolatedVmAvailable()).toBe('boolean');
  });

  it('executes simple arithmetic and returns the result', async () => {
    if (!available) return;
    const result = await executeIsolated('1 + 1', {}, 5000);
    expect(result).toBe(2);
  });

  it('can access sandbox values', async () => {
    if (!available) return;
    const result = await executeIsolated('x + y', { x: 10, y: 32 }, 5000);
    expect(result).toBe(42);
  });

  it('returns string results', async () => {
    if (!available) return;
    const result = await executeIsolated('"hello" + " " + "world"', {}, 5000);
    expect(result).toBe('hello world');
  });

  it('respects timeout and throws on infinite loop', async () => {
    if (!available) return;
    await expect(executeIsolated('while(true){}', {}, 100)).rejects.toThrow(/timed out/i);
  });

  it('sandbox does not have access to process', async () => {
    if (!available) return;
    const result = await executeIsolated(
      'typeof process !== "undefined" ? process.exit(1) : "safe"',
      {},
      5000
    );
    expect(result).toBe('safe');
  });

  it('sandbox does not have access to require', async () => {
    if (!available) return;
    const result = await executeIsolated(
      'typeof require !== "undefined" ? require("fs") : "no-require"',
      {},
      5000
    );
    expect(result).toBe('no-require');
  });

  it('sandbox does not have access to globalThis.process', async () => {
    if (!available) return;
    const result = await executeIsolated('typeof global.process', {}, 5000);
    expect(result).toBe('undefined');
  });

  it('handles object sandbox values', async () => {
    if (!available) return;
    const result = await executeIsolated('data.name', { data: { name: 'test' } }, 5000);
    expect(result).toBe('test');
  });

  it('handles array sandbox values', async () => {
    if (!available) return;
    const result = await executeIsolated('items.length', { items: [1, 2, 3] }, 5000);
    expect(result).toBe(3);
  });

  it('isolates memory between calls', async () => {
    if (!available) return;
    // First call sets a global
    await executeIsolated('global.leaked = 42; leaked', {}, 5000);

    // Second call should NOT see the leaked variable (fresh isolate each time)
    const result = await executeIsolated('typeof leaked', {}, 5000);
    expect(result).toBe('undefined');
  });

  it('throws descriptive error when isolated-vm is not available', async () => {
    if (available) return;
    await expect(executeIsolated('1+1', {}, 1000)).rejects.toThrow('isolated-vm is not available');
  });
});
