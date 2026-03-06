/**
 * useCollabMonaco — Yjs CRDT collaborative editing for Monaco editor.
 *
 * Same binary WebSocket protocol as useCollabEditor, but binds to a Monaco
 * editor model instead of a textarea. Uses Monaco change events for precise
 * Yjs operations rather than full-text replace.
 *
 * Pass docId = null to disable (no WebSocket opened).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { getAccessToken } from '../api/client.js';
import type { PresenceUser } from './useCollabEditor.js';

// Yjs protocol constants (mirrored from server)
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;

type MonacoEditor = import('monaco-editor').editor.IStandaloneCodeEditor;
type MonacoModel = import('monaco-editor').editor.ITextModel;

export interface CollabMonacoState {
  /** Bind to a mounted Monaco editor instance */
  bindEditor: (editor: MonacoEditor) => void;
  /** Unbind (called on unmount or tab switch) */
  unbindEditor: () => void;
  /** Other users currently editing */
  presenceUsers: PresenceUser[];
  /** WebSocket connection status */
  connected: boolean;
  /** Manual disconnect */
  disconnect: () => void;
}

export function useCollabMonaco(docId: string | null): CollabMonacoState {
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);

  const ydocRef = useRef<Y.Doc | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const editorRef = useRef<MonacoEditor | null>(null);
  const isRemoteRef = useRef(false); // guard against echo loops
  const disposablesRef = useRef<{ dispose: () => void }[]>([]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // Clean up Monaco bindings
  const cleanupMonaco = useCallback(() => {
    for (const d of disposablesRef.current) d.dispose();
    disposablesRef.current = [];
    editorRef.current = null;
  }, []);

  // Bind Yjs text ↔ Monaco model
  const applyBinding = useCallback(() => {
    const editor = editorRef.current;
    const ytext = ytextRef.current;
    if (!editor || !ytext) return;

    const model = editor.getModel();
    if (!model) return;

    // Monaco → Yjs: on user edit, apply delta to Y.Text
    const contentDisposable = model.onDidChangeContent((e) => {
      if (isRemoteRef.current) return;
      const ydoc = ydocRef.current;
      if (!ydoc || !ytext) return;

      ydoc.transact(() => {
        // Process changes in reverse offset order to keep positions valid
        const sorted = [...e.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
        for (const change of sorted) {
          if (change.rangeLength > 0) {
            ytext.delete(change.rangeOffset, change.rangeLength);
          }
          if (change.text) {
            ytext.insert(change.rangeOffset, change.text);
          }
        }
      });

      // Send incremental update
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN && ydoc) {
        const update = Y.encodeStateAsUpdate(ydoc);
        const msg = new Uint8Array(2 + update.length);
        msg[0] = MSG_SYNC;
        msg[1] = 2; // SYNC_UPDATE
        msg.set(update, 2);
        ws.send(msg);
      }
    });
    disposablesRef.current.push(contentDisposable);

    // Yjs → Monaco: on remote update, apply to model
    const observer = (event: Y.YTextEvent) => {
      if (event.transaction.local) return;
      const model2 = editorRef.current?.getModel();
      if (!model2) return;

      isRemoteRef.current = true;
      try {
        let offset = 0;
        const edits: {
          range: import('monaco-editor').IRange;
          text: string;
        }[] = [];

        for (const delta of event.delta) {
          if (delta.retain != null) {
            offset += delta.retain;
          } else if (delta.insert != null) {
            const pos = model2.getPositionAt(offset);
            edits.push({
              range: {
                startLineNumber: pos.lineNumber,
                startColumn: pos.column,
                endLineNumber: pos.lineNumber,
                endColumn: pos.column,
              },
              text: delta.insert as string,
            });
            offset += (delta.insert as string).length;
          } else if (delta.delete != null) {
            const start = model2.getPositionAt(offset);
            const end = model2.getPositionAt(offset + delta.delete);
            edits.push({
              range: {
                startLineNumber: start.lineNumber,
                startColumn: start.column,
                endLineNumber: end.lineNumber,
                endColumn: end.column,
              },
              text: '',
            });
          }
        }

        if (edits.length > 0) {
          model2.applyEdits(edits);
        }
      } finally {
        isRemoteRef.current = false;
      }
    };
    ytext.observe(observer);
    disposablesRef.current.push({
      dispose: () => {
        ytext.unobserve(observer);
      },
    });
  }, []);

  // Main effect: manage Y.Doc + WebSocket lifecycle
  useEffect(() => {
    if (docId === null) return;

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('content');
    ydocRef.current = ydoc;
    ytextRef.current = ytext;

    // Seed with current editor content if available
    const editor = editorRef.current;
    if (editor) {
      const model = editor.getModel();
      if (model) {
        const currentText = model.getValue();
        if (currentText) {
          ydoc.transact(() => {
            ytext.insert(0, currentText);
          });
        }
      }
    }

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
          const diff = Y.encodeStateAsUpdate(ydoc, payload);
          const reply = new Uint8Array(2 + diff.length);
          reply[0] = MSG_SYNC;
          reply[1] = SYNC_STEP2;
          reply.set(diff, 2);
          ws.send(reply);
        } else {
          try {
            Y.applyUpdate(ydoc, payload);
          } catch {
            // Ignore malformed updates
          }
        }
      } else if (msgType === MSG_AWARENESS) {
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

    ws.onerror = () => {};

    // Bind if editor is already mounted
    applyBinding();

    return () => {
      cleanupMonaco();
      ydoc.destroy();
      ydocRef.current = null;
      ytextRef.current = null;
      ws.close();
      wsRef.current = null;
      setConnected(false);
      setPresenceUsers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const bindEditor = useCallback(
    (editor: MonacoEditor) => {
      cleanupMonaco();
      editorRef.current = editor;
      applyBinding();
    },
    [cleanupMonaco, applyBinding]
  );

  const unbindEditor = useCallback(() => {
    cleanupMonaco();
  }, [cleanupMonaco]);

  return { bindEditor, unbindEditor, presenceUsers, connected, disconnect };
}
