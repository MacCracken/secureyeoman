/**
 * useCollabEditor hook tests.
 *
 * Uses a minimal WebSocket mock (no real network). The mock captures
 * sent binary messages so we can verify the Yjs sync protocol.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as Y from 'yjs';

// ── WebSocket mock ────────────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  readyState: number = 1; // OPEN
  binaryType = 'arraybuffer';
  sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Trigger onopen asynchronously
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  /** Simulate receiving a binary message from the server */
  simulateMessage(data: Uint8Array): void {
    // Copy into a plain ArrayBuffer to satisfy the type
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    this.onmessage?.({ data: buf });
  }
}

// ── Mock getAccessToken ──────────────────────────────────────────────────

vi.mock('../api/client.js', () => ({
  getAccessToken: () => 'test-token',
}));

// ── Constants ─────────────────────────────────────────────────────────────

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;

function makeSyncStep2(doc: Y.Doc): Uint8Array {
  const update = Y.encodeStateAsUpdate(doc);
  const msg = new Uint8Array(2 + update.length);
  msg[0] = MSG_SYNC;
  msg[1] = SYNC_STEP2;
  msg.set(update, 2);
  return msg;
}

function makeAwarenessMsg(users: Array<{ clientId: string; name: string; color: string }>): Uint8Array {
  const json = JSON.stringify({ type: 'awareness', users });
  const bytes = new TextEncoder().encode(json);
  const msg = new Uint8Array(1 + bytes.length);
  msg[0] = MSG_AWARENESS;
  msg.set(bytes, 1);
  return msg;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('useCollabEditor', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Lazy import inside tests so the mock is in place
  async function importHook() {
    const { useCollabEditor } = await import('./useCollabEditor.js');
    return useCollabEditor;
  }

  it('does not open a WebSocket when docId is null', async () => {
    const useCollabEditor = await importHook();
    renderHook(() => useCollabEditor(null, 'systemPrompt', 'initial'));
    expect(MockWebSocket.instances.length).toBe(0);
  });

  it('opens a WebSocket with correct URL when docId is provided', async () => {
    const useCollabEditor = await importHook();
    renderHook(() =>
      useCollabEditor('personality:aaaa-0000-0000-0000-000000000001', 'systemPrompt', '')
    );
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0]!.url).toContain('/ws/collab/');
    expect(MockWebSocket.instances[0]!.url).toContain('token=test-token');
  });

  it('sends sync step 1 on open', async () => {
    const useCollabEditor = await importHook();
    renderHook(() =>
      useCollabEditor('personality:aaaa-0000-0000-0000-000000000002', 'systemPrompt', '')
    );
    // Wait for onopen to fire
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const ws = MockWebSocket.instances[0]!;
    const syncStep1 = ws.sent.find((m) => m[0] === MSG_SYNC && m[1] === SYNC_STEP1);
    expect(syncStep1).toBeDefined();
  });

  it('updates text state when a SYNC_STEP2 message is received', async () => {
    const useCollabEditor = await importHook();
    const { result } = renderHook(() =>
      useCollabEditor('personality:aaaa-0000-0000-0000-000000000003', 'systemPrompt', '')
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const ws = MockWebSocket.instances[0]!;

    // Server sends a doc update with 'Hello'
    const serverDoc = new Y.Doc();
    serverDoc.getText('systemPrompt').insert(0, 'Hello');
    const step2 = makeSyncStep2(serverDoc);

    act(() => {
      ws.simulateMessage(step2);
    });

    expect(result.current.text).toBe('Hello');
  });

  it('sends an update to the server when onTextChange is called', async () => {
    const useCollabEditor = await importHook();
    const { result } = renderHook(() =>
      useCollabEditor('personality:aaaa-0000-0000-0000-000000000004', 'systemPrompt', '')
    );

    // Wait for WS to open and sync step 1 to be sent
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
    // Clear messages sent during connection
    ws.sent.length = 0;

    await act(async () => {
      result.current.onTextChange('New value');
    });

    // Should have sent a SYNC_UPDATE (type 2) to the server
    const update = ws.sent.find((m) => m[0] === MSG_SYNC && m[1] === 2);
    expect(update).toBeDefined();
  });

  it('updates presenceUsers from awareness messages', async () => {
    const useCollabEditor = await importHook();
    const { result } = renderHook(() =>
      useCollabEditor('personality:aaaa-0000-0000-0000-000000000005', 'systemPrompt', '')
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const ws = MockWebSocket.instances[0]!;
    const awarenessMsg = makeAwarenessMsg([
      { clientId: 'c1', name: 'Alice', color: '#ff0000' },
    ]);

    act(() => {
      ws.simulateMessage(awarenessMsg);
    });

    expect(result.current.presenceUsers).toEqual([
      { clientId: 'c1', name: 'Alice', color: '#ff0000' },
    ]);
  });

  it('clears presenceUsers and connected on disconnect', async () => {
    const useCollabEditor = await importHook();
    const { result, unmount } = renderHook(() =>
      useCollabEditor('personality:aaaa-0000-0000-0000-000000000006', 'systemPrompt', '')
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      unmount();
    });

    expect(result.current.presenceUsers).toEqual([]);
  });

  it('plain-state fallback when docId is null and onTextChange is called', async () => {
    const useCollabEditor = await importHook();
    const { result } = renderHook(() => useCollabEditor(null, 'systemPrompt', 'init'));

    act(() => {
      result.current.onTextChange('updated');
    });

    expect(result.current.text).toBe('updated');
    expect(result.current.connected).toBe(false);
    expect(result.current.presenceUsers).toEqual([]);
  });
});
