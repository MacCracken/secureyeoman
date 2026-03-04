import { describe, it, expect, vi } from 'vitest';
import { toErrorMessage, httpStatusName, sendError } from './errors.js';

describe('toErrorMessage', () => {
  it('returns message from Error instance', () => {
    expect(toErrorMessage(new Error('oops'))).toBe('oops');
  });

  it('returns "Unknown error" for non-Error values', () => {
    expect(toErrorMessage('string error')).toBe('Unknown error');
    expect(toErrorMessage(42)).toBe('Unknown error');
    expect(toErrorMessage(null)).toBe('Unknown error');
    expect(toErrorMessage(undefined)).toBe('Unknown error');
  });
});

describe('httpStatusName', () => {
  it('returns name for known status codes', () => {
    expect(httpStatusName(400)).toBe('Bad Request');
    expect(httpStatusName(401)).toBe('Unauthorized');
    expect(httpStatusName(403)).toBe('Forbidden');
    expect(httpStatusName(404)).toBe('Not Found');
    expect(httpStatusName(500)).toBe('Internal Server Error');
    expect(httpStatusName(503)).toBe('Service Unavailable');
  });

  it('returns "Error" for unknown status codes', () => {
    expect(httpStatusName(418)).toBe('Error');
    expect(httpStatusName(599)).toBe('Error');
  });
});

describe('sendError', () => {
  it('calls reply.code().send() with formatted error body', () => {
    const send = vi.fn();
    const code = vi.fn().mockReturnValue({ send });
    const reply = { code } as any;
    sendError(reply, 404, 'Resource not found');
    expect(code).toHaveBeenCalledWith(404);
    expect(send).toHaveBeenCalledWith({
      error: 'Not Found',
      message: 'Resource not found',
      statusCode: 404,
    });
  });

  it('returns the result of reply.code().send()', () => {
    const send = vi.fn().mockReturnValue('sent');
    const code = vi.fn().mockReturnValue({ send });
    const reply = { code } as any;
    const result = sendError(reply, 500, 'Internal error');
    expect(result).toBe('sent');
  });

  it('sets headers from opts.headers before sending', () => {
    const send = vi.fn();
    const code = vi.fn().mockReturnValue({ send });
    const header = vi.fn().mockReturnThis();
    const reply = { code, header } as any;
    sendError(reply, 429, 'Rate limit exceeded', {
      headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0' },
    });
    expect(header).toHaveBeenCalledWith('Retry-After', '60');
    expect(header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    expect(code).toHaveBeenCalledWith(429);
    expect(send).toHaveBeenCalledWith({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
      statusCode: 429,
    });
  });

  it('merges opts.extra fields into response body', () => {
    const send = vi.fn();
    const code = vi.fn().mockReturnValue({ send });
    const reply = { code } as any;
    sendError(reply, 402, 'Enterprise license required', {
      extra: { feature: 'sso_saml', tier: 'community' },
    });
    expect(send).toHaveBeenCalledWith({
      error: 'Payment Required',
      message: 'Enterprise license required',
      statusCode: 402,
      feature: 'sso_saml',
      tier: 'community',
    });
  });

  it('returns 402 Payment Required for status 402', () => {
    expect(httpStatusName(402)).toBe('Payment Required');
  });
});
