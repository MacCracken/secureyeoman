import { describe, it, expect, afterEach } from 'vitest';
import { CryptoPool } from './crypto-pool.js';
import { sha256, hmacSha256 } from './crypto.js';

describe('CryptoPool', () => {
  let pool: CryptoPool;

  afterEach(async () => {
    await pool?.close();
  });

  it('sha256 returns same result as sync sha256()', async () => {
    pool = new CryptoPool({ poolSize: 1 });
    const data = 'hello world';
    const result = await pool.sha256(data);
    expect(result).toBe(sha256(data));
  });

  it('hmacSha256 returns same result as sync hmacSha256()', async () => {
    pool = new CryptoPool({ poolSize: 1 });
    const data = 'audit entry data';
    const key = 'a'.repeat(64);
    const result = await pool.hmacSha256(data, key);
    expect(result).toBe(hmacSha256(data, key));
  });

  it('handles multiple concurrent requests correctly', async () => {
    pool = new CryptoPool({ poolSize: 2 });
    const inputs = Array.from({ length: 20 }, (_, i) => `data-${i}`);

    const results = await Promise.all(inputs.map((d) => pool.sha256(d)));

    for (let i = 0; i < inputs.length; i++) {
      expect(results[i]).toBe(sha256(inputs[i]!));
    }
  });

  it('falls back to sync after close()', async () => {
    pool = new CryptoPool({ poolSize: 1 });
    await pool.close();

    // Should still work via sync fallback
    const data = 'after close';
    const result = await pool.sha256(data);
    expect(result).toBe(sha256(data));

    const hmacResult = await pool.hmacSha256(data, 'key123');
    expect(hmacResult).toBe(hmacSha256(data, 'key123'));
  });

  it('round-robins across workers', async () => {
    pool = new CryptoPool({ poolSize: 2 });
    // Just verify multiple requests complete successfully with >1 worker
    const results = await Promise.all([
      pool.sha256('a'),
      pool.sha256('b'),
      pool.sha256('c'),
      pool.sha256('d'),
    ]);
    expect(results).toEqual(['a', 'b', 'c', 'd'].map((d) => sha256(d)));
  });
});
