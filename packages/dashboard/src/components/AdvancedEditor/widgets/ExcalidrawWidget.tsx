import { useState, useCallback, useEffect, useMemo } from 'react';

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

interface Props {
  sceneJson?: string;
  documentId?: string;
  onConfigChange?: (config: { excalidrawSceneJson?: string; excalidrawDocumentId?: string }) => void;
}

// TODO: Extract to shared package — lightweight SVG renderer (pure string manipulation, no Node APIs)
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

export function ExcalidrawWidget({ sceneJson, documentId, onConfigChange }: Props) {
  const [viewMode, setViewMode] = useState<'svg' | 'json'>('svg');
  const [jsonText, setJsonText] = useState(sceneJson ?? '');
  const [kbDocs, setKbDocs] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Fetch KB excalidraw documents
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
      const doc = await resp.json() as { document: KbDocument };
      onConfigChange?.({ excalidrawDocumentId: doc.document.id });
      // Note: the actual scene JSON would need to be stored/retrieved separately
      // For now, we just track the document reference
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [onConfigChange]);

  const handleSaveToKb = useCallback(async () => {
    if (!scene) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/v1/brain/documents/ingest-excalidraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene,
          title: `Excalidraw — ${new Date().toISOString().slice(0, 16)}`,
        }),
      });
      if (!resp.ok) throw new Error('Failed to save');
      const data = await resp.json() as { document: KbDocument };
      onConfigChange?.({
        excalidrawSceneJson: jsonText,
        excalidrawDocumentId: data.document.id,
      });
      void loadKbDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }, [scene, jsonText, onConfigChange, loadKbDocs]);

  const handleJsonChange = useCallback((val: string) => {
    setJsonText(val);
    onConfigChange?.({ excalidrawSceneJson: val, excalidrawDocumentId: documentId });
  }, [documentId, onConfigChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b text-xs">
        <button
          onClick={() => setViewMode(viewMode === 'svg' ? 'json' : 'svg')}
          className="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
        >
          {viewMode === 'svg' ? 'JSON' : 'SVG'}
        </button>
        <button
          onClick={handleSaveToKb}
          disabled={loading || !scene}
          className="px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-50"
        >
          Save to KB
        </button>
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
      <div className="flex-1 overflow-auto">
        {viewMode === 'svg' ? (
          svgString ? (
            <div
              className="p-2"
              dangerouslySetInnerHTML={{ __html: svgString }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
              {jsonText ? 'Invalid scene JSON' : 'Paste Excalidraw JSON or load from KB'}
            </div>
          )
        ) : (
          <textarea
            className="w-full h-full p-2 font-mono text-xs bg-background text-foreground resize-none outline-none"
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            placeholder='{"type":"excalidraw","version":2,"elements":[...]}'
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
