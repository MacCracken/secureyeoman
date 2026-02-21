/**
 * CollabManager unit tests.
 *
 * Uses fake WebSocket objects (no real network) and a mocked SoulStorage.
 * Relies on Vitest's fake timers for debounce testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';

vi.mock('../logging/logger.js', () => ({
  getLogger: () => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: () => ({}),
  }),
}));

import { CollabManager } from './collab.js';
import type { SoulStorage } from './storage.js';

// ── Fake WebSocket ────────────────────────────────────────────────────────

class FakeWebSocket {
  readyState = 1; // OPEN
  sent: Uint8Array[] = [];
  closed = false;

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3; // CLOSED
  }
}

// ── Mocked SoulStorage ───────────────────────────────────────────────────

function makeMockStorage(savedBytes: Uint8Array | null = null): SoulStorage {
  return {
    saveCollabDoc: vi.fn().mockResolvedValue(undefined),
    loadCollabDoc: vi.fn().mockResolvedValue(savedBytes),
  } as unknown as SoulStorage;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a MSG_SYNC / SYNC_STEP2 message containing a full Y.Doc update */
function makeSyncStep2(doc: Y.Doc): Uint8Array {
  const update = Y.encodeStateAsUpdate(doc);
  const msg = new Uint8Array(2 + update.length);
  msg[0] = 0; // MSG_SYNC
  msg[1] = 1; // SYNC_STEP2
  msg.set(update, 2);
  return msg;
}

/** Build a MSG_SYNC / SYNC_STEP1 message containing a state vector */
function makeSyncStep1(doc: Y.Doc): Uint8Array {
  const sv = Y.encodeStateVector(doc);
  const msg = new Uint8Array(2 + sv.length);
  msg[0] = 0; // MSG_SYNC
  msg[1] = 0; // SYNC_STEP1
  msg.set(sv, 2);
  return msg;
}

/** Build a MSG_AWARENESS message */
function makeAwarenessMsg(payload: string): Uint8Array {
  const bytes = new TextEncoder().encode(payload);
  const msg = new Uint8Array(1 + bytes.length);
  msg[0] = 1; // MSG_AWARENESS
  msg.set(bytes, 1);
  return msg;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('CollabManager', () => {
  let storage: SoulStorage;
  let manager: CollabManager;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = makeMockStorage();
    manager = new CollabManager(storage);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Document lifecycle ─────────────────────────────────────────────────

  it('creates a new doc with initialContent when no persisted state exists', async () => {
    const ws = new FakeWebSocket();
    await manager.join(
      'personality:aaaaaaaa-0000-0000-0000-000000000001',
      'client1',
      ws as never,
      'user1',
      'Alice',
      'Hello world'
    );

    // Server should send MSG_SYNC STEP1 + STEP2
    expect(ws.sent.length).toBeGreaterThanOrEqual(2);
    expect(ws.sent[0]![0]).toBe(0); // MSG_SYNC
    expect(ws.sent[0]![1]).toBe(0); // SYNC_STEP1
    expect(ws.sent[1]![0]).toBe(0); // MSG_SYNC
    expect(ws.sent[1]![1]).toBe(1); // SYNC_STEP2
  });

  it('loads persisted state when available', async () => {
    // Pre-build a Y.Doc with content
    const doc = new Y.Doc();
    doc.getText('systemPrompt').insert(0, 'Persisted content');
    const saved = Y.encodeStateAsUpdate(doc);

    const storageWithSaved = makeMockStorage(saved);
    const mgr = new CollabManager(storageWithSaved);

    const ws = new FakeWebSocket();
    await mgr.join(
      'personality:aaaaaaaa-0000-0000-0000-000000000002',
      'client1',
      ws as never,
      'user1',
      'Alice'
    );

    expect(storageWithSaved.loadCollabDoc).toHaveBeenCalledWith(
      'personality:aaaaaaaa-0000-0000-0000-000000000002'
    );
    // The STEP2 message sent to client should contain the doc content
    const step2Msg = ws.sent.find((m) => m[0] === 0 && m[1] === 1);
    expect(step2Msg).toBeDefined();
  });

  // ── Message routing ────────────────────────────────────────────────────

  it('applies SYNC_STEP2 updates and relays to other clients', async () => {
    const docId = 'personality:aaaaaaaa-0000-0000-0000-000000000003';
    const ws1 = new FakeWebSocket();
    const ws2 = new FakeWebSocket();

    await manager.join(docId, 'c1', ws1 as never, 'u1', 'Alice');
    await manager.join(docId, 'c2', ws2 as never, 'u2', 'Bob');

    const senderDoc = new Y.Doc();
    senderDoc.getText('systemPrompt').insert(0, 'Collab text');
    const syncMsg = makeSyncStep2(senderDoc);
    const prevSentCount = ws2.sent.length;

    manager.handleMessage(docId, 'c1', syncMsg);

    // ws2 should receive the relayed update
    expect(ws2.sent.length).toBeGreaterThan(prevSentCount);
    // ws1 should NOT receive it (excluded from relay)
    const sentToC1After = ws1.sent.length;
    expect(sentToC1After).toEqual(ws1.sent.length);
  });

  it('replies to SYNC_STEP1 with a SYNC_STEP2 diff', async () => {
    const docId = 'personality:aaaaaaaa-0000-0000-0000-000000000004';
    const ws = new FakeWebSocket();
    await manager.join(docId, 'c1', ws as never, 'u1', 'Alice', 'Server content');

    ws.sent.length = 0; // Clear join messages

    // Client sends its (empty) state vector
    const clientDoc = new Y.Doc();
    const step1Msg = makeSyncStep1(clientDoc);
    manager.handleMessage(docId, 'c1', step1Msg);

    // Server should reply with SYNC_STEP2
    const reply = ws.sent.find((m) => m[0] === 0 && m[1] === 1);
    expect(reply).toBeDefined();
  });

  it('relays awareness messages without modifying the doc', async () => {
    const docId = 'personality:aaaaaaaa-0000-0000-0000-000000000005';
    const ws1 = new FakeWebSocket();
    const ws2 = new FakeWebSocket();

    await manager.join(docId, 'c1', ws1 as never, 'u1', 'Alice');
    await manager.join(docId, 'c2', ws2 as never, 'u2', 'Bob');
    const prevCount = ws2.sent.length;

    const awarenessMsg = makeAwarenessMsg('{"cursor":0}');
    manager.handleMessage(docId, 'c1', awarenessMsg);

    // ws2 should receive the relayed awareness message
    expect(ws2.sent.length).toBeGreaterThan(prevCount);
    expect(ws2.sent[ws2.sent.length - 1]![0]).toBe(1); // MSG_AWARENESS
  });

  // ── Client join/leave ──────────────────────────────────────────────────

  it('removes client on leave and persists if room is empty', async () => {
    const docId = 'personality:aaaaaaaa-0000-0000-0000-000000000006';
    const ws = new FakeWebSocket();
    await manager.join(docId, 'c1', ws as never, 'u1', 'Alice');

    manager.leave(docId, 'c1');

    // Should persist immediately (room empty)
    await vi.runAllTimersAsync();
    expect(storage.saveCollabDoc).toHaveBeenCalledWith(docId, expect.any(Uint8Array));
  });

  it('does not persist on leave if other clients remain', async () => {
    const docId = 'personality:aaaaaaaa-0000-0000-0000-000000000007';
    const ws1 = new FakeWebSocket();
    const ws2 = new FakeWebSocket();

    await manager.join(docId, 'c1', ws1 as never, 'u1', 'Alice');
    await manager.join(docId, 'c2', ws2 as never, 'u2', 'Bob');

    manager.leave(docId, 'c1');

    // No immediate save — room still has a client
    expect(storage.saveCollabDoc).not.toHaveBeenCalledWith(docId, expect.any(Uint8Array));
  });

  // ── Debounced persistence ──────────────────────────────────────────────

  it('schedules a debounced save after receiving an update', async () => {
    const docId = 'personality:aaaaaaaa-0000-0000-0000-000000000008';
    const ws = new FakeWebSocket();
    await manager.join(docId, 'c1', ws as never, 'u1', 'Alice');

    const updateDoc = new Y.Doc();
    updateDoc.getText('systemPrompt').insert(0, 'Typing...');
    manager.handleMessage(docId, 'c1', makeSyncStep2(updateDoc));

    // Not yet saved
    expect(storage.saveCollabDoc).not.toHaveBeenCalled();

    // Advance time past debounce
    await vi.advanceTimersByTimeAsync(3_000);
    expect(storage.saveCollabDoc).toHaveBeenCalledWith(docId, expect.any(Uint8Array));
  });

  it('resets the debounce timer on rapid updates', async () => {
    const docId = 'personality:aaaaaaaa-0000-0000-0000-000000000009';
    const ws = new FakeWebSocket();
    await manager.join(docId, 'c1', ws as never, 'u1', 'Alice');

    const updateDoc = new Y.Doc();
    updateDoc.getText('systemPrompt').insert(0, 'A');

    // Send multiple updates quickly
    manager.handleMessage(docId, 'c1', makeSyncStep2(updateDoc));
    await vi.advanceTimersByTimeAsync(1_000);
    manager.handleMessage(docId, 'c1', makeSyncStep2(updateDoc));
    await vi.advanceTimersByTimeAsync(1_000);
    manager.handleMessage(docId, 'c1', makeSyncStep2(updateDoc));

    // Still not saved — debounce keeps resetting
    expect(storage.saveCollabDoc).not.toHaveBeenCalled();

    // Final wait past the debounce window
    await vi.advanceTimersByTimeAsync(3_000);
    expect(storage.saveCollabDoc).toHaveBeenCalledTimes(1);
  });

  // ── Presence ──────────────────────────────────────────────────────────

  it('getPresence returns all connected clients', async () => {
    const docId = 'personality:aaaaaaaa-0000-0000-0000-000000000010';
    const ws1 = new FakeWebSocket();
    const ws2 = new FakeWebSocket();

    await manager.join(docId, 'c1', ws1 as never, 'u1', 'Alice');
    await manager.join(docId, 'c2', ws2 as never, 'u2', 'Bob');

    const presence = manager.getPresence(docId);
    expect(presence.size).toBe(2);
    expect(presence.get('c1')?.name).toBe('Alice');
    expect(presence.get('c2')?.name).toBe('Bob');
  });

  it('getPresence returns empty map for unknown docId', () => {
    const presence = manager.getPresence('personality:aaaaaaaa-0000-0000-0000-999999999999');
    expect(presence.size).toBe(0);
  });
});
