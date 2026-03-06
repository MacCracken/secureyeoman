// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock yjs — must use `function` for constructors (vi.mock class pattern)
vi.mock('yjs', () => {
  const mockText = {
    insert: vi.fn(),
    delete: vi.fn(),
    toString: vi.fn(() => 'hello'),
    observe: vi.fn(),
    unobserve: vi.fn(),
    length: 5,
  };
  return {
    Doc: function Doc() {
      return {
        getText: vi.fn(() => mockText),
        transact: vi.fn((fn: () => void) => fn()),
        destroy: vi.fn(),
      };
    },
    encodeStateVector: vi.fn(() => new Uint8Array([1, 2])),
    encodeStateAsUpdate: vi.fn(() => new Uint8Array([3, 4])),
    applyUpdate: vi.fn(),
  };
});

vi.mock('../api/client', () => ({
  getAccessToken: vi.fn(() => 'test-token'),
}));

// Mock WebSocket — track last instance so tests can trigger events
let lastWsInstance: any = null;

const OriginalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  lastWsInstance = null;
  function MockWebSocket(this: any) {
    this.send = vi.fn();
    this.close = vi.fn();
    this.readyState = 1;
    this.binaryType = '';
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    lastWsInstance = this;
    return this;
  }
  MockWebSocket.OPEN = 1;
  (globalThis as any).WebSocket = MockWebSocket as any;
});

afterEach(() => {
  globalThis.WebSocket = OriginalWebSocket;
});

describe('useCollabMonaco', () => {
  async function importHook() {
    const { useCollabMonaco } = await import('./useCollabMonaco.js');
    return useCollabMonaco;
  }

  it('returns inactive state when docId is null', async () => {
    const useCollabMonaco = await importHook();
    const { result } = renderHook(() => useCollabMonaco(null));
    expect(result.current.connected).toBe(false);
    expect(result.current.presenceUsers).toEqual([]);
  });

  it('opens WebSocket when docId is provided', async () => {
    const useCollabMonaco = await importHook();
    renderHook(() => useCollabMonaco('file:/tmp/test.ts'));
    // WebSocket was constructed — verify by checking the instance exists
    expect(lastWsInstance).not.toBeNull();
    expect(lastWsInstance.binaryType).toBe('arraybuffer');
  });

  it('sends sync step 1 on open', async () => {
    const useCollabMonaco = await importHook();
    renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    // Simulate ws.onopen
    act(() => {
      lastWsInstance?.onopen?.();
    });

    expect(lastWsInstance.send).toHaveBeenCalled();
    const sentData = lastWsInstance.send.mock.calls[0][0] as Uint8Array;
    expect(sentData[0]).toBe(0); // MSG_SYNC
    expect(sentData[1]).toBe(0); // SYNC_STEP1
  });

  it('sets connected=true on open', async () => {
    const useCollabMonaco = await importHook();
    const { result } = renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    act(() => {
      lastWsInstance?.onopen?.();
    });

    expect(result.current.connected).toBe(true);
  });

  it('parses awareness messages into presenceUsers', async () => {
    const useCollabMonaco = await importHook();
    const { result } = renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    act(() => {
      lastWsInstance?.onopen?.();
    });

    // Simulate awareness message
    const awareness = {
      type: 'awareness',
      users: [{ clientId: 'c1', name: 'Alice', color: '#6366f1' }],
    };
    const json = JSON.stringify(awareness);
    const bytes = new TextEncoder().encode(json);
    const msg = new Uint8Array(1 + bytes.length);
    msg[0] = 1; // MSG_AWARENESS
    msg.set(bytes, 1);

    act(() => {
      lastWsInstance?.onmessage?.({ data: msg.buffer } as MessageEvent);
    });

    expect(result.current.presenceUsers).toHaveLength(1);
    expect(result.current.presenceUsers[0].name).toBe('Alice');
  });

  it('sets connected=false on close', async () => {
    const useCollabMonaco = await importHook();
    const { result } = renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    act(() => {
      lastWsInstance?.onopen?.();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      lastWsInstance?.onclose?.();
    });
    expect(result.current.connected).toBe(false);
    expect(result.current.presenceUsers).toEqual([]);
  });

  it('provides bindEditor and unbindEditor callbacks', async () => {
    const useCollabMonaco = await importHook();
    const { result } = renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    expect(typeof result.current.bindEditor).toBe('function');
    expect(typeof result.current.unbindEditor).toBe('function');
  });

  it('closes WebSocket on disconnect()', async () => {
    const useCollabMonaco = await importHook();
    const { result } = renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    act(() => {
      result.current.disconnect();
    });

    expect(lastWsInstance.close).toHaveBeenCalled();
  });
});
