/**
 * CollabManager — real-time collaborative editing via the Yjs CRDT protocol.
 *
 * Maintains one Y.Doc per docId (e.g. "personality:<uuid>", "skill:<uuid>").
 * Binary Yjs messages are relayed between clients; awareness state carries
 * presence metadata (user name, color). The Y.Doc state is persisted to
 * PostgreSQL on a 2-second debounce and immediately when the last client leaves.
 *
 * Protocol (first byte):
 *   0 = MSG_SYNC     — sync step 1 (state vector) or sync step 2 / update
 *   1 = MSG_AWARENESS — awareness update, relay only
 *
 * Sync message sub-types (second byte when MSG_SYNC):
 *   0 = SYNC_STEP1 — client sends its state vector; server replies with diff
 *   1 = SYNC_STEP2 — client sends a full update (initial convergence)
 *   2 = SYNC_UPDATE — incremental update after editing
 */

import * as Y from 'yjs';
import type { WebSocket } from 'ws';
import type { SoulStorage } from './storage.js';
import { getLogger } from '../logging/logger.js';

// Yjs protocol constants
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;
const SYNC_UPDATE = 2;

// Debounce persistence: 2 seconds of inactivity before writing to DB
const SAVE_DEBOUNCE_MS = 2_000;

// Palette for assigning presence colors (cycles through the list)
const PRESENCE_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#8b5cf6', // violet
  '#14b8a6', // teal
];

let colorIndex = 0;
function nextColor(): string {
  return PRESENCE_COLORS[colorIndex++ % PRESENCE_COLORS.length]!;
}

interface CollabClient {
  ws: WebSocket;
  userId: string;
  displayName: string;
  color: string;
}

interface DocEntry {
  doc: Y.Doc;
  clients: Map<string, CollabClient>; // clientId → client
  saveTimer: NodeJS.Timeout | null;
}

export class CollabManager {
  private docs = new Map<string, DocEntry>();
  private storage: SoulStorage;

  constructor(storage: SoulStorage) {
    this.storage = storage;
  }

  /**
   * Called when a new WebSocket connection opens for a given docId.
   * Loads (or creates) the Y.Doc, sends the initial sync, and registers the client.
   */
  async join(
    docId: string,
    clientId: string,
    socket: WebSocket,
    userId: string,
    displayName: string,
    initialContent?: string
  ): Promise<void> {
    const entry = await this.getOrCreate(docId, initialContent);

    const client: CollabClient = {
      ws: socket,
      userId,
      displayName,
      color: nextColor(),
    };
    entry.clients.set(clientId, client);

    getLogger().debug('Collab client joined', { docId, clientId, userId });

    // Send sync step 1: server state vector so client can compute what it's missing
    const sv = Y.encodeStateVector(entry.doc);
    const syncStep1Msg = new Uint8Array(2 + sv.length);
    syncStep1Msg[0] = MSG_SYNC;
    syncStep1Msg[1] = SYNC_STEP1;
    syncStep1Msg.set(sv, 2);
    this.sendBinary(socket, syncStep1Msg);

    // Also push the full current doc state to the new client (sync step 2)
    const fullUpdate = Y.encodeStateAsUpdate(entry.doc);
    const syncStep2Msg = new Uint8Array(2 + fullUpdate.length);
    syncStep2Msg[0] = MSG_SYNC;
    syncStep2Msg[1] = SYNC_STEP2;
    syncStep2Msg.set(fullUpdate, 2);
    this.sendBinary(socket, syncStep2Msg);

    // Broadcast initial awareness so existing peers know someone joined
    this.broadcastAwareness(docId, clientId, entry);
  }

  /**
   * Called for each binary WebSocket message from a client.
   */
  handleMessage(docId: string, clientId: string, data: Uint8Array): void {
    const entry = this.docs.get(docId);
    if (!entry) return;

    const msgType = data[0];

    if (msgType === MSG_SYNC) {
      const syncType = data[1];
      const payload = data.subarray(2);

      if (syncType === SYNC_STEP1) {
        // Client sent its state vector; reply with what the client is missing
        const clientSv = payload;
        const diff = Y.encodeStateAsUpdate(entry.doc, clientSv);
        const replyMsg = new Uint8Array(2 + diff.length);
        replyMsg[0] = MSG_SYNC;
        replyMsg[1] = SYNC_STEP2;
        replyMsg.set(diff, 2);
        const client = entry.clients.get(clientId);
        if (client) this.sendBinary(client.ws, replyMsg);
      } else if (syncType === SYNC_STEP2 || syncType === SYNC_UPDATE) {
        // Client sent an update; apply to the doc and relay to peers
        try {
          Y.applyUpdate(entry.doc, payload);
        } catch {
          getLogger().warn('Failed to apply Yjs update', { docId, clientId });
          return;
        }
        // Relay the original message (with full header) to all other clients
        this.broadcast(docId, clientId, data);
        this.scheduleSave(docId);
      }
    } else if (msgType === MSG_AWARENESS) {
      // Awareness: just relay to peers, no doc mutation
      this.broadcast(docId, clientId, data);
    }
  }

  /**
   * Called when a WebSocket connection closes.
   */
  leave(docId: string, clientId: string): void {
    const entry = this.docs.get(docId);
    if (!entry) return;

    entry.clients.delete(clientId);
    getLogger().debug('Collab client left', { docId, clientId });

    if (entry.clients.size === 0) {
      // Persist immediately when the room empties
      void this.persistNow(docId, entry);
      if (entry.saveTimer) clearTimeout(entry.saveTimer);
      this.docs.delete(docId);
    } else {
      // Let remaining peers know this client's awareness is gone
      this.broadcastAwareness(docId, clientId, entry);
    }
  }

  /**
   * Return a map of { clientId → { name, color } } for all clients in a doc.
   * Used by the server to build the initial awareness payload.
   */
  getPresence(docId: string): Map<string, { name: string; color: string }> {
    const entry = this.docs.get(docId);
    const result = new Map<string, { name: string; color: string }>();
    if (!entry) return result;
    for (const [cid, client] of entry.clients) {
      result.set(cid, { name: client.displayName, color: client.color });
    }
    return result;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async getOrCreate(docId: string, initialContent?: string): Promise<DocEntry> {
    const existing = this.docs.get(docId);
    if (existing) return existing;

    const doc = new Y.Doc();

    // Load persisted state if available
    const saved = await this.storage.loadCollabDoc(docId);
    if (saved && saved.length > 0) {
      Y.applyUpdate(doc, saved);
    } else if (initialContent) {
      // Seed the doc with the current REST-persisted text
      const fieldName = docId.startsWith('personality:') ? 'systemPrompt' : 'instructions';
      const yText = doc.getText(fieldName);
      doc.transact(() => {
        yText.insert(0, initialContent);
      });
    }

    const entry: DocEntry = { doc, clients: new Map(), saveTimer: null };
    this.docs.set(docId, entry);
    return entry;
  }

  private scheduleSave(docId: string): void {
    const entry = this.docs.get(docId);
    if (!entry) return;
    if (entry.saveTimer) clearTimeout(entry.saveTimer);
    entry.saveTimer = setTimeout(() => {
      void this.persistNow(docId, entry);
    }, SAVE_DEBOUNCE_MS);
  }

  private async persistNow(docId: string, entry: DocEntry): Promise<void> {
    try {
      const stateBytes = Y.encodeStateAsUpdate(entry.doc);
      await this.storage.saveCollabDoc(docId, stateBytes);
      getLogger().debug('Collab doc persisted', { docId });
    } catch (err) {
      getLogger().error('Failed to persist collab doc', {
        docId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private broadcast(docId: string, excludeClientId: string, data: Uint8Array): void {
    const entry = this.docs.get(docId);
    if (!entry) return;
    for (const [cid, client] of entry.clients) {
      if (cid !== excludeClientId && client.ws.readyState === 1 /* OPEN */) {
        this.sendBinary(client.ws, data);
      }
    }
  }

  /**
   * Encode and broadcast a minimal awareness payload listing all current
   * presence entries. Sent on join and leave so the UI always reflects
   * the up-to-date set of editors.
   */
  private broadcastAwareness(docId: string, _triggerClientId: string, entry: DocEntry): void {
    // Build a simple awareness JSON payload wrapped in the MSG_AWARENESS frame.
    // The format is intentionally lightweight (not full Yjs awareness encoding)
    // because our dashboard hook reads it as JSON rather than using the Yjs
    // awareness library client-side.
    const users: Array<{ clientId: string; name: string; color: string }> = [];
    for (const [cid, client] of entry.clients) {
      users.push({ clientId: cid, name: client.displayName, color: client.color });
    }
    const json = JSON.stringify({ type: 'awareness', users });
    const bytes = new TextEncoder().encode(json);
    const msg = new Uint8Array(1 + bytes.length);
    msg[0] = MSG_AWARENESS;
    msg.set(bytes, 1);

    for (const [, client] of entry.clients) {
      if (client.ws.readyState === 1 /* OPEN */) {
        this.sendBinary(client.ws, msg);
      }
    }
  }

  private sendBinary(ws: WebSocket, data: Uint8Array): void {
    try {
      ws.send(data);
    } catch {
      // Socket may have closed between readyState check and send
    }
  }
}
