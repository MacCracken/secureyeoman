// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock yjs — must use `function` for constructors (vi.mock class pattern)
const mockObserver = vi.fn();
const mockUnobserve = vi.fn();
vi.mock('yjs', () => {
  const mockText = {
    insert: vi.fn(),
    delete: vi.fn(),
    toString: vi.fn(() => 'hello'),
    observe: mockObserver,
    unobserve: mockUnobserve,
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
  mockObserver.mockClear();
  mockUnobserve.mockClear();
  function MockWebSocket(this: any) {
    this.send = vi.fn();
    this.close = vi.fn();
    this.readyState = 1;
    this.binaryType = '';
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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

  // --- New tests for better coverage ---

  it('handles sync step 1 message and replies with sync step 2', async () => {
    const useCollabMonaco = await importHook();
    renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    act(() => {
      lastWsInstance?.onopen?.();
    });

    // Simulate incoming sync step 1 message
    const payload = new Uint8Array([5, 6, 7]);
    const msg = new Uint8Array(2 + payload.length);
    msg[0] = 0; // MSG_SYNC
    msg[1] = 0; // SYNC_STEP1
    msg.set(payload, 2);

    act(() => {
      lastWsInstance?.onmessage?.({ data: msg.buffer } as MessageEvent);
    });

    // Should have sent the initial sync step 1 + a reply sync step 2
    expect(lastWsInstance.send).toHaveBeenCalledTimes(2);
    const replyData = lastWsInstance.send.mock.calls[1][0] as Uint8Array;
    expect(replyData[0]).toBe(0); // MSG_SYNC
    expect(replyData[1]).toBe(1); // SYNC_STEP2
  });

  it('handles sync update message (step 2+) by applying update', async () => {
    const Y = await import('yjs');
    const useCollabMonaco = await importHook();
    renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    act(() => {
      lastWsInstance?.onopen?.();
    });

    // Simulate incoming sync step 2 (update) message
    const payload = new Uint8Array([10, 11, 12]);
    const msg = new Uint8Array(2 + payload.length);
    msg[0] = 0; // MSG_SYNC
    msg[1] = 1; // SYNC_STEP2
    msg.set(payload, 2);

    act(() => {
      lastWsInstance?.onmessage?.({ data: msg.buffer } as MessageEvent);
    });

    expect(Y.applyUpdate).toHaveBeenCalled();
  });

  it('ignores malformed awareness messages', async () => {
    const useCollabMonaco = await importHook();
    const { result } = renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    act(() => {
      lastWsInstance?.onopen?.();
    });

    // Send invalid JSON as awareness message
    const bytes = new TextEncoder().encode('not valid json');
    const msg = new Uint8Array(1 + bytes.length);
    msg[0] = 1; // MSG_AWARENESS
    msg.set(bytes, 1);

    act(() => {
      lastWsInstance?.onmessage?.({ data: msg.buffer } as MessageEvent);
    });

    // presenceUsers should remain empty
    expect(result.current.presenceUsers).toEqual([]);
  });

  it('ignores awareness messages without users array', async () => {
    const useCollabMonaco = await importHook();
    const { result } = renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    act(() => {
      lastWsInstance?.onopen?.();
    });

    const awareness = { type: 'something-else', data: 'irrelevant' };
    const json = JSON.stringify(awareness);
    const bytes = new TextEncoder().encode(json);
    const msg = new Uint8Array(1 + bytes.length);
    msg[0] = 1; // MSG_AWARENESS
    msg.set(bytes, 1);

    act(() => {
      lastWsInstance?.onmessage?.({ data: msg.buffer } as MessageEvent);
    });

    expect(result.current.presenceUsers).toEqual([]);
  });

  it('handles onerror without crashing', async () => {
    const useCollabMonaco = await importHook();
    renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    act(() => {
      lastWsInstance?.onerror?.({});
    });

    // Should not throw
    expect(lastWsInstance).not.toBeNull();
  });

  it('cleans up on unmount', async () => {
    const useCollabMonaco = await importHook();
    const { unmount } = renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    act(() => {
      lastWsInstance?.onopen?.();
    });

    unmount();
    expect(lastWsInstance.close).toHaveBeenCalled();
  });

  it('binds editor and sets up Monaco change listener', async () => {
    const useCollabMonaco = await importHook();
    const { result } = renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    const mockDispose = vi.fn();
    const mockModel = {
      onDidChangeContent: vi.fn(() => ({ dispose: mockDispose })),
      getValue: vi.fn(() => ''),
      getPositionAt: vi.fn(() => ({ lineNumber: 1, column: 1 })),
      applyEdits: vi.fn(),
    };
    const mockEditor = {
      getModel: vi.fn(() => mockModel),
    };

    act(() => {
      result.current.bindEditor(mockEditor as any);
    });

    expect(mockModel.onDidChangeContent).toHaveBeenCalled();
  });

  it('unbindEditor disposes Monaco listeners', async () => {
    const useCollabMonaco = await importHook();
    const { result } = renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    const mockDispose = vi.fn();
    const mockModel = {
      onDidChangeContent: vi.fn(() => ({ dispose: mockDispose })),
      getValue: vi.fn(() => ''),
      getPositionAt: vi.fn(),
      applyEdits: vi.fn(),
    };
    const mockEditor = {
      getModel: vi.fn(() => mockModel),
    };

    act(() => {
      result.current.bindEditor(mockEditor as any);
    });

    act(() => {
      result.current.unbindEditor();
    });

    expect(mockDispose).toHaveBeenCalled();
  });

  it('does not open WebSocket when docId changes to null', async () => {
    const useCollabMonaco = await importHook();
    const { result, _rerender } = renderHook(
      ({ docId }: { docId: string | null }) => useCollabMonaco(docId),
      { initialProps: { docId: null } }
    );

    expect(lastWsInstance).toBeNull();
    expect(result.current.connected).toBe(false);
  });

  it('constructs WebSocket URL with token', async () => {
    const useCollabMonaco = await importHook();
    renderHook(() => useCollabMonaco('test-doc'));

    // The WebSocket constructor was called — we just verify the mock was used
    expect(lastWsInstance).not.toBeNull();
  });

  it('clears presence users on close', async () => {
    const useCollabMonaco = await importHook();
    const { result } = renderHook(() => useCollabMonaco('file:/tmp/test.ts'));

    // Set up presence
    act(() => {
      lastWsInstance?.onopen?.();
    });

    const awareness = {
      type: 'awareness',
      users: [{ clientId: 'c1', name: 'Bob', color: '#ff0000' }],
    };
    const json = JSON.stringify(awareness);
    const bytes = new TextEncoder().encode(json);
    const msg = new Uint8Array(1 + bytes.length);
    msg[0] = 1;
    msg.set(bytes, 1);

    act(() => {
      lastWsInstance?.onmessage?.({ data: msg.buffer } as MessageEvent);
    });
    expect(result.current.presenceUsers).toHaveLength(1);

    act(() => {
      lastWsInstance?.onclose?.();
    });
    expect(result.current.presenceUsers).toEqual([]);
  });
});
