import { describe, it, expect } from 'vitest';
import { jwtVerify } from 'jose';
import { mintServiceToken } from './service-token.js';

const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';

describe('mintServiceToken', () => {
  it('should produce a valid HS256 JWT', async () => {
    const token = await mintServiceToken(TEST_SECRET);
    expect(token).toBeDefined();
    expect(token.split('.')).toHaveLength(3);
  });

  it('should be verifiable with the same secret', async () => {
    const token = await mintServiceToken(TEST_SECRET);
    const secret = new TextEncoder().encode(TEST_SECRET);
    const { payload } = await jwtVerify(token, secret);

    expect(payload.sub).toBe('mcp-service');
    expect(payload.role).toBe('service');
    expect(payload.permissions).toEqual([
      'mcp:execute',
      'mcp:read',
      'auth:read',
      'brain:read',
      'brain:write',
      'soul:read',
      'internal:read',
    ]);
    expect(payload.type).toBe('access');
    expect(payload.jti).toBeDefined();
    expect(typeof payload.jti).toBe('string');
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
  });

  it('should set expiry ~1 hour in the future', async () => {
    const token = await mintServiceToken(TEST_SECRET);
    const secret = new TextEncoder().encode(TEST_SECRET);
    const { payload } = await jwtVerify(token, secret);

    const now = Math.floor(Date.now() / 1000);
    const oneHourSeconds = 60 * 60;
    // Allow 10 second tolerance
    expect(payload.exp! - now).toBeGreaterThan(oneHourSeconds - 10);
    expect(payload.exp! - now).toBeLessThanOrEqual(oneHourSeconds + 10);
  });

  it('should generate unique jti on each call', async () => {
    const token1 = await mintServiceToken(TEST_SECRET);
    const token2 = await mintServiceToken(TEST_SECRET);
    const secret = new TextEncoder().encode(TEST_SECRET);
    const { payload: p1 } = await jwtVerify(token1, secret);
    const { payload: p2 } = await jwtVerify(token2, secret);
    expect(p1.jti).not.toBe(p2.jti);
  });

  it('should fail verification with a different secret', async () => {
    const token = await mintServiceToken(TEST_SECRET);
    const wrongSecret = new TextEncoder().encode('wrong-secret-that-is-also-32-chars-long');
    await expect(jwtVerify(token, wrongSecret)).rejects.toThrow();
  });
});
