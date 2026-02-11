import { describe, it, expect } from 'vitest';
import {
  generateTOTPSecret,
  generateTOTP,
  verifyTOTP,
  generateRecoveryCodes,
  buildTOTPUri,
} from './totp.js';

describe('TOTP', () => {
  it('should generate a base32 secret', () => {
    const secret = generateTOTPSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(16);
  });

  it('should generate a 6-digit code', () => {
    const secret = generateTOTPSecret();
    const code = generateTOTP(secret);
    expect(code).toMatch(/^\d{6}$/);
  });

  it('should verify a valid code within the same time step', () => {
    const secret = generateTOTPSecret();
    const now = Date.now();
    const code = generateTOTP(secret, now);
    expect(verifyTOTP(secret, code, now)).toBe(true);
  });

  it('should reject an invalid code', () => {
    const secret = generateTOTPSecret();
    expect(verifyTOTP(secret, '000000')).toBe(false);
  });

  it('should accept code from adjacent time step (clock drift)', () => {
    const secret = generateTOTPSecret();
    const now = Date.now();
    // Generate code for 30 seconds in the past
    const pastCode = generateTOTP(secret, now - 30_000);
    expect(verifyTOTP(secret, pastCode, now)).toBe(true);
  });

  it('should reject code from 2 steps ago', () => {
    const secret = generateTOTPSecret();
    const now = Date.now();
    // Generate code for 60+ seconds in the past
    const oldCode = generateTOTP(secret, now - 65_000);
    expect(verifyTOTP(secret, oldCode, now)).toBe(false);
  });

  it('should produce deterministic codes for the same time', () => {
    const secret = generateTOTPSecret();
    const time = 1700000000000;
    const code1 = generateTOTP(secret, time);
    const code2 = generateTOTP(secret, time);
    expect(code1).toBe(code2);
  });
});

describe('generateRecoveryCodes', () => {
  it('should generate 10 codes by default', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
  });

  it('should generate unique hex codes', () => {
    const codes = generateRecoveryCodes();
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{10}$/);
    }
  });
});

describe('buildTOTPUri', () => {
  it('should produce a valid otpauth URI', () => {
    const secret = generateTOTPSecret();
    const uri = buildTOTPUri(secret, 'admin@secureyeoman');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(secret);
    expect(uri).toContain('SecureYeoman');
    expect(uri).toContain('admin%40secureyeoman');
  });
});
