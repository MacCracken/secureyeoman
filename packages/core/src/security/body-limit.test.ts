import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBodyLimitHook } from './body-limit.js';
import type { BodyLimitsConfig } from '@secureyeoman/shared';

// Mock logger
vi.mock('../logging/logger.js', () => {
  const noopLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => noopLogger),
  };
  return {
    getLogger: () => noopLogger,
    createNoopLogger: () => noopLogger,
  };
});

// Mock sendError
const mockSendError = vi.fn();
vi.mock('../utils/errors.js', () => ({
  sendError: (...args: unknown[]) => mockSendError(...args),
}));

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    url: '/api/v1/something',
    headers: {} as Record<string, string | undefined>,
    ...overrides,
  } as any;
}

function makeReply() {
  return {} as any;
}

describe('createBodyLimitHook', () => {
  const config: BodyLimitsConfig = {
    defaultBytes: 1_048_576, // 1 MB
    authBytes: 16_384, // 16 KB
    uploadBytes: 10_485_760, // 10 MB
    chatBytes: 524_288, // 512 KB
  };

  let hook: (request: any, reply: any) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    hook = createBodyLimitHook(config);
  });

  // ── Route categorisation ──────────────────────────────────────────

  it('applies authBytes limit to /api/v1/auth/ routes', async () => {
    const request = makeRequest({
      url: '/api/v1/auth/login',
      headers: { 'content-length': String(config.authBytes + 1) },
    });
    const reply = makeReply();

    await hook(request, reply);

    expect(mockSendError).toHaveBeenCalledWith(reply, 413, 'Request body too large');
  });

  it('applies chatBytes limit to /api/v1/chat/ routes', async () => {
    const request = makeRequest({
      url: '/api/v1/chat/send',
      headers: { 'content-length': String(config.chatBytes + 1) },
    });
    const reply = makeReply();

    await hook(request, reply);

    expect(mockSendError).toHaveBeenCalledWith(reply, 413, 'Request body too large');
  });

  it('applies chatBytes limit to /api/v1/inline-complete/ routes', async () => {
    const request = makeRequest({
      url: '/api/v1/inline-complete/suggest',
      headers: { 'content-length': String(config.chatBytes + 1) },
    });
    const reply = makeReply();

    await hook(request, reply);

    expect(mockSendError).toHaveBeenCalledWith(reply, 413, 'Request body too large');
  });

  it('applies uploadBytes limit to multipart requests', async () => {
    const request = makeRequest({
      url: '/api/v1/files/upload',
      headers: {
        'content-length': String(config.uploadBytes + 1),
        'content-type': 'multipart/form-data; boundary=----abc',
      },
    });
    const reply = makeReply();

    await hook(request, reply);

    expect(mockSendError).toHaveBeenCalledWith(reply, 413, 'Request body too large');
  });

  it('applies defaultBytes limit to unmatched routes', async () => {
    const request = makeRequest({
      url: '/api/v1/tasks',
      headers: { 'content-length': String(config.defaultBytes + 1) },
    });
    const reply = makeReply();

    await hook(request, reply);

    expect(mockSendError).toHaveBeenCalledWith(reply, 413, 'Request body too large');
  });

  // ── Pass-through scenarios ────────────────────────────────────────

  it('allows requests within the default limit', async () => {
    const request = makeRequest({
      url: '/api/v1/tasks',
      headers: { 'content-length': String(config.defaultBytes) },
    });
    const reply = makeReply();

    await hook(request, reply);

    expect(mockSendError).not.toHaveBeenCalled();
  });

  it('allows requests within the auth limit', async () => {
    const request = makeRequest({
      url: '/api/v1/auth/login',
      headers: { 'content-length': String(config.authBytes) },
    });
    const reply = makeReply();

    await hook(request, reply);

    expect(mockSendError).not.toHaveBeenCalled();
  });

  it('allows requests within the chat limit', async () => {
    const request = makeRequest({
      url: '/api/v1/chat/send',
      headers: { 'content-length': String(config.chatBytes) },
    });
    const reply = makeReply();

    await hook(request, reply);

    expect(mockSendError).not.toHaveBeenCalled();
  });

  it('allows multipart requests within the upload limit', async () => {
    const request = makeRequest({
      url: '/api/v1/files/upload',
      headers: {
        'content-length': String(config.uploadBytes),
        'content-type': 'multipart/form-data; boundary=----abc',
      },
    });
    const reply = makeReply();

    await hook(request, reply);

    expect(mockSendError).not.toHaveBeenCalled();
  });

  it('passes through requests without content-length header', async () => {
    const request = makeRequest({
      url: '/api/v1/tasks',
      headers: {},
    });
    const reply = makeReply();

    await hook(request, reply);

    expect(mockSendError).not.toHaveBeenCalled();
  });

  it('passes through requests with non-numeric content-length', async () => {
    const request = makeRequest({
      url: '/api/v1/tasks',
      headers: { 'content-length': 'not-a-number' },
    });
    const reply = makeReply();

    await hook(request, reply);

    expect(mockSendError).not.toHaveBeenCalled();
  });
});
