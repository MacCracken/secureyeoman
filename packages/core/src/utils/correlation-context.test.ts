import { describe, it, expect } from 'vitest';
import { runWithCorrelationId, getCorrelationId } from './correlation-context.js';

describe('correlation-context', () => {
  it('runWithCorrelationId sets retrievable value inside callback', () => {
    let seen: string | undefined;
    runWithCorrelationId('test-id-1', () => {
      seen = getCorrelationId();
    });
    expect(seen).toBe('test-id-1');
  });

  it('getCorrelationId returns undefined outside ALS scope', () => {
    // We are outside any runWithCorrelationId call here
    expect(getCorrelationId()).toBeUndefined();
  });

  it('nested scopes each see their own ID', () => {
    const outer: string[] = [];
    const inner: string[] = [];
    runWithCorrelationId('outer-id', () => {
      outer.push(getCorrelationId()!);
      runWithCorrelationId('inner-id', () => {
        inner.push(getCorrelationId()!);
      });
      outer.push(getCorrelationId()!);
    });
    expect(outer).toEqual(['outer-id', 'outer-id']);
    expect(inner).toEqual(['inner-id']);
  });

  it('async continuations (Promise) retain the outer ID', async () => {
    let seen: string | undefined;
    await runWithCorrelationId('async-id', async () => {
      await Promise.resolve();
      seen = getCorrelationId();
    });
    expect(seen).toBe('async-id');
  });

  it('synchronous callback retains ID throughout its body', () => {
    let seen: string | undefined;
    runWithCorrelationId('sync-check-id', () => {
      // Synchronous read — no await
      seen = getCorrelationId();
    });
    expect(seen).toBe('sync-check-id');
  });
});
