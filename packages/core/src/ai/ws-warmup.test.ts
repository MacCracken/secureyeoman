import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsWarmup } from './ws-warmup.js';
import type { OpenAIWsTransport, WsServerEvent } from './transports/openai-ws-transport.js';

function createMockLogger() {
  return {
    child: () => createMockLogger(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as import('../logging/logger.js').SecureLogger;
}

function createMockTransport() {
  const acquire = vi.fn();
  const release = vi.fn();
  const send = vi.fn();
  return {
    acquire,
    release,
    send,
  } as unknown as OpenAIWsTransport & {
    acquire: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

describe('WsWarmup', () => {
  let warmup: WsWarmup;
  let transport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    transport = createMockTransport();
  });

  it('should return false when disabled', async () => {
    warmup = new WsWarmup({
      logger: createMockLogger(),
      transport,
      config: { enabled: false },
    });
    const result = await warmup.warmup('sess-1', { model: 'gpt-4o' });
    expect(result).toBe(false);
    expect(transport.acquire).not.toHaveBeenCalled();
  });

  it('should acquire connection, send minimal payload, and release', async () => {
    warmup = new WsWarmup({
      logger: createMockLogger(),
      transport,
      config: { enabled: true },
    });

    const mockConn = { id: 'c1', sessionKey: 'sess-1', state: 'open' };
    transport.acquire.mockResolvedValue(mockConn);

    // Simulate a completed response
    async function* completedEvents(): AsyncGenerator<WsServerEvent> {
      yield { type: 'response.completed', response: { id: 'resp-1', status: 'completed' } };
    }
    transport.send.mockReturnValue(completedEvents());

    const result = await warmup.warmup('sess-1', {
      model: 'gpt-4o',
      systemPrompt: 'You are a helpful assistant.',
    });

    expect(result).toBe(true);
    expect(transport.acquire).toHaveBeenCalledWith('sess-1');
    expect(transport.release).toHaveBeenCalledWith(mockConn);

    // Verify payload structure
    const [, payload] = transport.send.mock.calls[0]!;
    expect(payload.type).toBe('response.create');
    expect(payload.response.max_output_tokens).toBe(1);
    expect(payload.response.model).toBe('gpt-4o');
    expect(payload.response.input).toHaveLength(2); // system + user
  });

  it('should include tools in warm-up payload when provided', async () => {
    warmup = new WsWarmup({
      logger: createMockLogger(),
      transport,
      config: { enabled: true },
    });

    const mockConn = { id: 'c1', sessionKey: 'default', state: 'open' };
    transport.acquire.mockResolvedValue(mockConn);

    async function* completedEvents(): AsyncGenerator<WsServerEvent> {
      yield { type: 'response.completed', response: { id: 'resp-2', status: 'completed' } };
    }
    transport.send.mockReturnValue(completedEvents());

    await warmup.warmup('default', {
      model: 'gpt-4o',
      tools: [
        {
          name: 'search',
          description: 'Search the web',
          parameters: { type: 'object', properties: { q: { type: 'string' } } },
        },
      ],
    });

    const [, payload] = transport.send.mock.calls[0]!;
    expect(payload.response.tools).toHaveLength(1);
    expect(payload.response.tools[0].name).toBe('search');
  });

  it('should return false on transport error', async () => {
    const logger = createMockLogger();
    warmup = new WsWarmup({
      logger,
      transport,
      config: { enabled: true },
    });

    transport.acquire.mockRejectedValue(new Error('Connection refused'));

    const result = await warmup.warmup('sess-2', { model: 'gpt-4o' });
    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should handle error events from server', async () => {
    warmup = new WsWarmup({
      logger: createMockLogger(),
      transport,
      config: { enabled: true },
    });

    const mockConn = { id: 'c1', sessionKey: 'sess-3', state: 'open' };
    transport.acquire.mockResolvedValue(mockConn);

    async function* errorEvents(): AsyncGenerator<WsServerEvent> {
      yield { type: 'error', error: { code: 'server_error', message: 'overloaded' } };
    }
    transport.send.mockReturnValue(errorEvents());

    const result = await warmup.warmup('sess-3', { model: 'gpt-4o' });
    // Still returns true — the event was consumed (error is terminal)
    expect(result).toBe(true);
    expect(transport.release).toHaveBeenCalledWith(mockConn);
  });

  it('should send only user message when no system prompt', async () => {
    warmup = new WsWarmup({
      logger: createMockLogger(),
      transport,
      config: { enabled: true },
    });

    const mockConn = { id: 'c1', sessionKey: 'sess-4', state: 'open' };
    transport.acquire.mockResolvedValue(mockConn);

    async function* completedEvents(): AsyncGenerator<WsServerEvent> {
      yield { type: 'response.completed', response: { id: 'resp-3', status: 'completed' } };
    }
    transport.send.mockReturnValue(completedEvents());

    await warmup.warmup('sess-4', { model: 'gpt-4o' });

    const [, payload] = transport.send.mock.calls[0]!;
    expect(payload.response.input).toHaveLength(1); // only user message
    expect(payload.response.input[0].role).toBe('user');
  });

  it('enabled getter reflects config', () => {
    warmup = new WsWarmup({
      logger: createMockLogger(),
      transport,
      config: { enabled: true },
    });
    expect(warmup.enabled).toBe(true);

    warmup = new WsWarmup({
      logger: createMockLogger(),
      transport,
      config: { enabled: false },
    });
    expect(warmup.enabled).toBe(false);
  });
});
