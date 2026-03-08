import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBridge } from './event-bridge.js';

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as any;
}

describe('EventBridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('broadcast', () => {
    it('sends SSE events to connected clients', () => {
      const bridge = new EventBridge({}, { logger: makeLogger() });

      // Simulate a connected client via internal state
      const written: string[] = [];
      const mockReply = {
        raw: {
          write: (data: string) => {
            written.push(data);
            return true;
          },
          writeHead: vi.fn(),
          end: vi.fn(),
        },
      };

      // Access internal clients map
      (bridge as any).clients.set('test-1', {
        id: 'test-1',
        source: 'agnostic',
        reply: mockReply,
        connectedAt: Date.now(),
      });

      const sent = bridge.broadcast('task:completed', { taskId: 'T1' });
      expect(sent).toBe(1);
      expect(written.length).toBe(1);
      expect(written[0]).toContain('event: task:completed');
      expect(written[0]).toContain('"taskId":"T1"');
    });

    it('returns 0 when no clients connected', () => {
      const bridge = new EventBridge({}, { logger: makeLogger() });
      expect(bridge.broadcast('test', {})).toBe(0);
    });

    it('removes failed clients on write error', () => {
      const bridge = new EventBridge({}, { logger: makeLogger() });

      const mockReply = {
        raw: {
          write: () => {
            throw new Error('broken pipe');
          },
        },
      };

      (bridge as any).clients.set('bad-1', {
        id: 'bad-1',
        source: 'test',
        reply: mockReply,
        connectedAt: Date.now(),
      });

      const sent = bridge.broadcast('test', {});
      expect(sent).toBe(0);
      expect((bridge as any).clients.size).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('connects to remote SSE and dispatches events', async () => {
      const events: Array<{ source: string; event: string; data: unknown }> = [];

      // Create a mock SSE stream
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('event: qa_complete\ndata: {"taskId":"T1"}\n\n')
          );
          controller.close();
        },
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: stream,
        })
      );

      const bridge = new EventBridge(
        { maxReconnectAttempts: 1, reconnectDelayMs: 10 },
        {
          logger: makeLogger(),
          onRemoteEvent: (source, event, data) => events.push({ source, event, data }),
        }
      );

      await bridge.subscribe('agnostic', 'http://localhost:8000/events', 'key');

      // Wait for stream processing
      await new Promise((r) => setTimeout(r, 100));

      expect(events.length).toBe(1);
      expect(events[0].source).toBe('agnostic');
      expect(events[0].event).toBe('qa_complete');
      expect(events[0].data).toEqual({ taskId: 'T1' });
    });
  });

  describe('unsubscribe', () => {
    it('aborts active subscription', () => {
      const bridge = new EventBridge({}, { logger: makeLogger() });
      const abort = new AbortController();
      (bridge as any).subscriptionAborts.set('test', abort);

      bridge.unsubscribe('test');
      expect(abort.signal.aborted).toBe(true);
      expect((bridge as any).subscriptionAborts.size).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('cleans up all connections', () => {
      const logger = makeLogger();
      const bridge = new EventBridge({}, { logger });

      const abort = new AbortController();
      (bridge as any).subscriptionAborts.set('sub-1', abort);
      (bridge as any).clients.set('cli-1', {
        id: 'cli-1',
        source: 'test',
        reply: { raw: { end: vi.fn() } },
        connectedAt: Date.now(),
      });

      bridge.shutdown();
      expect(abort.signal.aborted).toBe(true);
      expect((bridge as any).clients.size).toBe(0);
      expect((bridge as any).subscriptionAborts.size).toBe(0);
    });
  });
});
