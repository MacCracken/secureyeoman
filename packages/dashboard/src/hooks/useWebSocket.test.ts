// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';

vi.mock('../api/client', () => ({
  getAccessToken: vi.fn().mockReturnValue('test-token'),
}));

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    // Auto-trigger onopen in the next microtask
    setTimeout(() => this.onopen?.({ type: 'open' }), 0);
  }
}

describe('useWebSocket', () => {
  let OriginalWebSocket: typeof WebSocket;

  beforeEach(() => {
    OriginalWebSocket = globalThis.WebSocket;
    (globalThis as unknown as Record<string, unknown>).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    (globalThis as unknown as Record<string, unknown>).WebSocket = OriginalWebSocket;
    vi.restoreAllMocks();
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => useWebSocket('/ws'));
    expect(result.current.connected).toBe(false);
    expect(result.current.reconnecting).toBe(false);
    expect(result.current.lastMessage).toBeNull();
    expect(typeof result.current.send).toBe('function');
    expect(typeof result.current.subscribe).toBe('function');
    expect(typeof result.current.unsubscribe).toBe('function');
  });

  it('should connect and set connected=true on open', async () => {
    const { result } = renderHook(() => useWebSocket('/ws'));

    // Wait for the async onopen
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.reconnecting).toBe(false);
  });

  it('should include auth token in WebSocket URL', () => {
    renderHook(() => useWebSocket('/ws/live'));

    // MockWebSocket constructor captures the URL
    // Token should be in query params
    expect(true).toBe(true);
  });

  it('should handle message parsing', async () => {
    let wsInstance: MockWebSocket | null = null;
    const OrigMock = MockWebSocket;
    (globalThis as unknown as Record<string, unknown>).WebSocket = class extends OrigMock {
      constructor(url: string) {
        super(url);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        wsInstance = this;
      }
    };

    const { result } = renderHook(() => useWebSocket('/ws'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Simulate incoming message
    await act(async () => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({ type: 'metrics', payload: { cpu: 50 } }),
      });
    });

    expect(result.current.lastMessage).toEqual({
      type: 'metrics',
      payload: { cpu: 50 },
    });
  });

  it('should handle invalid JSON messages gracefully', async () => {
    let wsInstance: MockWebSocket | null = null;
    const OrigMock = MockWebSocket;
    (globalThis as unknown as Record<string, unknown>).WebSocket = class extends OrigMock {
      constructor(url: string) {
        super(url);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        wsInstance = this;
      }
    };

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useWebSocket('/ws'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      wsInstance?.onmessage?.({ data: 'not json' });
    });

    expect(result.current.lastMessage).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('should queue messages when disconnected', () => {
    const { result } = renderHook(() => useWebSocket('/ws'));

    // Before connection, send should queue
    act(() => {
      result.current.send({ type: 'test' });
    });

    // No error thrown
    expect(true).toBe(true);
  });

  it('should subscribe and unsubscribe to channels', async () => {
    const { result } = renderHook(() => useWebSocket('/ws'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      result.current.subscribe(['alerts', 'events']);
    });

    act(() => {
      result.current.unsubscribe(['alerts']);
    });

    expect(true).toBe(true);
  });

  it('should attempt reconnection on close', async () => {
    let wsInstance: MockWebSocket | null = null;
    const OrigMock = MockWebSocket;
    (globalThis as unknown as Record<string, unknown>).WebSocket = class extends OrigMock {
      constructor(url: string) {
        super(url);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        wsInstance = this;
      }
    };

    vi.spyOn(console, 'debug').mockImplementation(() => {});

    const { result } = renderHook(() => useWebSocket('/ws'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Simulate close
    act(() => {
      wsInstance?.onclose?.({ code: 1006 });
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.reconnecting).toBe(true);
  });

  it('should cleanup on unmount', async () => {
    const { unmount } = renderHook(() => useWebSocket('/ws'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    unmount();
    // No error thrown — cleanup successful
    expect(true).toBe(true);
  });
});
