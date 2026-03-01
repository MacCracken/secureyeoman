import { useState, useCallback, useEffect, useRef } from 'react';
import { Bot, ChevronDown, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { Personality } from '../../types';

export const LOCAL_MCP_NAME = 'YEOMAN MCP';

export const TRAIT_OPTIONS: Record<string, string[]> = {
  formality: ['casual', 'balanced', 'formal'],
  humor: ['none', 'subtle', 'witty'],
  verbosity: ['concise', 'balanced', 'detailed'],
};

export const SEX_OPTIONS = ['unspecified', 'male', 'female', 'non-binary'] as const;

export const API_BASE = '/api/v1';

/** Full-screen lightbox with zoom + pan for a personality avatar image. */
export function AvatarLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetAtDragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Non-passive so preventDefault actually stops browser scroll/back-swipe during zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const next = Math.min(5, Math.max(0.5, scaleRef.current * (1 - e.deltaY * 0.005)));
      setScale(next);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => {
      el.removeEventListener('wheel', handler);
    };
  }, []);

  function clampScale(s: number) {
    return Math.min(5, Math.max(0.5, s));
  }

  function onMouseDown(e: React.MouseEvent) {
    if (scale <= 1) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetAtDragStart.current = { ...offset };
    e.preventDefault();
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    setOffset({
      x: offsetAtDragStart.current.x + (e.clientX - dragStart.current.x),
      y: offsetAtDragStart.current.y + (e.clientY - dragStart.current.y),
    });
  }

  function onMouseUp() {
    dragging.current = false;
  }

  function resetZoom() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {/* caption */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium pointer-events-none select-none">
        {alt}
      </div>

      {/* close */}
      <button
        type="button"
        className="absolute top-4 right-4 text-white/70 hover:text-white"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>

      {/* image */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onMouseDown={onMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: dragging.current ? 'none' : 'transform 0.1s ease',
          cursor: scale > 1 ? 'grab' : 'default',
          maxWidth: '80vw',
          maxHeight: '80vh',
          objectFit: 'contain',
          borderRadius: '0.5rem',
          userSelect: 'none',
        }}
      />

      {/* zoom controls */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 rounded-full px-4 py-2"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <button
          type="button"
          className="text-white/80 hover:text-white"
          onClick={() => {
            setScale((s) => clampScale(s - 0.25));
          }}
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <button
          type="button"
          className="text-white/70 hover:text-white text-xs w-12 text-center tabular-nums"
          onClick={resetZoom}
          title="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          className="text-white/80 hover:text-white"
          onClick={() => {
            setScale((s) => clampScale(s + 0.25));
          }}
        >
          <ZoomIn className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ── Avatar crop constants ────────────────────────────────────────────────────
export const CROP_CONTAINER = 300; // CSS px — square viewport for the crop UI
export const CROP_RADIUS = 130; // CSS px — radius of the circle crop guide
export const EXPORT_SIZE = 512; // px — output resolution (matches major platforms)

/**
 * Full-screen crop modal. Shown after a raster image is selected; lets the user
 * drag + zoom to position their photo inside a circular guide before uploading.
 * Exports a 512×512 PNG blob via the canvas API — no dependencies needed.
 */
export function AvatarCropModal({
  file,
  onConfirm,
  onCancel,
}: {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const [imgSrc, setImgSrc] = useState('');
  // naturalWidth/Height captured from the onLoad event — avoids reading imgRef.current at render time
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(0.1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, offX: 0, offY: 0 });
  const touchRef = useRef({ startX: 0, startY: 0, offX: 0, offY: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropViewportRef = useRef<HTMLDivElement>(null);
  // Always-current mirrors of scale/offset for use inside the native wheel handler
  // (the handler closes over a stale snapshot; refs give it live values)
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  scaleRef.current = scale;
  offsetRef.current = offset;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    setNaturalSize({ w: 0, h: 0 }); // reset until new image loads
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  // Constrain offset so the crop circle is always fully covered by the image.
  const clamp = useCallback((ox: number, oy: number, s: number) => {
    const img = imgRef.current;
    if (!img) return { x: ox, y: oy };
    const maxX = Math.max(0, (img.naturalWidth * s) / 2 - CROP_RADIUS);
    const maxY = Math.max(0, (img.naturalHeight * s) / 2 - CROP_RADIUS);
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }, []);

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (!w || !h) return;
    // Initial scale: shorter dimension fills the container so the image edge is never
    // visible inside the viewport during zoom (CROP_CONTAINER > CROP_RADIUS*2).
    const s = CROP_CONTAINER / Math.min(w, h);
    setNaturalSize({ w, h });
    setMinScale(s);
    setScale(s);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Non-passive wheel listener — React 18 onWheel is passive so preventDefault is a no-op there.
  // Reads live values via refs; sets scale and offset independently (no nested setState).
  useEffect(() => {
    const el = cropViewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const prev = scaleRef.current;
      const next = Math.max(minScale, Math.min(minScale * 8, prev * (1 - e.deltaY * 0.001)));
      const ratio = next / prev;
      setScale(next);
      // Scale offset proportionally so the crop circle shows the same image content after zoom.
      setOffset(clamp(offsetRef.current.x * ratio, offsetRef.current.y * ratio, next));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => {
      el.removeEventListener('wheel', handler);
    };
  }, [minScale, clamp]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, offX: offset.x, offY: offset.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp(dragRef.current.offX + dx, dragRef.current.offY + dy, scale));
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY, offX: offset.x, offY: offset.y };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    setOffset(
      clamp(
        touchRef.current.offX + t.clientX - touchRef.current.startX,
        touchRef.current.offY + t.clientY - touchRef.current.startY,
        scale
      )
    );
  };

  const handleCrop = () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    // Crop circle center mapped to natural image coordinates.
    const cx = img.naturalWidth / 2 - offset.x / scale;
    const cy = img.naturalHeight / 2 - offset.y / scale;
    const r = CROP_RADIUS / scale;
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(EXPORT_SIZE / 2, EXPORT_SIZE / 2, EXPORT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2, 0, 0, EXPORT_SIZE, EXPORT_SIZE);
    canvas.toBlob((blob) => {
      if (blob) onConfirm(blob);
    }, 'image/png');
  };

  const imgW = naturalSize.w ? naturalSize.w * scale : 0;
  const imgH = naturalSize.h ? naturalSize.h * scale : 0;
  const C = CROP_CONTAINER / 2;
  const zoomPct = minScale > 0 ? Math.round((scale / minScale) * 100) : 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl p-5 flex flex-col items-center gap-4 w-[360px] max-w-[95vw]">
        {/* Header */}
        <div className="flex items-center justify-between w-full">
          <span className="text-sm font-semibold">Crop Photo</span>
          <span className="text-[10px] text-muted-foreground">
            Drag to position · scroll to zoom
          </span>
        </div>

        {/* Crop viewport */}
        <div
          ref={cropViewportRef}
          className="relative select-none overflow-hidden bg-muted rounded-sm"
          style={{
            width: CROP_CONTAINER,
            height: CROP_CONTAINER,
            cursor: dragging ? 'grabbing' : 'grab',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={() => {
            setDragging(false);
          }}
          onMouseLeave={() => {
            setDragging(false);
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
        >
          <img
            ref={imgRef}
            src={imgSrc || undefined}
            alt="crop preview"
            draggable={false}
            onLoad={onImgLoad}
            style={{
              position: 'absolute',
              width: imgW || 'auto',
              height: imgH || 'auto',
              maxWidth: 'none',
              maxHeight: 'none',
              left: imgW ? C + offset.x - imgW / 2 : 0,
              top: imgH ? C + offset.y - imgH / 2 : 0,
              pointerEvents: 'none',
            }}
          />
          {/* Dim everything outside the crop circle */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle ${CROP_RADIUS}px at 50% 50%, transparent ${CROP_RADIUS}px, rgba(0,0,0,0.55) ${CROP_RADIUS}px)`,
            }}
          />
          {/* Dashed circle guide */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: C - CROP_RADIUS,
              top: C - CROP_RADIUS,
              width: CROP_RADIUS * 2,
              height: CROP_RADIUS * 2,
              borderRadius: '50%',
              border: '2px dashed rgba(255,255,255,0.5)',
            }}
          />
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 w-full">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <input
            type="range"
            min={minScale}
            max={minScale * 8}
            step={0.0001}
            value={scale}
            onChange={(e) => {
              const s = parseFloat(e.target.value);
              const ratio = s / scale;
              setScale(s);
              setOffset((o) => clamp(o.x * ratio, o.y * ratio, s));
            }}
            className="flex-1 accent-primary"
          />
          <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
            {zoomPct}%
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 w-full">
          <button type="button" className="btn btn-sm btn-ghost flex-1" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-sm btn-primary flex-1" onClick={handleCrop}>
            Apply & Upload
          </button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

/** Renders a personality avatar as a circle image, or falls back to the Bot icon. */
export function PersonalityAvatar({
  personality,
  size = 24,
  zoomable = false,
}: {
  personality: Personality;
  size?: number;
  zoomable?: boolean;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!personality.avatarUrl) {
    return <Bot style={{ width: size, height: size }} />;
  }
  const src = personality.avatarUrl.startsWith('/avatars/')
    ? personality.avatarUrl
    : `${API_BASE}${personality.avatarUrl}?v=${personality.updatedAt}`;
  return (
    <>
      <img
        src={src}
        alt={personality.name}
        onClick={
          zoomable
            ? () => {
                setLightboxOpen(true);
              }
            : undefined
        }
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          cursor: zoomable ? 'zoom-in' : undefined,
        }}
      />
      {lightboxOpen && (
        <AvatarLightbox
          src={src}
          alt={personality.name}
          onClose={() => {
            setLightboxOpen(false);
          }}
        />
      )}
    </>
  );
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatIntervalHuman(ms: number): string {
  if (ms >= 3_600_000) {
    const h = Math.round(ms / 3_600_000);
    return `${h}h`;
  }
  if (ms >= 60_000) {
    const m = Math.round(ms / 60_000);
    return `${m}m`;
  }
  return `${Math.round(ms / 1000)}s`;
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

// ── Collapsible Section ─────────────────────────────────────────

export function CollapsibleSection({
  title,
  defaultOpen,
  headerRight,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border rounded p-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            setOpen(!open);
          }}
          className="flex items-center gap-2 flex-1 text-left font-medium text-sm"
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {title}
        </button>
        {headerRight && (
          <div
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="ml-2 shrink-0"
          >
            {headerRight}
          </div>
        )}
      </div>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}
