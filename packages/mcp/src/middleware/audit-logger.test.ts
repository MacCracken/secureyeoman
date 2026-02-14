import { describe, it, expect, vi } from 'vitest';
import { createAuditLogger } from './audit-logger.js';
import type { CoreApiClient } from '../core-client.js';

function mockClient(): CoreApiClient {
  return {
    post: vi.fn().mockResolvedValue({}),
    get: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    healthCheck: vi.fn(),
  } as unknown as CoreApiClient;
}

describe('audit-logger', () => {
  it('should log an audit entry', async () => {
    const client = mockClient();
    const logger = createAuditLogger(client);

    await logger.log({
      event: 'mcp_tool_call',
      level: 'info',
      message: 'Test log',
    });

    expect(client.post).toHaveBeenCalledWith('/api/v1/audit', {
      event: 'mcp_tool_call',
      level: 'info',
      message: 'Test log',
    });
  });

  it('should not throw on log failure', async () => {
    const client = mockClient();
    (client.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const logger = createAuditLogger(client);

    await expect(logger.log({ event: 'test', level: 'info', message: 'fail' })).resolves.not.toThrow();
  });

  it('wrap should execute function and log success', async () => {
    const client = mockClient();
    const logger = createAuditLogger(client);

    const result = await logger.wrap('test_tool', { q: 'hello' }, async () => 42);
    expect(result).toBe(42);
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/audit',
      expect.objectContaining({
        event: 'mcp_tool_call',
        level: 'info',
        metadata: expect.objectContaining({ toolName: 'test_tool', success: true }),
      }),
    );
  });

  it('wrap should log errors on failure', async () => {
    const client = mockClient();
    const logger = createAuditLogger(client);

    await expect(
      logger.wrap('failing_tool', {}, async () => {
        throw new Error('Boom');
      }),
    ).rejects.toThrow('Boom');

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/audit',
      expect.objectContaining({
        event: 'mcp_tool_call',
        level: 'error',
        metadata: expect.objectContaining({ toolName: 'failing_tool', success: false }),
      }),
    );
  });

  it('wrap should include duration in metadata', async () => {
    const client = mockClient();
    const logger = createAuditLogger(client);

    await logger.wrap('slow_tool', {}, async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'done';
    });

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/audit',
      expect.objectContaining({
        metadata: expect.objectContaining({ duration: expect.any(Number) }),
      }),
    );
  });
});
