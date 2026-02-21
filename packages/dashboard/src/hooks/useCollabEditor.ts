/**
 * useCollabEditor — Yjs CRDT collaborative editor hook.
 *
 * Connects to /ws/collab/:docId, syncs a Y.Text, and exposes:
 *   - text: current string value of the shared text field
 *   - onTextChange: textarea onChange handler (applies diff to Y.Text)
 *   - presenceUsers: other users currently editing
 *   - connected: WebSocket connection status
 *   - disconnect: manual close
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { getAccessToken } from '../api/client.js';

// Yjs / y-websocket protocol constants (mirrored from server)
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;
// SYNC_UPDATE = 2 (not sent by the hook but used when applying server relays)

export interface PresenceUser {
  clientId: string;
  name: string;
  color: string;
}

export interface CollabEditorState {
  text: string;
  onTextChange: (val: string) => void;
  presenceUsers: PresenceUser[];
  connected: boolean;
  disconnect: () => void;
}

/**
 * When docId is null the hook is "disabled": no WebSocket is opened and
 * text/onTextChange behave like ordinary controlled state. This lets callers
 * unconditionally invoke the hook while only activating collab when a real
 * document is being edited.
 */
export function useCollabEditor(
  docId: string | null,
  fieldName: string,
  initialText = ''
): CollabEditorState {
  const [text, setText] = useState(initialText);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);

  const ydocRef = useRef<Y.Doc | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // Sync initialText into plain state when disabled (docId === null)
  useEffect(() => {
    if (docId === null) {
      setText(initialText);
    }
     
  }, [initialText, docId]);

  useEffect(() => {
    if (docId === null) return;

    // Create Y.Doc + Y.Text
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText(fieldName);
    ydocRef.current = ydoc;
    ytextRef.current = ytext;

    // Seed with initial text so the textarea shows something before WS connects
    if (initialText) {
      ydoc.transact(() => {
        ytext.insert(0, initialText);
      });
      setText(initialText);
    }

    // Observe Y.Text changes (from remote updates)
    const observer = () => {
      setText(ytext.toString());
    };
    ytext.observe(observer);

    // Open WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const token = getAccessToken();
    const params = token ? `?token=${encodeURIComponent(token)}` : '';
    const url = `${protocol}//${host}/ws/collab/${encodeURIComponent(docId)}${params}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Send sync step 1: our state vector
      const sv = Y.encodeStateVector(ydoc);
      const msg = new Uint8Array(2 + sv.length);
      msg[0] = MSG_SYNC;
      msg[1] = SYNC_STEP1;
      msg.set(sv, 2);
      ws.send(msg);
    };

    ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const data = new Uint8Array(event.data);
      const msgType = data[0];

      if (msgType === MSG_SYNC) {
        const syncType = data[1];
        const payload = data.subarray(2);

        if (syncType === SYNC_STEP1) {
          // Server sent its state vector; reply with what the server is missing
          const diff = Y.encodeStateAsUpdate(ydoc, payload);
          const reply = new Uint8Array(2 + diff.length);
          reply[0] = MSG_SYNC;
          reply[1] = SYNC_STEP2;
          reply.set(diff, 2);
          ws.send(reply);
        } else {
          // SYNC_STEP2 or SYNC_UPDATE: apply the update
          try {
            Y.applyUpdate(ydoc, payload);
          } catch {
            // Ignore malformed updates
          }
        }
      } else if (msgType === MSG_AWARENESS) {
        // Awareness payload: JSON string after the first byte
        try {
          const json = new TextDecoder().decode(data.subarray(1));
          const parsed = JSON.parse(json) as {
            type: string;
            users: PresenceUser[];
          };
          if (parsed.type === 'awareness' && Array.isArray(parsed.users)) {
            setPresenceUsers(parsed.users);
          }
        } catch {
          // Non-fatal
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setPresenceUsers([]);
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    return () => {
      ytext.unobserve(observer);
      ydoc.destroy();
      ydocRef.current = null;
      ytextRef.current = null;
      ws.close();
      wsRef.current = null;
      setConnected(false);
      setPresenceUsers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, fieldName]);

  const onTextChange = useCallback(
    (val: string) => {
      if (docId === null) {
        // Disabled: plain controlled state
        setText(val);
        return;
      }
      const ytext = ytextRef.current;
      if (!ytext) {
        setText(val);
        return;
      }
      // Phase-1 approach: full replace (safe for single concurrent editor;
      // CRDT convergence still guaranteed for multi-user even if sub-optimal
      // at the exact same cursor position during concurrent edits).
      const ydoc = ydocRef.current!;
      ydoc.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, val);
      });
      // Send the incremental update to the server
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        const update = Y.encodeStateAsUpdate(ydoc);
        const msg = new Uint8Array(2 + update.length);
        msg[0] = MSG_SYNC;
        msg[1] = 2; // SYNC_UPDATE
        msg.set(update, 2);
        ws.send(msg);
      }
    },
    [docId]
  );

  return { text, onTextChange, presenceUsers, connected, disconnect };
}
