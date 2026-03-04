/**
 * Interactive Excalidraw Canvas Widget — Phase 117-B
 *
 * Three view modes: Draw (interactive editor) | JSON | SVG
 * Supports AI → Editor push via WebSocket and KB integration.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { ExcalidrawEditorLazy } from './ExcalidrawEditorLazy';
import { useWebSocket } from '../../../hooks/useWebSocket';

// ── Types ────────────────────────────────────────────────────────────

interface ExcalidrawElement {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  text?: string;
  originalText?: string;
  fontSize?: number;
  fontFamily?: number;
  points?: number[][];
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  roundness?: { type: number } | null;
  id?: string;
}

interface ExcalidrawScene {
  type?: string;
  version?: number;
  elements: ExcalidrawElement[];
  appState?: Record<string, unknown>;
}

interface KbDocument {
  id: string;
  title: string;
  format: string | null;
}

export interface ExcalidrawWidgetProps {
  sceneJson?: string;
  documentId?: string;
  nodeId?: string;
  onConfigChange?: (config: { excalidrawSceneJson?: string; excalidrawDocumentId?: string }) => void;
}

type ViewMode = 'draw' | 'json' | 'svg';

// ── SVG Renderer (read-only preview) ─────────────────────────────────

function renderSceneSvg(scene: ExcalidrawScene): string {
  const elements = scene.elements ?? [];
  if (elements.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text x="20" y="50" font-size="14" fill="#666">Empty scene</text></svg>';
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const w = el.width ?? 100;
    const h = el.height ?? 50;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  const pad = 20;
  const vw = maxX - minX + pad * 2;
  const vh = maxY - minY + pad * 2;

  const shapes: string[] = [];
  for (const el of elements) {
    const x = (el.x ?? 0) - minX + pad;
    const y = (el.y ?? 0) - minY + pad;
    const w = el.width ?? 100;
    const h = el.height ?? 50;
    const stroke = el.strokeColor ?? '#1e1e1e';
    const fill = el.backgroundColor === 'transparent' || !el.backgroundColor ? 'none' : el.backgroundColor;

    switch (el.type) {
      case 'rectangle':
        shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" rx="${el.roundness ? 8 : 0}" />`);
        break;
      case 'ellipse':
        shapes.push(`<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`);
        break;
      case 'diamond': {
        const cx = x + w / 2, cy = y + h / 2;
        shapes.push(`<polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`);
        break;
      }
      case 'text': {
        const fontSize = el.fontSize ?? 16;
        const text = el.text ?? el.originalText ?? '';
        shapes.push(`<text x="${x}" y="${y + fontSize}" font-size="${fontSize}" fill="${stroke}" font-family="sans-serif">${escapeHtml(text)}</text>`);
        break;
      }
      case 'arrow':
      case 'line': {
        const pts = el.points ?? [[0, 0], [w, 0]];
        if (pts.length >= 2) {
          const x1 = x + (pts[0]?.[0] ?? 0);
          const y1 = y + (pts[0]?.[1] ?? 0);
          const x2 = x + (pts[pts.length - 1]?.[0] ?? 0);
          const y2 = y + (pts[pts.length - 1]?.[1] ?? 0);
          shapes.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1.5" />`);
          if (el.type === 'arrow') {
            shapes.push(`<circle cx="${x2}" cy="${y2}" r="3" fill="${stroke}" />`);
          }
        }
        break;
      }
      default:
        shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#ccc" stroke-width="1" stroke-dasharray="4" />`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}">${shapes.join('')}</svg>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Component ────────────────────────────────────────────────────────

export function ExcalidrawWidget({ sceneJson, documentId, nodeId, onConfigChange }: ExcalidrawWidgetProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('draw');
  const [jsonText, setJsonText] = useState(sceneJson ?? '');
  const [kbDocs, setKbDocs] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(false);

  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const sceneDataRef = useRef<{ elements: readonly Record<string, unknown>[]; appState: Record<string, unknown> } | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WebSocket for AI → Editor push
  const { lastMessage, subscribe } = useWebSocket('/ws/metrics');

  useEffect(() => {
    subscribe(['excalidraw']);
  }, [subscribe]);

  // Push AI-generated scenes into live editor
  useEffect(() => {
    if (!lastMessage || lastMessage.channel !== 'excalidraw') return;
    const payload = lastMessage.payload as { documentId?: string; scene?: ExcalidrawScene; source?: string };
    if (!payload.scene) return;
    // If nodeId-linked to a specific document, only accept matching ones
    if (documentId && payload.documentId && payload.documentId !== documentId) return;

    const elements = payload.scene.elements ?? [];
    excalidrawAPIRef.current?.updateScene({ elements: elements as never[] });
    setJsonText(JSON.stringify(payload.scene, null, 2));
  }, [lastMessage, documentId]);

  // Theme detection
  const theme = useMemo<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'light';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }, []);

  // Parse scene for SVG mode
  const scene = useMemo<ExcalidrawScene | null>(() => {
    try {
      const text = jsonText.trim();
      if (!text) return null;
      return JSON.parse(text) as ExcalidrawScene;
    } catch {
      return null;
    }
  }, [jsonText]);

  const svgString = useMemo(() => {
    if (!scene) return null;
    try { return renderSceneSvg(scene); } catch { return null; }
  }, [scene]);

  // Initial data for Excalidraw editor
  const initialData = useMemo(() => {
    if (!scene) return undefined;
    return { elements: scene.elements as unknown as readonly Record<string, unknown>[] };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  // ── KB operations ──────────────────────────────────────────────────

  const loadKbDocs = useCallback(async () => {
    try {
      const resp = await fetch('/api/v1/brain/documents?format=excalidraw');
      if (resp.ok) {
        const data = await resp.json() as { documents: KbDocument[] };
        setKbDocs(data.documents ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadKbDocs(); }, [loadKbDocs]);

  const handleLoadFromKb = useCallback(async (docId: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/v1/brain/documents/${docId}`);
      if (!resp.ok) throw new Error('Failed to load document');
      const data = await resp.json() as { document: KbDocument & { content?: string; metadata?: { excalidrawScene?: ExcalidrawScene } } };
      onConfigChange?.({ excalidrawDocumentId: data.document.id });

      // Push scene into live editor if available
      const sceneData = data.document.metadata?.excalidrawScene;
      if (sceneData) {
        const elements = sceneData.elements ?? [];
        excalidrawAPIRef.current?.updateScene({ elements: elements as never[] });
        setJsonText(JSON.stringify(sceneData, null, 2));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [onConfigChange]);

  const handleSaveToKb = useCallback(async () => {
    const currentScene = sceneDataRef.current
      ? { elements: sceneDataRef.current.elements }
      : scene;
    if (!currentScene) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/v1/brain/documents/ingest-excalidraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene: currentScene,
          title: `Excalidraw — ${new Date().toISOString().slice(0, 16)}`,
        }),
      });
      if (!resp.ok) throw new Error('Failed to save');
      const data = await resp.json() as { document: KbDocument };
      const sceneStr = JSON.stringify(currentScene, null, 2);
      setJsonText(sceneStr);
      onConfigChange?.({
        excalidrawSceneJson: sceneStr,
        excalidrawDocumentId: data.document.id,
      });
      void loadKbDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }, [scene, onConfigChange, loadKbDocs]);

  // ── Draw mode onChange (debounced) ─────────────────────────────────

  const handleEditorChange = useCallback(
    (elements: readonly Record<string, unknown>[], appState: Record<string, unknown>) => {
      sceneDataRef.current = { elements, appState };

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        const sceneStr = JSON.stringify({ elements }, null, 2);
        setJsonText(sceneStr);
        onConfigChange?.({ excalidrawSceneJson: sceneStr, excalidrawDocumentId: documentId });
      }, 500);
    },
    [documentId, onConfigChange]
  );

  // Auto-sync to KB (5s debounce)
  useEffect(() => {
    if (!autoSync || !sceneDataRef.current) return;

    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = setTimeout(() => {
      void handleSaveToKb();
    }, 5000);

    return () => {
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    };
  }, [autoSync, jsonText, handleSaveToKb]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    };
  }, []);

  const handleJsonChange = useCallback((val: string) => {
    setJsonText(val);
    onConfigChange?.({ excalidrawSceneJson: val, excalidrawDocumentId: documentId });
  }, [documentId, onConfigChange]);

  // Sync JSON edits into Draw mode when switching
  const handleModeSwitch = useCallback((mode: ViewMode) => {
    if (viewMode === 'json' && mode === 'draw') {
      // Push JSON textarea edits into the live editor
      try {
        const parsed = JSON.parse(jsonText) as ExcalidrawScene;
        const elements = parsed.elements ?? [];
        excalidrawAPIRef.current?.updateScene({ elements: elements as never[] });
      } catch { /* invalid JSON, keep editor as-is */ }
    }
    setViewMode(mode);
  }, [viewMode, jsonText]);

  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawAPIRef.current = api;
  }, []);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b text-xs">
        <div className="flex rounded overflow-hidden border mr-1">
          {(['draw', 'json', 'svg'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeSwitch(mode)}
              className={`px-2 py-0.5 text-xs capitalize ${
                viewMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-foreground'
              }`}
            >
              {mode === 'draw' ? 'Draw' : mode.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={handleSaveToKb}
          disabled={loading || (!scene && !sceneDataRef.current)}
          className="px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-50"
        >
          Save to KB
        </button>
        <label className="flex items-center gap-1 cursor-pointer" title="Auto-sync scene to KB every 5s">
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
            className="w-3 h-3"
          />
          <span className="text-muted-foreground">Auto</span>
        </label>
        {kbDocs.length > 0 && (
          <select
            className="px-1 py-0.5 rounded bg-muted text-foreground text-xs max-w-[140px]"
            defaultValue=""
            onChange={(e) => { if (e.target.value) void handleLoadFromKb(e.target.value); }}
          >
            <option value="">Load from KB...</option>
            {kbDocs.map((d) => (
              <option key={d.id} value={d.id}>{d.title}</option>
            ))}
          </select>
        )}
        {loading && <span className="text-muted-foreground">Loading...</span>}
        {error && <span className="text-destructive">{error}</span>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {viewMode === 'draw' ? (
          <div
            className="nodrag nowheel w-full h-full"
            style={{ position: 'relative', isolation: 'isolate' }}
          >
            <ExcalidrawEditorLazy
              initialData={initialData}
              onChange={handleEditorChange}
              theme={theme}
              excalidrawAPI={handleExcalidrawAPI}
            />
          </div>
        ) : viewMode === 'json' ? (
          <textarea
            className="w-full h-full p-2 font-mono text-xs bg-background text-foreground resize-none outline-none"
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            placeholder='{"type":"excalidraw","version":2,"elements":[...]}'
            spellCheck={false}
          />
        ) : svgString ? (
          <div
            className="p-2 overflow-auto h-full"
            dangerouslySetInnerHTML={{ __html: svgString }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            {jsonText ? 'Invalid scene JSON' : 'Draw something or paste JSON to preview'}
          </div>
        )}
      </div>
    </div>
  );
}
