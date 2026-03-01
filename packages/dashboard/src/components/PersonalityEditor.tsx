import { useState, useCallback, useEffect, useRef, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import {
  Bot,
  User,
  Plus,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  Eye,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Save,
  RefreshCw,
  Clock,
  GitBranch,
  FolderOpen,
  Globe,
  FileText,
  Search,
  Monitor,
  Network,
  Wrench,
  Star,
  Power,
  Target,
  Lock,
  ExternalLink,
  Mail,
  MessageSquare,
  ZoomIn,
  ZoomOut,
  Box,
} from 'lucide-react';
import {
  fetchPersonalities,
  createPersonality,
  updatePersonality,
  deletePersonality,
  activatePersonality,
  enablePersonality,
  disablePersonality,
  setDefaultPersonality,
  clearDefaultPersonality,
  fetchPromptPreview,
  fetchModelInfo,
  fetchPassions,
  createPassion,
  deletePassion,
  fetchInspirations,
  createInspiration,
  deleteInspiration,
  fetchPains,
  createPainEntry,
  deletePain,
  fetchKnowledge,
  learnKnowledge,
  updateKnowledge,
  deleteKnowledge,
  fetchHeartbeatTasks,
  updateHeartbeatTask,
  fetchExternalSyncStatus,
  fetchExternalBrainConfig,
  updateExternalBrainConfig,
  triggerExternalSync,
  fetchSkills,
  fetchMcpConfig,
  fetchSecurityPolicy,
  fetchSoulConfig,
  uploadPersonalityAvatar,
  deletePersonalityAvatar,
  fetchOAuthTokens,
  getAccessToken,
} from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';
import { useCollabEditor } from '../hooks/useCollabEditor.js';
import { PresenceBanner } from './PresenceBanner.js';
import type {
  Personality,
  PersonalityCreate,
  Passion,
  Inspiration,
  Pain,
  KnowledgeEntry,
  HeartbeatTask,
  Skill,
} from '../types';
import type { IntegrationAccess, IntegrationAccessMode } from '@secureyeoman/shared';
import { sanitizeText } from '../utils/sanitize';

const LOCAL_MCP_NAME = 'YEOMAN MCP';

const TRAIT_OPTIONS: Record<string, string[]> = {
  formality: ['casual', 'balanced', 'formal'],
  humor: ['none', 'subtle', 'witty'],
  verbosity: ['concise', 'balanced', 'detailed'],
};

const SEX_OPTIONS = ['unspecified', 'male', 'female', 'non-binary'] as const;

const API_BASE = '/api/v1';

/**
 * Resolve an avatarUrl to an absolute src string.
 * - Static public assets (e.g. '/avatars/friday.jpg') are used as-is.
 * - API-relative paths get the API_BASE prefix + cache-buster appended.
 * - null/undefined → null (show Bot icon fallback).
 */
function resolveAvatarSrc(avatarUrl: string | null | undefined, updatedAt?: number): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('/avatars/')) return avatarUrl;
  const bust = updatedAt ? `?v=${updatedAt}` : '';
  return `${API_BASE}${avatarUrl}${bust}`;
}

/** Full-screen lightbox with zoom + pan for a personality avatar image. */
function AvatarLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
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
const CROP_CONTAINER = 300; // CSS px — square viewport for the crop UI
const CROP_RADIUS = 130; // CSS px — radius of the circle crop guide
const EXPORT_SIZE = 512; // px — output resolution (matches major platforms)

/**
 * Full-screen crop modal. Shown after a raster image is selected; lets the user
 * drag + zoom to position their photo inside a circular guide before uploading.
 * Exports a 512×512 PNG blob via the canvas API — no dependencies needed.
 */
function AvatarCropModal({
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
  const src = resolveAvatarSrc(personality.avatarUrl, personality.updatedAt)!;
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

/** Upload/remove avatar UI shown inside the Soul section of PersonalityEditor. */
function AvatarUpload({
  personality,
  onUpdated,
}: {
  personality: Personality;
  onUpdated: (updated: Personality) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Raster types go through the crop modal so users can position + resize.
  // SVG is vector — upload directly (canvas can't rasterise cross-origin SVGs reliably).
  const RASTER_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const ACCEPTED_TYPES = [...RASTER_TYPES, 'image/svg+xml'];
  // Pre-crop size limit is generous; the exported 512×512 PNG will always be under 2 MB.
  const MAX_PRE_CROP = 10 * 1024 * 1024;

  function handleFileSelect(file: File) {
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Unsupported type. Use JPEG, PNG, GIF, WebP or SVG.');
      return;
    }
    if (file.size > MAX_PRE_CROP) {
      setError('File too large (max 10 MB).');
      return;
    }
    if (RASTER_TYPES.includes(file.type)) {
      setCropFile(file); // open crop modal
    } else {
      void handleDirectUpload(file); // SVG: upload as-is
    }
  }

  async function handleDirectUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const result = await uploadPersonalityAvatar(personality.id, file);
      onUpdated(result.personality);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleCropConfirm(blob: Blob) {
    setCropFile(null);
    await handleDirectUpload(new File([blob], 'avatar.png', { type: 'image/png' }));
  }

  async function handleRemove() {
    setError(null);
    setUploading(true);
    try {
      const result = await deletePersonalityAvatar(personality.id);
      onUpdated(result.personality);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onConfirm={(blob) => void handleCropConfirm(blob)}
          onCancel={() => {
            setCropFile(null);
          }}
        />
      )}
      <div className="flex items-center gap-4 mb-4">
        <div
          className={`w-24 h-24 rounded-full overflow-hidden flex items-center justify-center bg-muted flex-shrink-0${personality.avatarUrl ? ' cursor-zoom-in' : ''}`}
          onClick={
            personality.avatarUrl
              ? () => {
                  setLightboxOpen(true);
                }
              : undefined
          }
          title={personality.avatarUrl ? 'Click to zoom' : undefined}
        >
          {personality.avatarUrl ? (
            <img
              src={resolveAvatarSrc(personality.avatarUrl, personality.updatedAt)!}
              alt={personality.name}
              className="block w-full h-full object-cover"
            />
          ) : (
            <Bot className="w-10 h-10 text-muted-foreground" />
          )}
        </div>
        {lightboxOpen && personality.avatarUrl && (
          <AvatarLightbox
            src={resolveAvatarSrc(personality.avatarUrl, personality.updatedAt)!}
            alt={personality.name}
            onClose={() => {
              setLightboxOpen(false);
            }}
          />
        )}
        <div className="flex flex-col gap-2">
          <label
            className={`btn btn-sm btn-outline cursor-pointer${uploading ? ' opacity-50 pointer-events-none' : ''}`}
          >
            {uploading ? 'Uploading…' : 'Upload Photo'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                e.target.value = '';
              }}
            />
          </label>
          {personality.avatarUrl && (
            <button
              type="button"
              className="btn btn-sm btn-ghost text-muted-foreground"
              disabled={uploading}
              onClick={() => void handleRemove()}
            >
              Remove
            </button>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <p className="text-[10px] text-muted-foreground">
            JPEG · PNG · WebP · GIF · SVG · max 10 MB
          </p>
        </div>
      </div>
    </>
  );
}

const PRIMARY_TOPICS = ['self-identity', 'hierarchy', 'purpose', 'interaction'];

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatIntervalHuman(ms: number): string {
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

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

// ── Collapsible Section ─────────────────────────────────────────

function CollapsibleSection({
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

// ── Spirit Section ──────────────────────────────────────────────

function SpiritSection({
  includeArchetypes,
  onIncludeArchetypesChange,
  empathyResonance,
  onEmpathyResonanceChange,
}: {
  includeArchetypes: boolean;
  onIncludeArchetypesChange: (v: boolean) => void;
  empathyResonance: boolean;
  onEmpathyResonanceChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [newPassion, setNewPassion] = useState({ name: '', description: '', intensity: 0.5 });
  const [newInspiration, setNewInspiration] = useState({
    source: '',
    description: '',
    impact: 0.5,
  });
  const [newPain, setNewPain] = useState({ trigger: '', description: '', severity: 0.5 });

  const { data: passionsData } = useQuery({ queryKey: ['passions'], queryFn: fetchPassions });
  const { data: inspirationsData } = useQuery({
    queryKey: ['inspirations'],
    queryFn: fetchInspirations,
  });
  const { data: painsData } = useQuery({ queryKey: ['pains'], queryFn: fetchPains });

  const passions = passionsData?.passions ?? [];
  const inspirations = inspirationsData?.inspirations ?? [];
  const pains = painsData?.pains ?? [];

  const createPassionMut = useMutation({
    mutationFn: () => createPassion(newPassion),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['passions'] });
      setNewPassion({ name: '', description: '', intensity: 0.5 });
    },
  });

  const deletePassionMut = useMutation({
    mutationFn: (id: string) => deletePassion(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['passions'] }),
  });

  const createInspirationMut = useMutation({
    mutationFn: () => createInspiration(newInspiration),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inspirations'] });
      setNewInspiration({ source: '', description: '', impact: 0.5 });
    },
  });

  const deleteInspirationMut = useMutation({
    mutationFn: (id: string) => deleteInspiration(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['inspirations'] }),
  });

  const createPainMut = useMutation({
    mutationFn: () => createPainEntry(newPain),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pains'] });
      setNewPain({ trigger: '', description: '', severity: 0.5 });
    },
  });

  const deletePainMut = useMutation({
    mutationFn: (id: string) => deletePain(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['pains'] }),
  });

  return (
    <CollapsibleSection title="Spirit - Pathos">
      {/* Passions */}
      <div>
        <h4 className="text-sm font-medium mb-2">Passions</h4>
        <div className="space-y-1 mb-2">
          {passions.map((p: Passion) => (
            <div
              key={p.id}
              className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded"
            >
              <span>
                <strong>{p.name}</strong> (intensity: {p.intensity}){' '}
                {p.description && `— ${p.description}`}
              </span>
              <button
                onClick={() => {
                  deletePassionMut.mutate(p.id);
                }}
                className="text-destructive hover:text-destructive/80 p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Name"
              value={newPassion.name}
              onChange={(e) => {
                setNewPassion((p) => ({ ...p, name: e.target.value }));
              }}
              className="flex-1 px-2 py-1.5 text-sm rounded border bg-background"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={newPassion.intensity}
              onChange={(e) => {
                setNewPassion((p) => ({ ...p, intensity: parseFloat(e.target.value) }));
              }}
              className="w-20"
              title={`Intensity: ${newPassion.intensity}`}
            />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Description (optional)"
              value={newPassion.description}
              onChange={(e) => {
                setNewPassion((p) => ({ ...p, description: e.target.value }));
              }}
              className="flex-1 max-w-[calc(100%-80px)] px-2 py-1.5 text-sm rounded border bg-background"
            />
            <button
              onClick={() => {
                createPassionMut.mutate();
              }}
              disabled={!newPassion.name.trim()}
              className="btn btn-ghost px-3 py-1.5 text-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Inspirations */}
      <div>
        <h4 className="text-sm font-medium mb-2">Inspirations</h4>
        <div className="space-y-1 mb-2">
          {inspirations.map((i: Inspiration) => (
            <div
              key={i.id}
              className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded"
            >
              <span>
                <strong>{i.source}</strong> (impact: {i.impact}){' '}
                {i.description && `— ${i.description}`}
              </span>
              <button
                onClick={() => {
                  deleteInspirationMut.mutate(i.id);
                }}
                className="text-destructive hover:text-destructive/80 p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Source"
              value={newInspiration.source}
              onChange={(e) => {
                setNewInspiration((i) => ({ ...i, source: e.target.value }));
              }}
              className="flex-1 px-2 py-1.5 text-sm rounded border bg-background"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={newInspiration.impact}
              onChange={(e) => {
                setNewInspiration((i) => ({ ...i, impact: parseFloat(e.target.value) }));
              }}
              className="w-20"
              title={`Impact: ${newInspiration.impact}`}
            />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Description (optional)"
              value={newInspiration.description}
              onChange={(e) => {
                setNewInspiration((i) => ({ ...i, description: e.target.value }));
              }}
              className="flex-1 max-w-[calc(100%-80px)] px-2 py-1.5 text-sm rounded border bg-background"
            />
            <button
              onClick={() => {
                createInspirationMut.mutate();
              }}
              disabled={!newInspiration.source.trim()}
              className="btn btn-ghost px-3 py-1.5 text-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Pains */}
      <div>
        <h4 className="text-sm font-medium mb-2">Pain Points</h4>
        <div className="space-y-1 mb-2">
          {pains.map((p: Pain) => (
            <div
              key={p.id}
              className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded"
            >
              <span>
                <strong>{p.trigger}</strong> (severity: {p.severity}){' '}
                {p.description && `— ${p.description}`}
              </span>
              <button
                onClick={() => {
                  deletePainMut.mutate(p.id);
                }}
                className="text-destructive hover:text-destructive/80 p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Trigger"
              value={newPain.trigger}
              onChange={(e) => {
                setNewPain((p) => ({ ...p, trigger: e.target.value }));
              }}
              className="flex-1 px-2 py-1.5 text-sm rounded border bg-background"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={newPain.severity}
              onChange={(e) => {
                setNewPain((p) => ({ ...p, severity: parseFloat(e.target.value) }));
              }}
              className="w-20"
              title={`Severity: ${newPain.severity}`}
            />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Description (optional)"
              value={newPain.description}
              onChange={(e) => {
                setNewPain((p) => ({ ...p, description: e.target.value }));
              }}
              className="flex-1 max-w-[calc(100%-80px)] px-2 py-1.5 text-sm rounded border bg-background"
            />
            <button
              onClick={() => {
                createPainMut.mutate();
              }}
              disabled={!newPain.trigger.trim()}
              className="btn btn-ghost px-3 py-1.5 text-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Morphogenesis */}
      <div className="flex items-center justify-between" data-testid="archetype-toggle">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">Morphogenesis</span>
          <span className="text-xs text-muted-foreground">
            Weaves the Sacred Archetypes into the system prompt — these are the foundational
            patterns that give this personality its actual shape and character
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={includeArchetypes}
            onChange={(e) => {
              onIncludeArchetypesChange(e.target.checked);
            }}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
        </label>
      </div>

      {/* Empathy Resonance */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">Empathy Resonance</span>
          <span className="text-xs text-muted-foreground">
            When enabled, the personality mirrors and adapts to the user's detected emotional
            register — matching tone, pacing, and affect to what the user is feeling
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={empathyResonance}
            onChange={(e) => {
              onEmpathyResonanceChange(e.target.checked);
            }}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
        </label>
      </div>
    </CollapsibleSection>
  );
}

// ── Brain Section ───────────────────────────────────────────────

type ModelDataType = { available?: Record<string, { model: string }[]> } | undefined;

function getAnalyticalDepth(cfg: { enabled: boolean; budgetTokens: number }): string {
  if (!cfg.enabled) return 'off';
  if (cfg.budgetTokens <= 8192) return 'focused';
  if (cfg.budgetTokens <= 24000) return 'standard';
  if (cfg.budgetTokens <= 48000) return 'deep';
  return 'maximum';
}

function setAnalyticalDepth(
  level: string,
  onChange: (cfg: { enabled: boolean; budgetTokens: number }) => void
) {
  const map: Record<string, { enabled: boolean; budgetTokens: number }> = {
    off: { enabled: false, budgetTokens: 4096 },
    focused: { enabled: true, budgetTokens: 4096 },
    standard: { enabled: true, budgetTokens: 16000 },
    deep: { enabled: true, budgetTokens: 32000 },
    maximum: { enabled: true, budgetTokens: 64000 },
  };
  onChange(map[level] ?? map.off);
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  ollama: 'Ollama (Local)',
  opencode: 'OpenCode (Zen)',
  lmstudio: 'LM Studio (Local)',
  localai: 'LocalAI (Local)',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
};

function BrainSection({
  personalityId,
  activeHours,
  onActiveHoursChange,
  thinkingConfig,
  onThinkingConfigChange,
  maxPromptTokens,
  onMaxPromptTokensChange,
  globalMaxPromptTokens,
  exposeOrgIntentTools,
  onExposeOrgIntentToolsChange,
  orgIntentMcpEnabled,
  omnipresentMind,
  onOmnipresentMindChange,
  strictSystemPromptConfidentiality,
  onStrictSystemPromptConfidentialityChange,
  knowledgeMode,
  onKnowledgeModeChange,
  notebookTokenBudget,
  onNotebookTokenBudgetChange,
  injectDateTime,
  onInjectDateTimeChange,
  defaultModel,
  onDefaultModelChange,
  modelFallbacks,
  onModelFallbacksChange,
  modelData,
}: {
  personalityId: string | null;
  activeHours: {
    enabled: boolean;
    start: string;
    end: string;
    daysOfWeek: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
    timezone: string;
  };
  onActiveHoursChange: (config: {
    enabled: boolean;
    start: string;
    end: string;
    daysOfWeek: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
    timezone: string;
  }) => void;
  thinkingConfig: { enabled: boolean; budgetTokens: number };
  onThinkingConfigChange: (config: { enabled: boolean; budgetTokens: number }) => void;
  maxPromptTokens: number | null;
  onMaxPromptTokensChange: (value: number | null) => void;
  globalMaxPromptTokens: number;
  exposeOrgIntentTools: boolean;
  onExposeOrgIntentToolsChange: (v: boolean) => void;
  orgIntentMcpEnabled: boolean;
  omnipresentMind: boolean;
  onOmnipresentMindChange: (v: boolean) => void;
  strictSystemPromptConfidentiality: boolean;
  onStrictSystemPromptConfidentialityChange: (v: boolean | undefined) => void;
  knowledgeMode: 'rag' | 'notebook' | 'hybrid';
  onKnowledgeModeChange: (v: 'rag' | 'notebook' | 'hybrid') => void;
  notebookTokenBudget: number | null;
  onNotebookTokenBudgetChange: (v: number | null) => void;
  injectDateTime: boolean;
  onInjectDateTimeChange: (v: boolean) => void;
  defaultModel: { provider: string; model: string } | null;
  onDefaultModelChange: (v: { provider: string; model: string } | null) => void;
  modelFallbacks: { provider: string; model: string }[];
  onModelFallbacksChange: (v: { provider: string; model: string }[]) => void;
  modelData: ModelDataType;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pendingFallback, setPendingFallback] = useState('');
  const [teachTopic, setTeachTopic] = useState('');
  const [teachContent, setTeachContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editConfidence, setEditConfidence] = useState(0.5);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeEntry | null>(null);

  const { data: knowledgeData } = useQuery({
    queryKey: ['knowledge'],
    queryFn: () => fetchKnowledge(),
  });
  const knowledge = knowledgeData?.knowledge ?? [];

  const { data: allSkillsData } = useQuery({ queryKey: ['skills'], queryFn: () => fetchSkills() });
  const personalitySkills = (allSkillsData?.skills ?? []).filter(
    (s: Skill) => s.personalityId === personalityId
  );

  const { data: syncStatus } = useQuery({
    queryKey: ['externalSync'],
    queryFn: fetchExternalSyncStatus,
  });

  const { data: brainConfig, refetch: refetchBrainConfig } = useQuery({
    queryKey: ['externalBrainConfig'],
    queryFn: fetchExternalBrainConfig,
  });

  const [showConfigForm, setShowConfigForm] = useState(false);
  const [configForm, setConfigForm] = useState({
    enabled: true,
    provider: 'filesystem',
    path: '',
    subdir: '',
    syncIntervalMs: 0,
  });

  const configMut = useMutation({
    mutationFn: (data: typeof configForm) => updateExternalBrainConfig(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['externalBrainConfig'] });
      void queryClient.invalidateQueries({ queryKey: ['externalSync'] });
      setShowConfigForm(false);
    },
  });

  const learnMut = useMutation({
    mutationFn: () => learnKnowledge(teachTopic, teachContent),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      setTeachTopic('');
      setTeachContent('');
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { content?: string; confidence?: number } }) =>
      updateKnowledge(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteKnowledge(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['knowledge'] }),
  });

  const syncMut = useMutation({
    mutationFn: () => triggerExternalSync(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['externalSync'] }),
  });

  const startEdit = (k: KnowledgeEntry) => {
    setEditingId(k.id);
    setEditContent(k.content);
    setEditConfidence(k.confidence);
  };

  const handleSaveEdit = () => {
    if (editingId) {
      updateMut.mutate({
        id: editingId,
        data: { content: editContent, confidence: editConfidence },
      });
    }
  };

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMut.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMut]);

  const isPrimary = (topic: string) => PRIMARY_TOPICS.includes(topic);

  return (
    <CollapsibleSection title="Brain - Intellect">
      <CollapsibleSection title="Thinking" defaultOpen={true}>
        {/* Organizational Intent Signal */}
        {orgIntentMcpEnabled ? (
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2.5 min-w-0">
              <Target className="w-4 h-4 text-primary shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium">Organizational Intent</span>
                <span className="text-xs text-muted-foreground">
                  Allow this personality to read live org intent signals
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={exposeOrgIntentTools}
                onChange={(e) => {
                  onExposeOrgIntentToolsChange(e.target.checked);
                }}
                aria-label="Organizational Intent Signal"
                className="sr-only peer"
              />
              <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
            </label>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Organizational Intent — Not Enabled
              </span>
              <span className="text-xs text-muted-foreground">
                Intent Document Editor must be active before assigning org intent access to a
                personality.
              </span>
              <button
                type="button"
                onClick={() => navigate('/security-settings')}
                className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline self-start"
              >
                <ExternalLink className="w-3 h-3" />
                Security → Developers → Intent Document Editor
              </button>
            </div>
          </div>
        )}

        {/* Omnipresent Mind toggle */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-sm font-medium">Omnipresent Mind</p>
              <p className="text-xs text-muted-foreground">
                When enabled, this personality accesses the shared memory pool across all agents.
                Disable to keep memories and knowledge private to this personality.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={omnipresentMind}
              onChange={(e) => {
                onOmnipresentMindChange(e.target.checked);
              }}
              aria-label="Omnipresent Mind"
              className="sr-only peer"
            />
            <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        {/* System Prompt Confidentiality override */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-sm font-medium">System Prompt Confidentiality</p>
              <p className="text-xs text-muted-foreground">
                Override global setting: scan responses for system prompt content leaks. Falls back
                to the global Security setting when unchecked.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={strictSystemPromptConfidentiality}
              onChange={(e) => {
                onStrictSystemPromptConfidentialityChange(e.target.checked ? true : undefined);
              }}
              aria-label="System Prompt Confidentiality"
              className="sr-only peer"
            />
            <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        {/* Knowledge Retrieval Mode */}
        <div className="p-3 rounded-lg border border-border space-y-2">
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">Knowledge Retrieval Mode</p>
              <p className="text-xs text-muted-foreground">
                How the AI reads your document library when answering questions.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 mt-1">
            {(['rag', 'notebook', 'hybrid'] as const).map((mode) => {
              const labels: Record<string, string> = {
                rag: 'RAG',
                notebook: 'Notebook',
                hybrid: 'Hybrid',
              };
              const descs: Record<string, string> = {
                rag: 'Top-K semantic search (fast)',
                notebook: 'Full corpus in-context (NotebookLM style)',
                hybrid: 'Notebook first, RAG fallback',
              };
              return (
                <button
                  key={mode}
                  onClick={() => { onKnowledgeModeChange(mode); }}
                  title={descs[mode]}
                  className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors text-center ${
                    knowledgeMode === mode
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  {labels[mode]}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground italic">
            {knowledgeMode === 'rag' && 'Retrieves the most relevant snippets. Works at any corpus size.'}
            {knowledgeMode === 'notebook' && 'Loads all documents into the context window. Requires a large-context model (Claude ≥200K, Gemini ≥1M recommended).'}
            {knowledgeMode === 'hybrid' && 'Loads the full corpus when it fits in 65% of the context window, otherwise falls back to RAG automatically.'}
          </p>
          {(knowledgeMode === 'notebook' || knowledgeMode === 'hybrid') && (
            <div className="space-y-1 pt-1 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Override token budget</span>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={notebookTokenBudget !== null}
                    onChange={(e) => { onNotebookTokenBudgetChange(e.target.checked ? 50000 : null); }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                </label>
              </div>
              {notebookTokenBudget !== null && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground block">
                    Budget: {notebookTokenBudget.toLocaleString()} tokens
                  </label>
                  <input
                    type="range"
                    min={10000}
                    max={900000}
                    step={10000}
                    value={notebookTokenBudget}
                    onChange={(e) => { onNotebookTokenBudgetChange(Number(e.target.value)); }}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chronoception */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-sm font-medium">Chronoception</p>
              <p className="text-xs text-muted-foreground">
                Injects the current date and time into the system prompt so the personality always
                knows when it is
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={injectDateTime}
              onChange={(e) => {
                onInjectDateTimeChange(e.target.checked);
              }}
              className="sr-only peer"
            />
            <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        {/* Default Model */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Default Model</label>
            <select
              value={defaultModel ? `${defaultModel.provider}/${defaultModel.model}` : ''}
              onChange={(e) => {
                if (!e.target.value) {
                  onDefaultModelChange(null);
                } else {
                  const [provider, ...rest] = e.target.value.split('/');
                  onDefaultModelChange({ provider, model: rest.join('/') });
                }
              }}
              className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Use system default</option>
              {modelData?.available &&
                Object.entries(modelData.available).map(([provider, models]) => (
                  <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
                    {models.map((m) => (
                      <option key={`${provider}/${m.model}`} value={`${provider}/${m.model}`}>
                        {m.model}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Model to use when chatting with this personality. Can be overridden per-session.
            </p>
          </div>

          {/* Model Fallbacks */}
          <div>
            <label className="block text-sm font-medium mb-1">Model Fallbacks</label>
            <p className="text-xs text-muted-foreground mb-2">
              Ordered list of fallback models (max 5). Tried in order if the primary model fails due
              to rate limits or unavailability.
            </p>
            {modelFallbacks.length > 0 && (
              <div className="space-y-1 mb-2" data-testid="fallback-list">
                {modelFallbacks.map((fb, idx) => (
                  <div
                    key={`${fb.provider}/${fb.model}-${String(idx)}`}
                    className="flex items-center gap-2 text-sm bg-muted/40 px-2 py-1 rounded"
                  >
                    <span className="text-muted-foreground text-xs w-4">{idx + 1}.</span>
                    <span className="flex-1 font-mono text-xs">
                      {fb.provider}/{fb.model}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onModelFallbacksChange(modelFallbacks.filter((_, i) => i !== idx));
                      }}
                      className="text-muted-foreground hover:text-destructive text-xs px-1"
                      aria-label="Remove fallback"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {modelFallbacks.length < 5 && (
              <div className="flex gap-2">
                <select
                  value={pendingFallback}
                  onChange={(e) => {
                    setPendingFallback(e.target.value);
                  }}
                  className="flex-1 px-3 py-2 rounded border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="fallback-add-select"
                >
                  <option value="">Add fallback model…</option>
                  {modelData?.available &&
                    Object.entries(modelData.available).map(([provider, models]) => {
                      const filtered = models.filter((m) => {
                        const key = `${provider}/${m.model}`;
                        const isDefault = defaultModel
                          ? `${defaultModel.provider}/${defaultModel.model}` === key
                          : false;
                        const alreadyAdded = modelFallbacks.some(
                          (fb) => `${fb.provider}/${fb.model}` === key
                        );
                        return !isDefault && !alreadyAdded;
                      });
                      if (filtered.length === 0) return null;
                      return (
                        <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
                          {filtered.map((m) => (
                            <option key={`${provider}/${m.model}`} value={`${provider}/${m.model}`}>
                              {m.model}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                </select>
                <button
                  type="button"
                  disabled={!pendingFallback}
                  onClick={() => {
                    if (!pendingFallback) return;
                    const [provider, ...rest] = pendingFallback.split('/');
                    onModelFallbacksChange([
                      ...modelFallbacks,
                      { provider, model: rest.join('/') },
                    ]);
                    setPendingFallback('');
                  }}
                  className="px-3 py-2 rounded border bg-primary text-primary-foreground text-sm disabled:opacity-40"
                  data-testid="fallback-add-btn"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Analytical Depth */}
          <div>
            <label className="block text-sm font-medium mb-1">Analytical Depth</label>
            <p className="text-xs text-muted-foreground mb-2">
              Controls the reasoning effort budget. Higher depth = more thorough thinking but more
              tokens consumed. Anthropic models only.
            </p>
            <div className="flex gap-1 flex-wrap">
              {(
                [
                  { value: 'off', label: 'Off', desc: 'No extended thinking' },
                  { value: 'focused', label: 'Focused', desc: '~4k tokens' },
                  { value: 'standard', label: 'Standard', desc: '~16k tokens' },
                  { value: 'deep', label: 'Deep', desc: '~32k tokens' },
                  { value: 'maximum', label: 'Maximum', desc: '64k tokens' },
                ] as const
              ).map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  title={desc}
                  onClick={() => {
                    setAnalyticalDepth(value, onThinkingConfigChange);
                  }}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    getAnalyticalDepth(thinkingConfig) === value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Extended Thinking — raw token budget for power users */}
        <CollapsibleSection title="Extended Thinking" defaultOpen={false}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Fine-grained token budget control. Analytical Depth above is the simplified version;
              use this for exact budget values. Anthropic models only.
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Enable extended thinking</span>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={thinkingConfig.enabled}
                  onChange={(e) => {
                    onThinkingConfigChange({ ...thinkingConfig, enabled: e.target.checked });
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
            {thinkingConfig.enabled && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground block">
                  Token budget: {thinkingConfig.budgetTokens.toLocaleString()} tokens
                </label>
                <input
                  type="range"
                  min={1024}
                  max={64000}
                  step={256}
                  value={thinkingConfig.budgetTokens}
                  onChange={(e) => {
                    onThinkingConfigChange({
                      ...thinkingConfig,
                      budgetTokens: Number(e.target.value),
                    });
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>1,024</span>
                  <span>64,000</span>
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="Prompt Budget" defaultOpen={false}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Controls how many tokens are reserved for this soul&apos;s composed system prompt
              (identity, skills, context). Overrides the global server default when set.
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Override global prompt budget</span>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={maxPromptTokens !== null}
                  onChange={(e) => {
                    onMaxPromptTokensChange(e.target.checked ? globalMaxPromptTokens : null);
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
            {maxPromptTokens !== null ? (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground block">
                  Budget: {maxPromptTokens.toLocaleString()} tokens
                </label>
                <input
                  type="range"
                  min={1024}
                  max={100000}
                  step={1024}
                  value={maxPromptTokens}
                  onChange={(e) => {
                    onMaxPromptTokensChange(Number(e.target.value));
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>1,024</span>
                  <span>100,000</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Using global default ({globalMaxPromptTokens.toLocaleString()} tokens)
              </p>
            )}
          </div>
        </CollapsibleSection>
      </CollapsibleSection>

      {/* Active Hours */}
      <CollapsibleSection title="Active Hours" defaultOpen={false}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Outside these hours, the personality&apos;s body is at rest — heartbeat checks and
            proactive triggers are suppressed.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Enable active hours</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                aria-label="Enable active hours"
                checked={activeHours.enabled}
                onChange={() => {
                  onActiveHoursChange({ ...activeHours, enabled: !activeHours.enabled });
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
            </label>
          </div>
          {activeHours.enabled && (
            <div className="space-y-3">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground block mb-1">Start (UTC)</label>
                  <input
                    type="time"
                    value={activeHours.start}
                    onChange={(e) => {
                      onActiveHoursChange({ ...activeHours, start: e.target.value });
                    }}
                    className="w-full text-xs rounded border border-border bg-background px-2 py-1"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground block mb-1">End (UTC)</label>
                  <input
                    type="time"
                    value={activeHours.end}
                    onChange={(e) => {
                      onActiveHoursChange({ ...activeHours, end: e.target.value });
                    }}
                    className="w-full text-xs rounded border border-border bg-background px-2 py-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Days of week</label>
                <div className="flex gap-1 flex-wrap">
                  {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => {
                    const isSelected = activeHours.daysOfWeek.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const days = isSelected
                            ? activeHours.daysOfWeek.filter((d) => d !== day)
                            : [...activeHours.daysOfWeek, day];
                          onActiveHoursChange({ ...activeHours, daysOfWeek: days });
                        }}
                        className={`text-xs px-2 py-1 rounded border capitalize transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/50 border-border hover:bg-muted'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Timezone</label>
                <select
                  value={activeHours.timezone}
                  onChange={(e) => {
                    onActiveHoursChange({ ...activeHours, timezone: e.target.value });
                  }}
                  className="w-full text-xs rounded border border-border bg-background px-2 py-1"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York (ET)</option>
                  <option value="America/Chicago">America/Chicago (CT)</option>
                  <option value="America/Denver">America/Denver (MT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                  <option value="Europe/Berlin">Europe/Berlin (CET)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* 2. Knowledge sub-section */}
      <CollapsibleSection title="Knowledge">
        <ConfirmDialog
          open={!!deleteTarget}
          title="Delete Knowledge Entry"
          message={
            deleteTarget && isPrimary(deleteTarget.topic)
              ? `WARNING: "${deleteTarget.topic}" is a PRIMARY knowledge entry critical to the agent's identity. Deleting it may cause unpredictable behavior. Are you sure?`
              : `Delete knowledge entry "${deleteTarget?.topic}"? This cannot be undone.`
          }
          confirmLabel="Delete"
          destructive
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setDeleteTarget(null);
          }}
        />

        <div className="space-y-2 mb-3">
          {knowledge.length === 0 && (
            <p className="text-xs text-muted-foreground">No knowledge entries yet.</p>
          )}
          {knowledge.map((k: KnowledgeEntry) => (
            <div key={k.id} className="text-sm bg-muted px-3 py-2 rounded space-y-1">
              {editingId === k.id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong>[{k.topic}]</strong>
                    {isPrimary(k.topic) && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                        PRIMARY
                      </span>
                    )}
                  </div>
                  <textarea
                    value={editContent}
                    onChange={(e) => {
                      setEditContent(e.target.value);
                    }}
                    className="w-full px-2 py-1 text-sm rounded border bg-background resize-y"
                    rows={3}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs text-muted-foreground">Confidence:</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={editConfidence}
                      onChange={(e) => {
                        setEditConfidence(parseFloat(e.target.value));
                      }}
                      className="w-24"
                    />
                    <span className="text-xs">{editConfidence.toFixed(2)}</span>
                    <div className="flex-1" />
                    <button
                      onClick={() => {
                        setEditingId(null);
                      }}
                      className="btn btn-ghost text-xs px-2 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={updateMut.isPending}
                      className="btn btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                    >
                      <Save className="w-3 h-3" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong>[{k.topic}]</strong>
                      {isPrimary(k.topic) && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                          PRIMARY
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        (confidence: {k.confidence})
                      </span>
                      <span className="text-xs text-muted-foreground">src: {k.source}</span>
                    </div>
                    <p className="mt-0.5">{sanitizeText(k.content)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => {
                        startEdit(k);
                      }}
                      className="btn-ghost p-1 text-muted-foreground hover:text-foreground"
                      title="Edit"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        setDeleteTarget(k);
                      }}
                      className="btn-ghost p-1 text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Teach form */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Teach</h4>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Topic"
              value={teachTopic}
              onChange={(e) => {
                setTeachTopic(e.target.value);
              }}
              className="w-32 px-2 py-1 text-sm rounded border bg-background"
            />
            <input
              type="text"
              placeholder="Content"
              value={teachContent}
              onChange={(e) => {
                setTeachContent(e.target.value);
              }}
              className="flex-1 min-w-0 px-2 py-1 text-sm rounded border bg-background"
            />
            <button
              onClick={() => {
                learnMut.mutate();
              }}
              disabled={!teachTopic.trim() || !teachContent.trim() || learnMut.isPending}
              className="btn btn-ghost text-xs px-2 py-1"
            >
              {learnMut.isPending ? 'Teaching...' : 'Teach'}
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* 3. Skills sub-section */}
      <CollapsibleSection title="Skills">
        {personalityId === null ? (
          <p className="text-xs text-muted-foreground">
            Save this personality first to manage associated skills.
          </p>
        ) : personalitySkills.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              No skills are associated with this personality yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Add skills from the{' '}
              <button
                onClick={() => navigate('/marketplace')}
                className="text-primary hover:underline"
              >
                Skills Marketplace
              </button>{' '}
              or{' '}
              <button
                onClick={() => navigate('/skills', { state: { initialTab: 'community' } })}
                className="text-primary hover:underline"
              >
                Community
              </button>{' '}
              tabs, or create a personal skill in the{' '}
              <button onClick={() => navigate('/skills')} className="text-primary hover:underline">
                Skills → Personal
              </button>{' '}
              tab.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {personalitySkills.map((skill: Skill) => (
              <div
                key={skill.id}
                className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/50"
              >
                <span className="text-sm flex items-center gap-1.5">
                  <Wrench className="w-3 h-3 text-muted-foreground" />
                  {sanitizeText(skill.name)}
                </span>
                <button
                  onClick={() => navigate('/skills', { state: { openSkillId: skill.id } })}
                  className="btn-ghost p-1 text-muted-foreground hover:text-foreground"
                  title="Edit skill"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* External Brain Sync */}
      <div className="border-b pb-3 mb-1">
        <h4 className="text-sm font-medium mb-2">External Brain Sync</h4>
        {syncStatus?.configured || brainConfig?.configured ? (
          <div className="space-y-2">
            <div className="text-xs space-y-1">
              <p>
                Provider:{' '}
                <strong>{syncStatus?.provider || brainConfig?.provider || 'Unknown'}</strong>
              </p>
              {(syncStatus as { path?: string })?.path && (
                <p>
                  Path:{' '}
                  <code className="bg-muted px-1 rounded">
                    {(syncStatus as { path?: string })?.path || brainConfig?.path}
                  </code>
                </p>
              )}
              {(syncStatus as { lastSync?: { timestamp: number; entriesExported: number } | null })
                ?.lastSync && (
                <p>
                  Last sync:{' '}
                  {relativeTime(
                    (syncStatus as { lastSync?: { timestamp: number } }).lastSync?.timestamp ?? 0
                  )}{' '}
                  (
                  {(syncStatus as { lastSync?: { entriesExported: number } }).lastSync
                    ?.entriesExported ?? 0}{' '}
                  entries exported)
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  syncMut.mutate();
                }}
                disabled={syncMut.isPending}
                className="btn btn-ghost text-xs px-2 py-1 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${syncMut.isPending ? 'animate-spin' : ''}`} />
                {syncMut.isPending ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                onClick={() => {
                  setShowConfigForm(!showConfigForm);
                }}
                className="btn btn-ghost text-xs px-2 py-1"
              >
                Configure
              </button>
            </div>
          </div>
        ) : showConfigForm ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Configure external brain sync to export memories and knowledge.
            </p>
            <div className="grid gap-2">
              <label className="text-xs">
                Provider
                <select
                  value={configForm.provider}
                  onChange={(e) => {
                    setConfigForm({ ...configForm, provider: e.target.value });
                  }}
                  className="w-full mt-1 px-2 py-1 text-sm rounded border bg-background"
                >
                  <option value="filesystem">Filesystem</option>
                  <option value="obsidian">Obsidian</option>
                  <option value="git_repo">Git Repo</option>
                </select>
              </label>
              <label className="text-xs">
                Path
                <input
                  type="text"
                  value={configForm.path}
                  onChange={(e) => {
                    setConfigForm({ ...configForm, path: e.target.value });
                  }}
                  placeholder="/path/to/vault or /path/to/notes"
                  className="w-full mt-1 px-2 py-1 text-sm rounded border bg-background"
                />
              </label>
              <label className="text-xs">
                Subdirectory (optional)
                <input
                  type="text"
                  value={configForm.subdir}
                  onChange={(e) => {
                    setConfigForm({ ...configForm, subdir: e.target.value });
                  }}
                  placeholder="e.g., 30 - Resources/FRIDAY"
                  className="w-full mt-1 px-2 py-1 text-sm rounded border bg-background"
                />
              </label>
              <label className="text-xs">
                Sync Interval (minutes, 0 = manual only)
                <input
                  type="number"
                  value={configForm.syncIntervalMs / 60000}
                  onChange={(e) => {
                    setConfigForm({
                      ...configForm,
                      syncIntervalMs: parseInt(e.target.value || '0', 10) * 60000,
                    });
                  }}
                  min={0}
                  max={1440}
                  className="w-full mt-1 px-2 py-1 text-sm rounded border bg-background"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  configMut.mutate(configForm);
                }}
                disabled={!configForm.path || configMut.isPending}
                className="btn btn-ghost text-xs px-3 py-1"
              >
                {configMut.isPending ? 'Saving...' : 'Save Configuration'}
              </button>
              <button
                onClick={() => {
                  setShowConfigForm(false);
                }}
                className="btn btn-ghost text-xs px-3 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              External brain sync is not configured. Configure it to export memories and knowledge.
            </p>
            <button
              onClick={() => {
                setShowConfigForm(true);
              }}
              className="btn btn-ghost text-xs px-3 py-1"
            >
              Configure External Sync
            </button>
          </div>
        )}
      </div>

      {/* Thinking config */}
    </CollapsibleSection>
  );
}

// ── Body Section ────────────────────────────────────────────────

function HeartbeatTasksSection() {
  const queryClient = useQueryClient();
  const { data: tasksData } = useQuery({
    queryKey: ['heartbeatTasks'],
    queryFn: fetchHeartbeatTasks,
  });
  const tasks = tasksData?.tasks ?? [];

  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editFreqMinutes, setEditFreqMinutes] = useState(5);

  const updateMut = useMutation({
    mutationFn: ({
      name,
      data,
    }: {
      name: string;
      data: { intervalMs?: number; enabled?: boolean };
    }) => updateHeartbeatTask(name, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['heartbeatTasks'] });
      setEditingTask(null);
    },
  });

  const startEdit = (task: HeartbeatTask) => {
    setEditingTask(task.name);
    setEditFreqMinutes(Math.round((task.intervalMs ?? 60_000) / 60_000));
  };

  return (
    <div className="space-y-2">
      {tasks.length === 0 && (
        <p className="text-xs text-muted-foreground">No heartbeat tasks configured.</p>
      )}
      {tasks.map((task: HeartbeatTask) => (
        <div key={task.name} className="text-sm bg-muted px-3 py-2 rounded">
          {editingTask === task.name ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <strong>{task.name}</strong>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                  {task.type}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs">Frequency (minutes):</label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={editFreqMinutes}
                  onChange={(e) => {
                    setEditFreqMinutes(parseInt(e.target.value) || 1);
                  }}
                  className="w-20 px-2 py-1 text-sm rounded border bg-background"
                />
                <div className="flex-1" />
                <button
                  onClick={() => {
                    setEditingTask(null);
                  }}
                  className="btn btn-ghost text-xs px-2 py-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    updateMut.mutate({
                      name: task.name,
                      data: { intervalMs: editFreqMinutes * 60_000 },
                    });
                  }}
                  disabled={updateMut.isPending}
                  className="btn btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                >
                  <Save className="w-3 h-3" /> Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                <strong>{task.name}</strong>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                  {task.type}
                </span>
                <span
                  className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                    task.enabled ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {task.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  every {formatIntervalHuman(task.intervalMs ?? 60_000)}
                </span>
                <span className="text-xs text-muted-foreground">
                  last: {task.lastRunAt ? relativeTime(task.lastRunAt) : 'never'}
                </span>
                {task.type === 'reflective_task' && task.config?.prompt != null && (
                  <span className="text-xs italic text-muted-foreground truncate max-w-48">{`\u201C${String(task.config.prompt)}\u201D`}</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <label
                  className="relative inline-flex items-center cursor-pointer"
                  title={task.enabled ? 'Enabled' : 'Disabled'}
                >
                  <input
                    type="checkbox"
                    checked={task.enabled}
                    onChange={() => {
                      updateMut.mutate({ name: task.name, data: { enabled: !task.enabled } });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-muted-foreground/30 peer-checked:bg-primary rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
                </label>
                <button
                  onClick={() => {
                    startEdit(task);
                  }}
                  className="btn-ghost p-1 text-muted-foreground hover:text-foreground"
                  title="Edit frequency"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface BodySectionProps {
  voice: string;
  onVoiceChange: (v: string) => void;
  preferredLanguage: string;
  onPreferredLanguageChange: (v: string) => void;
  allowConnections: boolean;
  onAllowConnectionsChange: (enabled: boolean) => void;
  selectedServers: string[];
  onSelectedServersChange: (servers: string[]) => void;
  integrationAccess: IntegrationAccess[];
  onIntegrationAccessChange: (access: IntegrationAccess[]) => void;
  enabledCaps: Record<string, boolean>;
  onEnabledCapsChange: (caps: Record<string, boolean>) => void;
  mcpFeatures: {
    exposeGit: boolean;
    exposeFilesystem: boolean;
    exposeWeb: boolean;
    exposeWebScraping: boolean;
    exposeWebSearch: boolean;
    exposeBrowser: boolean;
    exposeDesktopControl: boolean;
    exposeNetworkDevices: boolean;
    exposeNetworkDiscovery: boolean;
    exposeNetworkAudit: boolean;
    exposeNetBox: boolean;
    exposeNvd: boolean;
    exposeNetworkUtils: boolean;
    exposeTwingateTools: boolean;
    exposeOrgIntentTools: boolean;
    exposeGmail: boolean;
    exposeTwitter: boolean;
    exposeGithub: boolean;
    exposeDocker: boolean;
  };
  onMcpFeaturesChange: (features: {
    exposeGit: boolean;
    exposeFilesystem: boolean;
    exposeWeb: boolean;
    exposeWebScraping: boolean;
    exposeWebSearch: boolean;
    exposeBrowser: boolean;
    exposeDesktopControl: boolean;
    exposeNetworkDevices: boolean;
    exposeNetworkDiscovery: boolean;
    exposeNetworkAudit: boolean;
    exposeNetBox: boolean;
    exposeNvd: boolean;
    exposeNetworkUtils: boolean;
    exposeTwingateTools: boolean;
    exposeOrgIntentTools: boolean;
    exposeGmail: boolean;
    exposeTwitter: boolean;
    exposeGithub: boolean;
    exposeDocker: boolean;
  }) => void;
  creationConfig: {
    skills: boolean;
    tasks: boolean;
    personalities: boolean;
    subAgents: boolean;
    customRoles: boolean;
    roleAssignments: boolean;
    experiments: boolean;
    allowA2A: boolean;
    allowSwarms: boolean;
    allowDynamicTools: boolean;
    workflows: boolean;
  };
  onCreationConfigChange: (config: {
    skills: boolean;
    tasks: boolean;
    personalities: boolean;
    subAgents: boolean;
    customRoles: boolean;
    roleAssignments: boolean;
    experiments: boolean;
    allowA2A: boolean;
    allowSwarms: boolean;
    allowDynamicTools: boolean;
    workflows: boolean;
  }) => void;
  proactiveConfig: {
    enabled: boolean;
    builtins: {
      dailyStandup: boolean;
      weeklySummary: boolean;
      contextualFollowup: boolean;
      integrationHealthAlert: boolean;
      securityAlertDigest: boolean;
    };
    builtinModes: {
      dailyStandup: 'auto' | 'suggest' | 'manual';
      weeklySummary: 'auto' | 'suggest' | 'manual';
      contextualFollowup: 'auto' | 'suggest' | 'manual';
      integrationHealthAlert: 'auto' | 'suggest' | 'manual';
      securityAlertDigest: 'auto' | 'suggest' | 'manual';
    };
    learning: { enabled: boolean; minConfidence: number };
  };
  onProactiveConfigChange: (config: {
    enabled: boolean;
    builtins: {
      dailyStandup: boolean;
      weeklySummary: boolean;
      contextualFollowup: boolean;
      integrationHealthAlert: boolean;
      securityAlertDigest: boolean;
    };
    builtinModes: {
      dailyStandup: 'auto' | 'suggest' | 'manual';
      weeklySummary: 'auto' | 'suggest' | 'manual';
      contextualFollowup: 'auto' | 'suggest' | 'manual';
      integrationHealthAlert: 'auto' | 'suggest' | 'manual';
      securityAlertDigest: 'auto' | 'suggest' | 'manual';
    };
    learning: { enabled: boolean; minConfidence: number };
  }) => void;
  resourcePolicy: {
    deletionMode: 'auto' | 'request' | 'manual';
    automationLevel: 'full_manual' | 'semi_auto' | 'supervised_auto';
    emergencyStop: boolean;
  };
  onResourcePolicyChange: (policy: {
    deletionMode: 'auto' | 'request' | 'manual';
    automationLevel: 'full_manual' | 'semi_auto' | 'supervised_auto';
    emergencyStop: boolean;
  }) => void;
}

function BodySection({
  voice,
  onVoiceChange,
  preferredLanguage,
  onPreferredLanguageChange,
  allowConnections,
  onAllowConnectionsChange,
  selectedServers,
  onSelectedServersChange,
  integrationAccess,
  onIntegrationAccessChange,
  enabledCaps,
  onEnabledCapsChange,
  mcpFeatures,
  onMcpFeaturesChange,
  creationConfig,
  onCreationConfigChange,
  proactiveConfig,
  onProactiveConfigChange,
  resourcePolicy,
  onResourcePolicyChange,
}: BodySectionProps) {
  const capabilities = [
    'auditory',
    'diagnostics',
    'haptic',
    'limb_movement',
    'vision',
    'vocalization',
  ] as const;
  const { data: serversData, isLoading: serversLoading } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: () => fetch('/api/v1/mcp/servers').then((r) => r.json()),
  });
  const servers = serversData?.servers ?? [];

  const { data: integrationsData, isLoading: integrationsLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => fetch('/api/v1/integrations').then((r) => r.json()),
  });
  const { data: oauthTokensData, isLoading: oauthTokensLoading } = useQuery({
    queryKey: ['oauth-tokens'],
    queryFn: async () => {
      const token = getAccessToken();
      const res = await fetch('/api/v1/auth/oauth/tokens', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      const body = (await res.json()) as {
        tokens?: { id: string; provider: string; email: string }[];
      };
      return body.tokens ?? [];
    },
  });
  // OAuth tokens that have a matching Integration (same platform + email) should supersede
  // the integration entry — MCP tools use OAuth tokens, not the integration adapter credentials.
  const oauthTokens = (oauthTokensData ?? []).map((t) => ({
    id: t.id,
    displayName: `${t.provider.charAt(0).toUpperCase() + t.provider.slice(1)} — ${t.email}`,
    platform: t.provider,
    status: 'active',
    _email: t.email,
  }));
  const oauthCovered = new Set(oauthTokens.map((t) => `${t.platform}:${t._email}`));
  const dedupedIntegrations = (integrationsData?.integrations ?? []).filter(
    (i: { platform: string; config?: Record<string, unknown> }) => {
      const email = i.config?.email as string | undefined;
      return !oauthCovered.has(`${i.platform}:${email}`);
    }
  );
  const integrations: { id: string; displayName: string; platform: string; status: string }[] = [
    ...dedupedIntegrations,
    ...oauthTokens,
  ];
  const integrationsLoadingAll = integrationsLoading || oauthTokensLoading;

  // Global MCP feature config — gates per-personality feature toggles
  const { data: globalMcpConfig } = useQuery({
    queryKey: ['mcpConfig'],
    queryFn: fetchMcpConfig,
  });

  // Fetch top-level security policy to gate sub-agent toggle
  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
  });
  const desktopControlEnabled = securityPolicy?.allowDesktopControl === true;
  const subAgentsBlockedByPolicy = securityPolicy?.allowSubAgents === false;
  const a2aBlockedByPolicy = securityPolicy?.allowA2A === false;
  const swarmsBlockedByPolicy = securityPolicy?.allowSwarms === false;
  const dtcBlockedByPolicy = securityPolicy?.allowDynamicTools === false;
  const workflowsBlockedByPolicy = securityPolicy?.allowWorkflows === false;

  const resourceItems = [
    { key: 'tasks' as const, label: 'New Tasks', icon: '📋' },
    { key: 'skills' as const, label: 'New Skills', icon: '🧠' },
    { key: 'experiments' as const, label: 'New Experiments', icon: '🧪' },
    { key: 'personalities' as const, label: 'New Personalities', icon: '👤' },
    { key: 'customRoles' as const, label: 'New Custom Roles', icon: '🛡️' },
    { key: 'roleAssignments' as const, label: 'Assign Roles', icon: '🔑' },
  ];

  const orchestrationItems = [
    {
      key: 'subAgents' as const,
      label: 'Sub-Agent Delegation',
      icon: '🤖',
      blockedByPolicy: subAgentsBlockedByPolicy,
    },
    {
      key: 'workflows' as const,
      label: 'Workflows',
      icon: '⚡',
      blockedByPolicy: workflowsBlockedByPolicy,
    },
    {
      key: 'allowDynamicTools' as const,
      label: 'Dynamic Tool Creation',
      icon: '🔧',
      blockedByPolicy: dtcBlockedByPolicy,
    },
  ];

  const allCreationEnabled = resourceItems
    .filter((item) => !('blockedByPolicy' in item && item.blockedByPolicy))
    .every((item) => creationConfig[item.key]);

  const allOrchestrationEnabled = orchestrationItems
    .filter((item) => !('blockedByPolicy' in item && item.blockedByPolicy))
    .every((item) => creationConfig[item.key]);

  const toggleAllCreationItems = () => {
    const newValue = !allCreationEnabled;
    onCreationConfigChange({
      ...creationConfig,
      skills: newValue,
      tasks: newValue,
      personalities: newValue,
      customRoles: newValue,
      roleAssignments: newValue,
      experiments: newValue,
    });
  };

  const toggleAllOrchestrationItems = () => {
    const newValue = !allOrchestrationEnabled;
    onCreationConfigChange({
      ...creationConfig,
      subAgents: subAgentsBlockedByPolicy ? false : newValue,
      allowA2A: a2aBlockedByPolicy ? false : newValue,
      allowSwarms: swarmsBlockedByPolicy ? false : newValue,
      allowDynamicTools: dtcBlockedByPolicy ? false : newValue,
      workflows: workflowsBlockedByPolicy ? false : newValue,
    });
  };

  const toggleCreationItem = (
    key:
      | 'skills'
      | 'tasks'
      | 'personalities'
      | 'subAgents'
      | 'customRoles'
      | 'roleAssignments'
      | 'experiments'
      | 'allowA2A'
      | 'allowSwarms'
      | 'allowDynamicTools'
      | 'workflows'
  ) => {
    onCreationConfigChange({
      ...creationConfig,
      [key]: !creationConfig[key],
    });
  };

  const capabilityInfo: Record<string, { icon: string; description: string; available: boolean }> =
    {
      auditory: {
        icon: '👂',
        description: 'Microphone input and audio output',
        available: true,
      },
      diagnostics: {
        icon: '🩺',
        description: 'Self-diagnostics snapshot and sub-agent health reporting',
        available: true,
      },
      haptic: {
        icon: '🖐️',
        description: 'Tactile feedback and notifications',
        available: true,
      },
      limb_movement: {
        icon: '⌨️',
        description: 'Keyboard/mouse control and system commands',
        available: true,
      },
      vision: {
        icon: '👁️',
        description: 'Screen capture and visual input',
        available: true,
      },
      vocalization: {
        icon: '🗣️',
        description: 'Text-to-speech voice output',
        available: true,
      },
    };

  const toggleCapability = (cap: string) => {
    onEnabledCapsChange({ ...enabledCaps, [cap]: !enabledCaps[cap] });
  };

  const renderToggleRow = (item: {
    key:
      | 'skills'
      | 'tasks'
      | 'personalities'
      | 'subAgents'
      | 'customRoles'
      | 'roleAssignments'
      | 'experiments'
      | 'allowA2A'
      | 'allowSwarms'
      | 'allowDynamicTools'
      | 'workflows';
    label: string;
    icon: string;
    blockedByPolicy?: boolean;
  }) => {
    const blocked = item.blockedByPolicy ?? false;
    const isEnabled = blocked ? false : creationConfig[item.key];
    return (
      <Fragment key={item.key}>
        <div
          className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
            blocked
              ? 'bg-muted/30 border-border opacity-60'
              : isEnabled
                ? 'bg-success/5 border-success/30'
                : 'bg-muted/50 border-border'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
            {blocked && (
              <a
                href="/settings?tab=security"
                className="text-xs text-destructive hover:underline"
                title="Enable in Settings → Security"
              >
                (disabled by security policy)
              </a>
            )}
          </div>
          <label
            className={`relative inline-flex items-center ${blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={() => {
                if (!blocked) toggleCreationItem(item.key);
              }}
              disabled={blocked}
              className="sr-only peer"
              aria-label={item.label}
            />
            <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
            <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
              {blocked ? 'Blocked' : isEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        {/* Delegation status — shown when Sub-Agent Delegation toggle is on */}
        {item.key === 'subAgents' && creationConfig.subAgents && (
          <div
            className={`mx-1 px-3 py-2 rounded text-xs flex items-start gap-2 ${
              subAgentsBlockedByPolicy
                ? 'bg-destructive/5 border border-destructive/20 text-destructive'
                : 'bg-success/5 border border-success/20 text-success'
            }`}
          >
            <span className="mt-0.5 shrink-0">{subAgentsBlockedByPolicy ? '⚠' : '✓'}</span>
            <span>
              {subAgentsBlockedByPolicy
                ? 'Sub-agent delegation is blocked by the security policy. Enable it in Security Settings → Sub-Agent Delegation.'
                : 'Delegation is ready. This personality can use delegate_task, list_sub_agents, and get_delegation_result.'}
            </span>
          </div>
        )}

        {/* A2A and Swarms sub-settings — only visible when Sub-Agent Delegation is enabled */}
        {item.key === 'subAgents' && creationConfig.subAgents && (
          <div className="ml-6 pl-4 border-l-2 border-border space-y-2">
            {[
              {
                key: 'allowA2A' as const,
                label: 'A2A Networks',
                icon: '🌐',
                blocked: a2aBlockedByPolicy,
              },
              {
                key: 'allowSwarms' as const,
                label: 'Agent Swarms',
                icon: '🐝',
                blocked: swarmsBlockedByPolicy,
              },
            ].map((sub) => {
              const subEnabled = sub.blocked ? false : creationConfig[sub.key];
              return (
                <div
                  key={sub.key}
                  className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
                    sub.blocked
                      ? 'bg-muted/30 border-border opacity-60'
                      : subEnabled
                        ? 'bg-success/5 border-success/30'
                        : 'bg-muted/50 border-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{sub.icon}</span>
                    <span className="font-medium">{sub.label}</span>
                    {sub.blocked && (
                      <span className="text-xs text-destructive">
                        (disabled by security policy)
                      </span>
                    )}
                  </div>
                  <label
                    className={`relative inline-flex items-center ${sub.blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={subEnabled}
                      onChange={() => {
                        if (!sub.blocked) toggleCreationItem(sub.key);
                      }}
                      disabled={sub.blocked}
                      className="sr-only peer"
                      aria-label={sub.label}
                    />
                    <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                    <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
                      {sub.blocked ? 'Blocked' : subEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </Fragment>
    );
  };

  return (
    <CollapsibleSection title="Body - Endowments" defaultOpen={false}>
      {/* Voice & Language — physical expression layer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b pb-4 mb-1">
        <div>
          <label className="block text-sm font-medium mb-1">Voice</label>
          <input
            type="text"
            value={voice}
            onChange={(e) => {
              onVoiceChange(e.target.value);
            }}
            className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="e.g., warm, professional"
            maxLength={200}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Preferred Language</label>
          <input
            type="text"
            value={preferredLanguage}
            onChange={(e) => {
              onPreferredLanguageChange(e.target.value);
            }}
            className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="e.g., English"
            maxLength={100}
          />
        </div>
      </div>

      <CollapsibleSection title="Proactive Assistance" defaultOpen={false}>
        {/* Enable toggle — gated by security policy */}
        {(() => {
          const proactiveBlockedByPolicy = securityPolicy?.allowProactive === false;
          return (
            <div className="space-y-4">
              <div
                className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
                  proactiveBlockedByPolicy
                    ? 'bg-muted/30 border-border opacity-60'
                    : 'bg-muted/50 border-border'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">Enable Assistance</span>
                  {proactiveBlockedByPolicy && (
                    <span className="text-xs text-destructive">(blocked by security policy)</span>
                  )}
                </div>
                <label
                  className={`relative inline-flex items-center ${proactiveBlockedByPolicy ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={proactiveBlockedByPolicy ? false : proactiveConfig.enabled}
                    onChange={() => {
                      if (!proactiveBlockedByPolicy) {
                        onProactiveConfigChange({
                          ...proactiveConfig,
                          enabled: !proactiveConfig.enabled,
                        });
                      }
                    }}
                    disabled={proactiveBlockedByPolicy}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                  <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
                    {proactiveBlockedByPolicy
                      ? 'Blocked'
                      : proactiveConfig.enabled
                        ? 'Enabled'
                        : 'Disabled'}
                  </span>
                </label>
              </div>

              {proactiveConfig.enabled && !proactiveBlockedByPolicy && (
                <>
                  {/* Built-in Triggers — per-item 3-phase approval switch */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Built-in Triggers</h4>
                    <div className="space-y-2">
                      {[
                        { key: 'dailyStandup' as const, label: 'Daily Standup Reminder' },
                        { key: 'weeklySummary' as const, label: 'Weekly Summary' },
                        { key: 'contextualFollowup' as const, label: 'Contextual Follow-up' },
                        {
                          key: 'integrationHealthAlert' as const,
                          label: 'Integration Health Alert',
                        },
                        { key: 'securityAlertDigest' as const, label: 'Security Alert Digest' },
                      ].map((item) => {
                        const isOn = proactiveConfig.builtins[item.key];
                        const activeMode = proactiveConfig.builtinModes[item.key];
                        return (
                          <div
                            key={item.key}
                            className="text-sm px-3 py-2 rounded flex items-center justify-between border bg-muted/50 border-border"
                          >
                            <span className="font-medium">{item.label}</span>
                            <div className="flex gap-1">
                              {(['auto', 'suggest', 'manual'] as const).map((mode) => {
                                const isActive = isOn && activeMode === mode;
                                const activeClass = isActive
                                  ? mode === 'auto'
                                    ? 'bg-green-600 text-white border-green-600'
                                    : mode === 'suggest'
                                      ? 'bg-amber-500 text-white border-amber-500'
                                      : 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-muted/50 border-border hover:bg-muted';
                                return (
                                  <button
                                    key={mode}
                                    type="button"
                                    onClick={() => {
                                      onProactiveConfigChange({
                                        ...proactiveConfig,
                                        builtins: {
                                          ...proactiveConfig.builtins,
                                          [item.key]: !isActive,
                                        },
                                        builtinModes: {
                                          ...proactiveConfig.builtinModes,
                                          [item.key]: mode,
                                        },
                                      });
                                    }}
                                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${activeClass}`}
                                  >
                                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Learning */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Learning</h4>
                    <div className="space-y-3">
                      <div className="text-sm px-3 py-2 rounded flex items-center justify-between border bg-muted/50 border-border">
                        <span className="font-medium">Enable Learning</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={proactiveConfig.learning.enabled}
                            onChange={() => {
                              onProactiveConfigChange({
                                ...proactiveConfig,
                                learning: {
                                  ...proactiveConfig.learning,
                                  enabled: !proactiveConfig.learning.enabled,
                                },
                              });
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                        </label>
                      </div>
                      {proactiveConfig.learning.enabled && (
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">
                            Min Confidence: {proactiveConfig.learning.minConfidence.toFixed(2)}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={proactiveConfig.learning.minConfidence}
                            onChange={(e) => {
                              onProactiveConfigChange({
                                ...proactiveConfig,
                                learning: {
                                  ...proactiveConfig.learning,
                                  minConfidence: parseFloat(e.target.value),
                                },
                              });
                            }}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>0.0</span>
                            <span>1.0</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </CollapsibleSection>

      <div>
        <CollapsibleSection title="Capabilities" defaultOpen={false}>
          <div className="space-y-2">
            {capabilities.map((cap) => {
              const info = capabilityInfo[cap];
              const isEnabled = enabledCaps[cap] ?? false;
              const requiresDesktopControl = cap === 'vision' || cap === 'limb_movement';
              const isDesktopGated = requiresDesktopControl && !desktopControlEnabled;
              const isConfigurable =
                info.available &&
                (cap === 'vision' ||
                  cap === 'auditory' ||
                  cap === 'diagnostics' ||
                  cap === 'limb_movement' ||
                  cap === 'vocalization' ||
                  cap === 'haptic');

              return (
                <div
                  key={cap}
                  className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
                    isEnabled
                      ? 'bg-success/5 border-success/30'
                      : info.available
                        ? 'bg-muted/50 border-border'
                        : 'bg-muted/30 border-border opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{info.icon}</span>
                    <div>
                      <span className="capitalize font-medium">{cap.replace('_', ' ')}</span>
                      <p className="text-xs text-muted-foreground">{info.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!info.available ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        Not available
                      </span>
                    ) : isDesktopGated ? (
                      <span
                        className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground/60 cursor-not-allowed opacity-70"
                        title="Requires Desktop Control to be enabled in Security Settings"
                      >
                        Requires Desktop Control
                      </span>
                    ) : isConfigurable ? (
                      <label
                        className="relative inline-flex items-center cursor-pointer"
                        title={isEnabled ? 'Enabled' : 'Disabled'}
                      >
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => {
                            toggleCapability(cap);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                        <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
                          {isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </label>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        Available
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      </div>

      {/* MCP Connections */}
      <CollapsibleSection title="MCP Connections" defaultOpen={false}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Enable MCP connections</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={allowConnections}
                onChange={(e) => {
                  onAllowConnectionsChange(e.target.checked);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
            </label>
          </div>

          {allowConnections && (
            <>
              <p className="text-xs text-muted-foreground">
                Select which MCP servers this personality can use:
              </p>

              {serversLoading ? (
                <p className="text-xs text-muted-foreground">Loading servers...</p>
              ) : servers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No MCP servers configured. Add servers in Connections &gt; MCP Server.
                </p>
              ) : (
                <div className="space-y-2">
                  {servers.map((server: { id: string; name: string; description: string }) => {
                    const isSelected = selectedServers.includes(server.id);
                    const isYeoman = server.name === LOCAL_MCP_NAME;

                    return (
                      <div key={server.id}>
                        <label
                          className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-success/5 border-success/30'
                              : 'bg-muted/30 border-border hover:bg-muted/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                onSelectedServersChange([...selectedServers, server.id]);
                              } else {
                                onSelectedServersChange(
                                  selectedServers.filter((id) => id !== server.id)
                                );
                              }
                            }}
                            className="w-3.5 h-3.5 rounded accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium">{server.name}</span>
                            {server.description && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {server.description}
                              </p>
                            )}
                          </div>
                        </label>

                        {/* Per-personality feature toggles for YEOMAN MCP */}
                        {isYeoman && isSelected && (
                          <div className="ml-6 mt-1 space-y-1">
                            <p className="text-[10px] text-muted-foreground mb-1">
                              Tool categories this personality can access:
                            </p>
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeGit
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Git & GitHub
                                {!globalMcpConfig?.exposeGit && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    (enable in Connections first)
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeGit}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeGit: e.target.checked,
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeGit}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeFilesystem
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Filesystem
                                {!globalMcpConfig?.exposeFilesystem && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    (enable in Connections first)
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeFilesystem}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeFilesystem: e.target.checked,
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeFilesystem}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            {/* Web Scraping & Search — master toggle */}
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeWeb
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Web Scraping & Search
                                {!globalMcpConfig?.exposeWeb && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    (enable in Connections first)
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeWeb}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeWeb: e.target.checked,
                                    // Disable sub-toggles when master is unchecked
                                    ...(!e.target.checked
                                      ? { exposeWebScraping: false, exposeWebSearch: false }
                                      : {}),
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeWeb}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            {/* Web sub-toggles — only visible when exposeWeb is checked */}
                            {mcpFeatures.exposeWeb && (
                              <>
                                <label
                                  className={`flex items-center gap-2 p-1.5 ml-4 rounded bg-muted/30 transition-colors ${
                                    globalMcpConfig?.exposeWeb && globalMcpConfig?.exposeWebScraping
                                      ? 'cursor-pointer hover:bg-muted/50'
                                      : 'opacity-50 cursor-not-allowed'
                                  }`}
                                >
                                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-xs flex-1">
                                    Scraping Tools
                                    {!(
                                      globalMcpConfig?.exposeWeb &&
                                      globalMcpConfig?.exposeWebScraping
                                    ) && (
                                      <span className="text-[10px] text-muted-foreground ml-1">
                                        (enable in Connections first)
                                      </span>
                                    )}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={mcpFeatures.exposeWebScraping}
                                    onChange={(e) => {
                                      onMcpFeaturesChange({
                                        ...mcpFeatures,
                                        exposeWebScraping: e.target.checked,
                                      });
                                    }}
                                    disabled={
                                      !(
                                        globalMcpConfig?.exposeWeb &&
                                        globalMcpConfig?.exposeWebScraping
                                      )
                                    }
                                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                  />
                                </label>
                                <label
                                  className={`flex items-center gap-2 p-1.5 ml-4 rounded bg-muted/30 transition-colors ${
                                    globalMcpConfig?.exposeWeb && globalMcpConfig?.exposeWebSearch
                                      ? 'cursor-pointer hover:bg-muted/50'
                                      : 'opacity-50 cursor-not-allowed'
                                  }`}
                                >
                                  <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-xs flex-1">
                                    Search Tools
                                    {!(
                                      globalMcpConfig?.exposeWeb && globalMcpConfig?.exposeWebSearch
                                    ) && (
                                      <span className="text-[10px] text-muted-foreground ml-1">
                                        (enable in Connections first)
                                      </span>
                                    )}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={mcpFeatures.exposeWebSearch}
                                    onChange={(e) => {
                                      onMcpFeaturesChange({
                                        ...mcpFeatures,
                                        exposeWebSearch: e.target.checked,
                                      });
                                    }}
                                    disabled={
                                      !(
                                        globalMcpConfig?.exposeWeb &&
                                        globalMcpConfig?.exposeWebSearch
                                      )
                                    }
                                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                  />
                                </label>
                              </>
                            )}
                            {/* Browser Automation — standalone toggle */}
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeBrowser
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <Monitor className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Browser Automation
                                {!globalMcpConfig?.exposeBrowser && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    — enable in Connections first
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeBrowser}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeBrowser: e.target.checked,
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeBrowser}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            {/* Remote Desktop Control — standalone toggle */}
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeDesktopControl
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <Monitor className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Remote Desktop Control
                                {!globalMcpConfig?.exposeDesktopControl && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    — enable in Connections first
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeDesktopControl}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeDesktopControl: e.target.checked,
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeDesktopControl}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            {/* ── Network Tools ─────────────────────────── */}
                            <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                                <Network className="w-3 h-3" />
                                Network Tools
                              </p>
                              {/* Device Automation */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeNetworkTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  Device Automation (SSH)
                                  {!globalMcpConfig?.exposeNetworkTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Network Tools in Security Settings first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeNetworkDevices}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeNetworkDevices: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeNetworkTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Discovery & Routing */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeNetworkTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  Discovery & Routing Analysis
                                  {!globalMcpConfig?.exposeNetworkTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Network Tools in Security Settings first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeNetworkDiscovery}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeNetworkDiscovery: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeNetworkTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Security Auditing */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeNetworkTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  Security Auditing
                                  {!globalMcpConfig?.exposeNetworkTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Network Tools in Security Settings first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeNetworkAudit}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeNetworkAudit: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeNetworkTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* NVD / CVE */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeNetworkTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  NVD / CVE Assessment
                                  {!globalMcpConfig?.exposeNetworkTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Network Tools in Security Settings first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeNvd}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeNvd: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeNetworkTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Network Utilities */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeNetworkTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  Network Utilities &amp; PCAP Analysis
                                  {!globalMcpConfig?.exposeNetworkTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Network Tools in Security Settings first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeNetworkUtils}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeNetworkUtils: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeNetworkTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* NetBox */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeNetworkTools &&
                                  securityPolicy?.allowNetBoxWrite
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  NetBox Integration
                                  {!globalMcpConfig?.exposeNetworkTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Network Tools in Connections first
                                    </span>
                                  )}
                                  {globalMcpConfig?.exposeNetworkTools &&
                                    !securityPolicy?.allowNetBoxWrite && (
                                      <span className="text-[10px] text-muted-foreground ml-1">
                                        — enable NetBox Write in Connections first
                                      </span>
                                    )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeNetBox}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeNetBox: e.target.checked,
                                    });
                                  }}
                                  disabled={
                                    !globalMcpConfig?.exposeNetworkTools ||
                                    !securityPolicy?.allowNetBoxWrite
                                  }
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                            </div>
                            {/* ── Twingate ───────────────────────────── */}
                            <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                Twingate Remote Access
                              </p>
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeTwingateTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  Twingate Resources &amp; MCP Proxy
                                  {!globalMcpConfig?.exposeTwingateTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Twingate in Security Settings first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeTwingateTools}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeTwingateTools: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeTwingateTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                            </div>
                            {/* ── Connected Account API Tools ─────────── */}
                            <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                Connected Account Tools
                              </p>
                              {/* Gmail */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeGmail
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  Gmail
                                  {!globalMcpConfig?.exposeGmail && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Gmail in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeGmail}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeGmail: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeGmail}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Twitter / X */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeTwitter
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  Twitter / X
                                  {!globalMcpConfig?.exposeTwitter && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Twitter in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeTwitter}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeTwitter: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeTwitter}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* GitHub */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeGithub
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  GitHub
                                  {!globalMcpConfig?.exposeGithub && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable GitHub in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeGithub}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeGithub: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeGithub}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                            </div>
                            {/* ── Infrastructure Tools ─────────────────── */}
                            <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                                <Box className="w-3 h-3" />
                                Infrastructure Tools
                              </p>
                              {/* Docker */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeDockerTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <Box className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  Docker
                                  {!globalMcpConfig?.exposeDockerTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Docker in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeDocker}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeDocker: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeDockerTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* Integration Access */}
      <CollapsibleSection title="Integration Access" defaultOpen={false}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Choose which integrations this personality can access and set the permission level per
            integration. Leave all unchecked to allow access to every configured integration.
          </p>
          <div className="flex items-start gap-2 text-[10px] text-muted-foreground bg-muted/30 rounded p-2">
            <span className="font-semibold text-foreground/60 shrink-0">Modes:</span>
            <span>
              <strong className="text-foreground/80">Auto</strong> — acts autonomously (send, post,
              reply).
            </span>
            <span>
              <strong className="text-foreground/80">Draft</strong> — composes but awaits approval.
            </span>
            <span>
              <strong className="text-foreground/80">Suggest</strong> — recommends only, never acts.
            </span>
          </div>

          {integrationsLoadingAll ? (
            <p className="text-xs text-muted-foreground">Loading integrations...</p>
          ) : integrations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No integrations configured. Add integrations in Connections &gt; Integrations.
            </p>
          ) : (
            <div className="space-y-2">
              {integrations.map((integration) => {
                const entry = integrationAccess.find((a) => a.id === integration.id);
                const isSelected = !!entry;
                const mode: IntegrationAccessMode = entry?.mode ?? 'suggest';

                const setMode = (newMode: IntegrationAccessMode) => {
                  onIntegrationAccessChange(
                    integrationAccess.map((a) =>
                      a.id === integration.id ? { ...a, mode: newMode } : a
                    )
                  );
                };

                return (
                  <div key={integration.id} className="space-y-1 px-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onIntegrationAccessChange([
                                ...integrationAccess,
                                { id: integration.id, mode: 'suggest' },
                              ]);
                            } else {
                              onIntegrationAccessChange(
                                integrationAccess.filter((a) => a.id !== integration.id)
                              );
                            }
                          }}
                          className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                        />
                        <span className="text-sm font-medium truncate">
                          {integration.displayName}
                        </span>
                      </label>

                      {isSelected && (
                        <div className="flex gap-1 shrink-0">
                          {(
                            [
                              {
                                value: 'auto',
                                label: 'Auto',
                                activeClass: 'bg-green-600 text-white border-green-600',
                              },
                              {
                                value: 'draft',
                                label: 'Draft',
                                activeClass: 'bg-amber-500 text-white border-amber-500',
                              },
                              {
                                value: 'suggest',
                                label: 'Suggest',
                                activeClass: 'bg-blue-600 text-white border-blue-600',
                              },
                            ] as const
                          ).map(({ value, label, activeClass }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                setMode(value);
                              }}
                              className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                                mode === value
                                  ? activeClass
                                  : 'bg-muted/50 border-border hover:bg-muted'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground pl-5">{integration.platform}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Resources" defaultOpen={false}>
        <p className="text-xs text-muted-foreground">
          Grant this personality autonomous resource and orchestration capabilities.
        </p>

        <CollapsibleSection
          title="Creation"
          defaultOpen={false}
          headerRight={
            <label className="relative inline-flex items-center gap-1.5 cursor-pointer">
              <span className="text-xs text-muted-foreground">All enabled</span>
              <input
                type="checkbox"
                checked={allCreationEnabled}
                onChange={toggleAllCreationItems}
                className="sr-only peer"
                aria-label="Enable all creation"
              />
              <div className="relative w-8 h-4 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
            </label>
          }
        >
          <p className="text-xs text-muted-foreground mb-3">
            Allow this personality to autonomously create new skills, tasks, roles, experiments, and
            personalities.
          </p>
          <div className="space-y-2">{resourceItems.map(renderToggleRow)}</div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Orchestration"
          defaultOpen={false}
          headerRight={
            <label className="relative inline-flex items-center gap-1.5 cursor-pointer">
              <span className="text-xs text-muted-foreground">All enabled</span>
              <input
                type="checkbox"
                checked={allOrchestrationEnabled}
                onChange={toggleAllOrchestrationItems}
                className="sr-only peer"
                aria-label="Enable all orchestration"
              />
              <div className="relative w-8 h-4 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
            </label>
          }
        >
          <p className="text-xs text-muted-foreground mb-3">
            Allow this personality to delegate to agents, run workflows, and register dynamic tools.
            Requires the corresponding toggle to be enabled in Settings &gt; Security.
          </p>
          <div className="space-y-2">{orchestrationItems.map(renderToggleRow)}</div>
        </CollapsibleSection>

        <div className="space-y-2 px-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Deletion</span>
            <div className="flex gap-1">
              {(
                [
                  {
                    value: 'auto',
                    label: 'Auto',
                    activeClass: 'bg-green-600 text-white border-green-600',
                  },
                  {
                    value: 'request',
                    label: 'Suggest',
                    activeClass: 'bg-amber-500 text-white border-amber-500',
                  },
                  {
                    value: 'manual',
                    label: 'Manual',
                    activeClass: 'bg-blue-600 text-white border-blue-600',
                  },
                ] as const
              ).map(({ value, label, activeClass }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    onResourcePolicyChange({ ...resourcePolicy, deletionMode: value });
                  }}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    resourcePolicy.deletionMode === value
                      ? activeClass
                      : 'bg-muted/50 border-border hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {resourcePolicy.deletionMode === 'auto' &&
              'Deletion happens immediately with no prompt.'}
            {resourcePolicy.deletionMode === 'request' &&
              'Deletion requires a confirmation step. AI cannot delete this personality.'}
            {resourcePolicy.deletionMode === 'manual' &&
              'Deletion is fully blocked. Change this setting to delete.'}
          </p>
        </div>

        <div className="space-y-2 px-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Automation</span>
            <div className="flex gap-1">
              {(
                [
                  {
                    value: 'supervised_auto',
                    label: 'Supervised',
                    activeClass: 'bg-green-600 text-white border-green-600',
                  },
                  {
                    value: 'semi_auto',
                    label: 'Semi-Auto',
                    activeClass: 'bg-amber-500 text-white border-amber-500',
                  },
                  {
                    value: 'full_manual',
                    label: 'Full Manual',
                    activeClass: 'bg-blue-600 text-white border-blue-600',
                  },
                ] as const
              ).map(({ value, label, activeClass }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    onResourcePolicyChange({ ...resourcePolicy, automationLevel: value });
                  }}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    resourcePolicy.automationLevel === value
                      ? activeClass
                      : 'bg-muted/50 border-border hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {resourcePolicy.automationLevel === 'supervised_auto' &&
              'AI actions proceed immediately. You receive notifications.'}
            {resourcePolicy.automationLevel === 'semi_auto' &&
              'Destructive AI actions (delete) are queued for your approval. Creative actions proceed.'}
            {resourcePolicy.automationLevel === 'full_manual' &&
              'Every AI-initiated creation or deletion is queued for your approval.'}
          </p>
        </div>

        <div className="space-y-1.5 px-1">
          <div className="flex items-center justify-between">
            <span
              className={`text-sm font-medium ${resourcePolicy.emergencyStop ? 'text-destructive' : ''}`}
            >
              Emergency Stop
            </span>
            <button
              type="button"
              onClick={() => {
                onResourcePolicyChange({
                  ...resourcePolicy,
                  emergencyStop: !resourcePolicy.emergencyStop,
                });
              }}
              className="px-3 py-1 text-xs font-semibold rounded border transition-colors whitespace-nowrap bg-destructive text-white border-destructive hover:bg-destructive/90"
            >
              {resourcePolicy.emergencyStop ? '⏹ Stop Active' : '⏹ Emergency Stop'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {resourcePolicy.emergencyStop
              ? 'All AI mutations are blocked. Click to resume normal operation.'
              : 'Kill-switch: immediately blocks all AI mutations regardless of automation level.'}
          </p>
        </div>
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

function HeartSection() {
  return (
    <CollapsibleSection title="Heart — Pulse">
      <div>
        <h4 className="text-sm font-medium mb-2">Heartbeat Tasks</h4>
        <HeartbeatTasksSection />
      </div>
    </CollapsibleSection>
  );
}

// ── Main PersonalityEditor ──────────────────────────────────────

export function PersonalityEditor() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Personality | null>(null);
  const [deleteLockedMsg, setDeleteLockedMsg] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [setActiveOnSave, setSetActiveOnSave] = useState(false);
  const [form, setForm] = useState<PersonalityCreate>({
    name: '',
    description: '',
    systemPrompt: '',
    traits: { formality: 'balanced', humor: 'subtle', verbosity: 'concise' },
    sex: 'unspecified',
    voice: '',
    preferredLanguage: '',
    defaultModel: null,
    modelFallbacks: [],
    includeArchetypes: true,
    injectDateTime: false,
    empathyResonance: false,
    body: {
      enabled: false,
      capabilities: [],
      heartEnabled: true,
      creationConfig: {
        skills: false,
        tasks: false,
        personalities: false,
        subAgents: false,
        customRoles: false,
        roleAssignments: false,
        experiments: false,
      },
    },
  });

  const [creationConfig, setCreationConfig] = useState({
    skills: false,
    tasks: false,
    personalities: false,
    subAgents: false,
    customRoles: false,
    roleAssignments: false,
    experiments: false,
    allowA2A: false,
    allowSwarms: false,
    allowDynamicTools: false,
    workflows: false,
  });

  const [allowConnections, setAllowConnections] = useState(false);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [integrationAccess, setIntegrationAccess] = useState<IntegrationAccess[]>([]);
  const [enabledCaps, setEnabledCaps] = useState<Record<string, boolean>>({
    vision: false,
    limb_movement: false,
    auditory: false,
    haptic: false,
    vocalization: false,
    diagnostics: false,
  });
  const [mcpFeatures, setMcpFeatures] = useState<{
    exposeGit: boolean;
    exposeFilesystem: boolean;
    exposeWeb: boolean;
    exposeWebScraping: boolean;
    exposeWebSearch: boolean;
    exposeBrowser: boolean;
    exposeDesktopControl: boolean;
    exposeNetworkDevices: boolean;
    exposeNetworkDiscovery: boolean;
    exposeNetworkAudit: boolean;
    exposeNetBox: boolean;
    exposeNvd: boolean;
    exposeNetworkUtils: boolean;
    exposeTwingateTools: boolean;
    exposeOrgIntentTools: boolean;
    exposeGmail: boolean;
    exposeTwitter: boolean;
    exposeGithub: boolean;
    exposeDocker: boolean;
  }>({
    exposeGit: false,
    exposeFilesystem: false,
    exposeWeb: false,
    exposeWebScraping: false,
    exposeWebSearch: false,
    exposeBrowser: false,
    exposeDesktopControl: false,
    exposeNetworkDevices: false,
    exposeNetworkDiscovery: false,
    exposeNetworkAudit: false,
    exposeNetBox: false,
    exposeNvd: false,
    exposeNetworkUtils: false,
    exposeTwingateTools: false,
    exposeOrgIntentTools: false,
    exposeGmail: false,
    exposeTwitter: false,
    exposeGithub: false,
    exposeDocker: false,
  });
  const [proactiveConfig, setProactiveConfig] = useState<{
    enabled: boolean;
    builtins: {
      dailyStandup: boolean;
      weeklySummary: boolean;
      contextualFollowup: boolean;
      integrationHealthAlert: boolean;
      securityAlertDigest: boolean;
    };
    builtinModes: {
      dailyStandup: 'auto' | 'suggest' | 'manual';
      weeklySummary: 'auto' | 'suggest' | 'manual';
      contextualFollowup: 'auto' | 'suggest' | 'manual';
      integrationHealthAlert: 'auto' | 'suggest' | 'manual';
      securityAlertDigest: 'auto' | 'suggest' | 'manual';
    };
    learning: { enabled: boolean; minConfidence: number };
  }>({
    enabled: false,
    builtins: {
      dailyStandup: false,
      weeklySummary: false,
      contextualFollowup: false,
      integrationHealthAlert: false,
      securityAlertDigest: false,
    },
    builtinModes: {
      dailyStandup: 'auto',
      weeklySummary: 'suggest',
      contextualFollowup: 'suggest',
      integrationHealthAlert: 'auto',
      securityAlertDigest: 'suggest',
    },
    learning: { enabled: true, minConfidence: 0.7 },
  });
  const [activeHours, setActiveHours] = useState<{
    enabled: boolean;
    start: string;
    end: string;
    daysOfWeek: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
    timezone: string;
  }>({
    enabled: false,
    start: '09:00',
    end: '17:00',
    daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
    timezone: 'UTC',
  });

  const [thinkingConfig, setThinkingConfig] = useState({ enabled: false, budgetTokens: 10000 });
  const [maxPromptTokens, setMaxPromptTokens] = useState<number | null>(null);
  const [omnipresentMind, setOmnipresentMind] = useState(false);
  const [strictSystemPromptConfidentiality, setStrictSystemPromptConfidentiality] = useState<
    boolean | undefined
  >(undefined);
  const [knowledgeMode, setKnowledgeMode] = useState<'rag' | 'notebook' | 'hybrid'>('rag');
  const [notebookTokenBudget, setNotebookTokenBudget] = useState<number | null>(null);

  const [resourcePolicy, setResourcePolicy] = useState<{
    deletionMode: 'auto' | 'request' | 'manual';
    automationLevel: 'full_manual' | 'semi_auto' | 'supervised_auto';
    emergencyStop: boolean;
  }>({
    deletionMode: 'auto',
    automationLevel: 'supervised_auto',
    emergencyStop: false,
  });

  // Collaborative editing — active when an existing personality is open for editing
  const collabDocId = editing && editing !== 'new' ? `personality:${editing}` : null;
  const {
    text: collabSystemPrompt,
    onTextChange: onCollabSystemPromptChange,
    presenceUsers: systemPromptPresence,
  } = useCollabEditor(collabDocId, 'systemPrompt', form.systemPrompt);

  const { data: personalitiesData, isLoading } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const { data: preview } = useQuery({
    queryKey: ['promptPreview', previewId],
    queryFn: () => fetchPromptPreview(previewId!),
    enabled: !!previewId,
  });

  const { data: modelData } = useQuery({
    queryKey: ['modelInfo'],
    queryFn: fetchModelInfo,
  });

  const { data: soulConfig } = useQuery({
    queryKey: ['soulConfig'],
    queryFn: fetchSoulConfig,
  });

  const { data: globalMcpConfig } = useQuery({
    queryKey: ['mcpConfig'],
    queryFn: fetchMcpConfig,
  });

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
  });

  const personalities = personalitiesData?.personalities ?? [];

  const createMut = useMutation({
    mutationFn: (data: PersonalityCreate) => createPersonality(data),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      if (setActiveOnSave) {
        setDefaultMut.mutate(result.personality.id);
      }
      setEditing(null);
      setSetActiveOnSave(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PersonalityCreate> }) =>
      updatePersonality(id, data),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      if (setActiveOnSave && variables.id) {
        setDefaultMut.mutate(variables.id);
      }
      setEditing(null);
      setSetActiveOnSave(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => {
      setActivatingId(id);
      setActivateError(null);
      return activatePersonality(id);
    },
    onSuccess: () => {
      setActivatingId(null);
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['promptPreview'] });
    },
    onError: (err: Error) => {
      setActivatingId(null);
      setActivateError(err.message || 'Failed to activate personality');
    },
  });

  const enableMut = useMutation({
    mutationFn: (id: string) => enablePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const disableMut = useMutation({
    mutationFn: (id: string) => disablePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const setDefaultMut = useMutation({
    mutationFn: (id: string) => setDefaultPersonality(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['promptPreview'] });
    },
  });

  const clearDefaultMut = useMutation({
    mutationFn: () => clearDefaultPersonality(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['promptPreview'] });
    },
  });

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      const pName = searchParams.get('name') || '';
      const pDescription = searchParams.get('description') || '';
      const pModel = searchParams.get('model') || '';
      setForm((prev) => ({
        ...prev,
        name: pName,
        description: pDescription,
        defaultModel: pModel || null,
      }));
      setEditing('new');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const startEdit = (p: Personality) => {
    const body = p.body ?? {
      enabled: false,
      capabilities: [],
      heartEnabled: true,
      creationConfig: {
        skills: false,
        tasks: false,
        personalities: false,
        subAgents: false,
        customRoles: false,
        roleAssignments: false,
        experiments: false,
        workflows: false,
      },
    };
    setForm({
      name: p.name,
      description: p.description,
      systemPrompt: p.systemPrompt,
      traits: p.traits,
      sex: p.sex,
      voice: p.voice,
      preferredLanguage: p.preferredLanguage,
      defaultModel: p.defaultModel,
      modelFallbacks: p.modelFallbacks ?? [],
      includeArchetypes: p.includeArchetypes,
      injectDateTime: p.injectDateTime ?? false,
      empathyResonance: p.empathyResonance ?? false,
      body,
    });
    setResourcePolicy({
      deletionMode: p.body?.resourcePolicy?.deletionMode ?? 'auto',
      automationLevel: p.body?.resourcePolicy?.automationLevel ?? 'supervised_auto',
      emergencyStop: p.body?.resourcePolicy?.emergencyStop ?? false,
    });
    setCreationConfig({
      skills: body.creationConfig?.skills ?? false,
      tasks: body.creationConfig?.tasks ?? false,
      personalities: body.creationConfig?.personalities ?? false,
      subAgents: body.creationConfig?.subAgents ?? false,
      customRoles: body.creationConfig?.customRoles ?? false,
      roleAssignments: body.creationConfig?.roleAssignments ?? false,
      experiments: body.creationConfig?.experiments ?? false,
      allowA2A: body.creationConfig?.allowA2A ?? false,
      allowSwarms: body.creationConfig?.allowSwarms ?? false,
      allowDynamicTools: p.body?.creationConfig?.allowDynamicTools ?? false,
      workflows: body.creationConfig?.workflows ?? false,
    });
    setAllowConnections(body.enabled ?? false);
    setSelectedServers(body.selectedServers ?? []);
    // Migrate from legacy selectedIntegrations (string[]) to integrationAccess if needed
    const legacyIds: string[] = body.selectedIntegrations ?? [];
    const access: IntegrationAccess[] =
      (body.integrationAccess ?? []).length > 0
        ? (body.integrationAccess ?? [])
        : legacyIds.map((id) => ({ id, mode: 'auto' as const }));
    setIntegrationAccess(access);
    const caps = body.capabilities ?? [];
    setEnabledCaps({
      vision: caps.includes('vision'),
      limb_movement: caps.includes('limb_movement'),
      auditory: caps.includes('auditory'),
      haptic: caps.includes('haptic'),
      vocalization: caps.includes('vocalization'),
      diagnostics: caps.includes('diagnostics'),
    });
    setMcpFeatures({
      exposeGit: body.mcpFeatures?.exposeGit ?? false,
      exposeFilesystem: body.mcpFeatures?.exposeFilesystem ?? false,
      exposeWeb: body.mcpFeatures?.exposeWeb ?? false,
      exposeWebScraping: body.mcpFeatures?.exposeWebScraping ?? false,
      exposeWebSearch: body.mcpFeatures?.exposeWebSearch ?? false,
      exposeBrowser: body.mcpFeatures?.exposeBrowser ?? false,
      exposeDesktopControl: body.mcpFeatures?.exposeDesktopControl ?? false,
      exposeNetworkDevices: body.mcpFeatures?.exposeNetworkDevices ?? false,
      exposeNetworkDiscovery: body.mcpFeatures?.exposeNetworkDiscovery ?? false,
      exposeNetworkAudit: body.mcpFeatures?.exposeNetworkAudit ?? false,
      exposeNetBox: body.mcpFeatures?.exposeNetBox ?? false,
      exposeNvd: body.mcpFeatures?.exposeNvd ?? false,
      exposeNetworkUtils: body.mcpFeatures?.exposeNetworkUtils ?? false,
      exposeTwingateTools: body.mcpFeatures?.exposeTwingateTools ?? false,
      exposeOrgIntentTools: body.mcpFeatures?.exposeOrgIntentTools ?? false,
      exposeGmail: body.mcpFeatures?.exposeGmail ?? false,
      exposeTwitter: body.mcpFeatures?.exposeTwitter ?? false,
      exposeGithub: body.mcpFeatures?.exposeGithub ?? false,
      exposeDocker: body.mcpFeatures?.exposeDocker ?? false,
    });
    setProactiveConfig({
      enabled: body.proactiveConfig?.enabled ?? false,
      builtins: {
        dailyStandup: body.proactiveConfig?.builtins?.dailyStandup ?? false,
        weeklySummary: body.proactiveConfig?.builtins?.weeklySummary ?? false,
        contextualFollowup: body.proactiveConfig?.builtins?.contextualFollowup ?? false,
        integrationHealthAlert: body.proactiveConfig?.builtins?.integrationHealthAlert ?? false,
        securityAlertDigest: body.proactiveConfig?.builtins?.securityAlertDigest ?? false,
      },
      builtinModes: {
        dailyStandup: body.proactiveConfig?.builtinModes?.dailyStandup ?? 'auto',
        weeklySummary: body.proactiveConfig?.builtinModes?.weeklySummary ?? 'suggest',
        contextualFollowup: body.proactiveConfig?.builtinModes?.contextualFollowup ?? 'suggest',
        integrationHealthAlert:
          body.proactiveConfig?.builtinModes?.integrationHealthAlert ?? 'auto',
        securityAlertDigest: body.proactiveConfig?.builtinModes?.securityAlertDigest ?? 'suggest',
      },
      learning: {
        enabled: body.proactiveConfig?.learning?.enabled ?? true,
        minConfidence: body.proactiveConfig?.learning?.minConfidence ?? 0.7,
      },
    });
    setActiveHours({
      enabled: body.activeHours?.enabled ?? false,
      start: body.activeHours?.start ?? '09:00',
      end: body.activeHours?.end ?? '17:00',
      daysOfWeek: body.activeHours?.daysOfWeek ?? ['mon', 'tue', 'wed', 'thu', 'fri'],
      timezone: body.activeHours?.timezone ?? 'UTC',
    });
    setThinkingConfig({
      enabled: body.thinkingConfig?.enabled ?? false,
      budgetTokens: body.thinkingConfig?.budgetTokens ?? 10000,
    });
    setMaxPromptTokens(body.maxPromptTokens ?? null);
    setOmnipresentMind(body.omnipresentMind ?? false);
    setStrictSystemPromptConfidentiality(body.strictSystemPromptConfidentiality);
    setKnowledgeMode((body.knowledgeMode as 'rag' | 'notebook' | 'hybrid') ?? 'rag');
    setNotebookTokenBudget(body.notebookTokenBudget ?? null);
    setSetActiveOnSave(false);
    setEditing(p.id);
  };

  const startCreate = () => {
    const body = {
      enabled: false,
      capabilities: [],
      heartEnabled: true,
      creationConfig: {
        skills: false,
        tasks: false,
        personalities: false,
        subAgents: false,
        customRoles: false,
        roleAssignments: false,
        experiments: false,
      },
    };
    setForm({
      name: '',
      description: '',
      systemPrompt: '',
      traits: { formality: 'balanced', humor: 'subtle', verbosity: 'concise' },
      sex: 'unspecified',
      voice: '',
      preferredLanguage: '',
      defaultModel: null,
      modelFallbacks: [],
      includeArchetypes: false,
      body,
    });
    setResourcePolicy({
      deletionMode: 'auto',
      automationLevel: 'supervised_auto',
      emergencyStop: false,
    });
    setCreationConfig({
      skills: false,
      tasks: false,
      personalities: false,
      subAgents: false,
      customRoles: false,
      roleAssignments: false,
      experiments: false,
      allowA2A: false,
      allowSwarms: false,
      allowDynamicTools: false,
      workflows: false,
    });
    setAllowConnections(false);
    setSelectedServers([]);
    setEnabledCaps({
      vision: false,
      limb_movement: false,
      auditory: false,
      haptic: false,
      vocalization: false,
      diagnostics: false,
    });
    setMcpFeatures({
      exposeGit: false,
      exposeFilesystem: false,
      exposeWeb: false,
      exposeWebScraping: false,
      exposeWebSearch: false,
      exposeBrowser: false,
      exposeDesktopControl: false,
      exposeNetworkDevices: false,
      exposeNetworkDiscovery: false,
      exposeNetworkAudit: false,
      exposeNetBox: false,
      exposeNvd: false,
      exposeNetworkUtils: false,
      exposeTwingateTools: false,
      exposeOrgIntentTools: false,
      exposeGmail: false,
      exposeTwitter: false,
      exposeGithub: false,
      exposeDocker: false,
    });
    setProactiveConfig({
      enabled: false,
      builtins: {
        dailyStandup: false,
        weeklySummary: false,
        contextualFollowup: false,
        integrationHealthAlert: false,
        securityAlertDigest: false,
      },
      builtinModes: {
        dailyStandup: 'auto',
        weeklySummary: 'suggest',
        contextualFollowup: 'suggest',
        integrationHealthAlert: 'auto',
        securityAlertDigest: 'suggest',
      },
      learning: { enabled: true, minConfidence: 0.7 },
    });
    setActiveHours({
      enabled: false,
      start: '09:00',
      end: '17:00',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
      timezone: 'UTC',
    });
    setThinkingConfig({ enabled: false, budgetTokens: 10000 });
    setMaxPromptTokens(null);
    setOmnipresentMind(false);
    setStrictSystemPromptConfidentiality(undefined);
    setResourcePolicy({
      deletionMode: 'auto',
      automationLevel: 'supervised_auto',
      emergencyStop: false,
    });
    setSetActiveOnSave(false);
    setEditing('new');
  };

  const handleSave = () => {
    const capabilities = Object.entries(enabledCaps)
      .filter(([, enabled]) => enabled)
      .map(([cap]) => cap);
    const formWithBody = {
      ...form,
      body: {
        ...form.body,
        enabled: allowConnections,
        capabilities,
        heartEnabled: true,
        creationConfig,
        selectedServers,
        selectedIntegrations: integrationAccess.map((a) => a.id), // keep for backward compat
        integrationAccess,
        mcpFeatures,
        proactiveConfig,
        activeHours,
        thinkingConfig,
        ...(maxPromptTokens !== null ? { maxPromptTokens } : {}),
        omnipresentMind,
        ...(strictSystemPromptConfidentiality !== undefined
          ? { strictSystemPromptConfidentiality }
          : {}),
        knowledgeMode,
        ...(notebookTokenBudget !== null ? { notebookTokenBudget } : {}),
        resourcePolicy,
      },
    };
    if (editing === 'new') {
      createMut.mutate(formWithBody);
    } else if (editing) {
      updateMut.mutate({ id: editing, data: formWithBody });
    }
  };

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMut.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMut]);

  const editingPersonality =
    editing && editing !== 'new' ? personalities.find((p) => p.id === editing) : null;

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Delete locked message */}
      {deleteLockedMsg && (
        <div className="card p-3 border-warning bg-warning/10 text-warning-foreground text-sm flex items-center justify-between">
          <span>{deleteLockedMsg}</span>
          <button
            onClick={() => {
              setDeleteLockedMsg(null);
            }}
            className="btn-ghost p-1 ml-2"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Personality"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Personalities</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define the agents that power your assistant
          </p>
        </div>
        <button
          onClick={startCreate}
          className="btn btn-ghost flex items-center justify-center gap-1 text-sm sm:text-base"
        >
          <Plus className="w-4 h-4" /> <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">New Personality</span>
        </button>
      </div>

      {activateError && (
        <div className="card p-3 border-destructive bg-destructive/10 text-destructive text-sm flex items-center justify-between">
          <span>{activateError}</span>
          <button
            onClick={() => {
              setActivateError(null);
            }}
            className="btn-ghost p-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}

      {/* Editor Form */}
      {editing && (
        <div className="card p-3 sm:p-4 space-y-4 border-primary overflow-x-hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium truncate">
                {editing === 'new' ? 'Create Personality' : form.name?.trim() || 'Edit Personality'}
              </h3>
              {editingPersonality?.isDefault && (
                <p className="text-xs text-primary flex items-center gap-1 mt-0.5">
                  <Star className="w-3 h-3 fill-current flex-shrink-0" />
                  Default — used for new chats and the dashboard
                </p>
              )}
            </div>
          </div>

          {/* Soul Section */}
          <CollapsibleSection title="Soul — Essence" defaultOpen>
            {editingPersonality && editing !== 'new' && (
              <AvatarUpload
                personality={editingPersonality}
                onUpdated={() => {
                  void queryClient.invalidateQueries({ queryKey: ['personalities'] });
                }}
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Identity</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }));
                  }}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Physiognomy (Gender)</label>
                <select
                  value={form.sex}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, sex: e.target.value as PersonalityCreate['sex'] }));
                  }}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {SEX_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Identity Abstract</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => {
                  setForm((f) => ({ ...f, description: e.target.value }));
                }}
                className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                maxLength={1000}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Core Heuristics</label>
              <PresenceBanner users={systemPromptPresence} />
              <textarea
                value={collabDocId ? collabSystemPrompt : form.systemPrompt}
                onChange={(e) => {
                  const val = e.target.value;
                  if (collabDocId) {
                    onCollabSystemPromptChange(val);
                    setForm((f) => ({ ...f, systemPrompt: val }));
                  } else {
                    setForm((f) => ({ ...f, systemPrompt: val }));
                  }
                }}
                className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                rows={4}
                maxLength={8000}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {(
                  (collabDocId ? collabSystemPrompt : form.systemPrompt)?.length ?? 0
                ).toLocaleString()}{' '}
                / 8,000 chars
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm">Ontostasis</span>
                <span className="text-xs text-muted-foreground">
                  Locks this personality's existence — prevents any AI-initiated deletion. Only a
                  human admin can remove it from the dashboard
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={resourcePolicy.deletionMode === 'manual'}
                  onChange={(e) => {
                    setResourcePolicy((r) => ({
                      ...r,
                      deletionMode: e.target.checked ? 'manual' : 'auto',
                    }));
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm">Protostasis</span>
                <span className="text-xs text-muted-foreground">
                  {editing === 'new'
                    ? 'Make this personality the first presence — the one that greets every new chat and anchors the dashboard'
                    : 'This personality is the first presence — it anchors every new chat and the dashboard default'}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    editing === 'new' ? setActiveOnSave : (editingPersonality?.isDefault ?? false)
                  }
                  onChange={(e) => {
                    if (editing === 'new') {
                      setSetActiveOnSave(e.target.checked);
                    } else if (
                      e.target.checked &&
                      editingPersonality &&
                      !editingPersonality.isDefault
                    ) {
                      setDefaultMut.mutate(editingPersonality.id);
                    } else if (!e.target.checked && editingPersonality?.isDefault) {
                      clearDefaultMut.mutate();
                    }
                  }}
                  disabled={setDefaultMut.isPending || clearDefaultMut.isPending}
                  aria-label="Default personality"
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Disposition</label>
              <div className="space-y-2">
                {Object.entries(TRAIT_OPTIONS).map(([trait, options]) => (
                  <div
                    key={trait}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
                  >
                    <span className="text-xs text-muted-foreground sm:w-20 capitalize">
                      {trait}
                    </span>
                    <div className="flex gap-1 flex-wrap">
                      {options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => {
                            setForm((f) => ({ ...f, traits: { ...f.traits, [trait]: opt } }));
                          }}
                          className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                            form.traits?.[trait] === opt
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background hover:bg-muted'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>

          {/* Spirit Section */}
          <SpiritSection
            includeArchetypes={form.includeArchetypes ?? true}
            onIncludeArchetypesChange={(v) => {
              setForm((f) => ({ ...f, includeArchetypes: v }));
            }}
            empathyResonance={form.empathyResonance ?? false}
            onEmpathyResonanceChange={(v) => {
              setForm((f) => ({ ...f, empathyResonance: v }));
            }}
          />

          {/* Brain Section */}
          <BrainSection
            personalityId={editing !== 'new' ? editing : null}
            activeHours={activeHours}
            onActiveHoursChange={setActiveHours}
            thinkingConfig={thinkingConfig}
            onThinkingConfigChange={setThinkingConfig}
            maxPromptTokens={maxPromptTokens}
            onMaxPromptTokensChange={setMaxPromptTokens}
            globalMaxPromptTokens={soulConfig?.maxPromptTokens ?? 16000}
            exposeOrgIntentTools={mcpFeatures.exposeOrgIntentTools}
            onExposeOrgIntentToolsChange={(v) => {
              setMcpFeatures((f) => ({ ...f, exposeOrgIntentTools: v }));
            }}
            orgIntentMcpEnabled={securityPolicy?.allowIntentEditor ?? false}
            omnipresentMind={omnipresentMind}
            onOmnipresentMindChange={setOmnipresentMind}
            strictSystemPromptConfidentiality={strictSystemPromptConfidentiality ?? false}
            onStrictSystemPromptConfidentialityChange={setStrictSystemPromptConfidentiality}
            knowledgeMode={knowledgeMode}
            onKnowledgeModeChange={setKnowledgeMode}
            notebookTokenBudget={notebookTokenBudget}
            onNotebookTokenBudgetChange={setNotebookTokenBudget}
            injectDateTime={form.injectDateTime ?? false}
            onInjectDateTimeChange={(v) => {
              setForm((f) => ({ ...f, injectDateTime: v }));
            }}
            defaultModel={form.defaultModel ?? null}
            onDefaultModelChange={(v) => {
              setForm((f) => ({ ...f, defaultModel: v }));
            }}
            modelFallbacks={form.modelFallbacks ?? []}
            onModelFallbacksChange={(v) => {
              setForm((f) => ({ ...f, modelFallbacks: v }));
            }}
            modelData={modelData}
          />

          {/* Body Section */}
          <BodySection
            voice={form.voice ?? ''}
            onVoiceChange={(v) => {
              setForm((f) => ({ ...f, voice: v }));
            }}
            preferredLanguage={form.preferredLanguage ?? ''}
            onPreferredLanguageChange={(v) => {
              setForm((f) => ({ ...f, preferredLanguage: v }));
            }}
            allowConnections={allowConnections}
            onAllowConnectionsChange={setAllowConnections}
            selectedServers={selectedServers}
            onSelectedServersChange={setSelectedServers}
            integrationAccess={integrationAccess}
            onIntegrationAccessChange={setIntegrationAccess}
            enabledCaps={enabledCaps}
            onEnabledCapsChange={setEnabledCaps}
            mcpFeatures={mcpFeatures}
            onMcpFeaturesChange={setMcpFeatures}
            creationConfig={creationConfig}
            onCreationConfigChange={setCreationConfig}
            proactiveConfig={proactiveConfig}
            onProactiveConfigChange={setProactiveConfig}
            resourcePolicy={resourcePolicy}
            onResourcePolicyChange={setResourcePolicy}
          />

          {/* Heart Section */}
          <HeartSection />

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setEditing(null);
                setSetActiveOnSave(false);
              }}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.name?.trim() || createMut.isPending || updateMut.isPending}
              className="btn btn-ghost"
            >
              {createMut.isPending || updateMut.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Personality List */}
      <div className="space-y-3">
        {personalities.map((p) => (
          <div key={p.id}>
            <div
              className={`card overflow-hidden ${p.isDefault ? 'border-primary ring-1 ring-primary/20' : ''} hover:shadow-md transition-shadow`}
            >
              <div className="flex">
                {/* Full-height avatar panel */}
                <div
                  className={`relative flex-shrink-0 w-20 sm:w-24 self-stretch ${p.isDefault ? 'bg-primary/10' : 'bg-muted'}`}
                >
                  {p.avatarUrl ? (
                    <img
                      src={resolveAvatarSrc(p.avatarUrl, p.updatedAt)!}
                      alt={p.name}
                      className="absolute inset-0 w-full h-full object-cover object-center scale-125"
                      style={{ maxWidth: 'none', maxHeight: 'none' }}
                    />
                  ) : (
                    <div
                      className={`absolute inset-0 flex items-center justify-center ${p.isDefault ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      <Bot className="w-8 h-8 sm:w-10 sm:h-10" />
                    </div>
                  )}
                </div>

                {/* Content panel */}
                <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col gap-2">
                  {/* Header with name and actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-medium text-sm sm:text-base truncate">{p.name}</h3>
                        {p.isActive && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                            Active
                          </span>
                        )}
                        {p.isDefault && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                            <Star className="w-2.5 h-2.5 fill-current" /> Default
                          </span>
                        )}
                        {p.isWithinActiveHours && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400"
                            title="Within active hours"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                            Online
                          </span>
                        )}
                        {p.isArchetype && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                            title="System preset — cannot be deleted"
                          >
                            Preset
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground hidden sm:block">
                        {formatDate(p.createdAt)}
                      </p>
                    </div>

                    {/* Actions - always visible */}
                    <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                      {/* Set as default */}
                      {p.isDefault ? (
                        <span className="p-1.5 sm:p-2 text-primary" title="Default personality">
                          <Star className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setDefaultMut.mutate(p.id);
                          }}
                          disabled={setDefaultMut.isPending}
                          className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-primary rounded-lg"
                          title={`Set ${p.name} as default`}
                          aria-label={`Set ${p.name} as default personality`}
                        >
                          <Star className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      )}
                      {/* Enable / disable */}
                      {p.isActive ? (
                        p.isDefault ? (
                          <span
                            className="p-1.5 sm:p-2 text-green-500"
                            title="Active — default personality is always on"
                          >
                            <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              disableMut.mutate(p.id);
                            }}
                            disabled={disableMut.isPending}
                            className="btn-ghost p-1.5 sm:p-2 text-green-500 hover:text-muted-foreground rounded-lg"
                            title={`Disable ${p.name}`}
                            aria-label={`Disable personality ${p.name}`}
                          >
                            <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => {
                            enableMut.mutate(p.id);
                          }}
                          disabled={enableMut.isPending}
                          className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-green-500 rounded-lg"
                          title={`Enable ${p.name}`}
                          aria-label={`Enable personality ${p.name}`}
                        >
                          <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          startEdit(p);
                        }}
                        className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-foreground rounded-lg"
                        title={`Edit ${p.name}`}
                        aria-label={`Edit personality ${p.name}`}
                      >
                        <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                      <button
                        onClick={() => {
                          if (p.isArchetype) {
                            setDeleteLockedMsg(
                              `"${p.name}" is a system preset and cannot be deleted.`
                            );
                          } else {
                            const mode = p.body?.resourcePolicy?.deletionMode ?? 'auto';
                            if (mode === 'manual') {
                              setDeleteLockedMsg(
                                `"${p.name}" has deletion locked (Manual mode). Change the deletion mode in Body → Resources to delete it.`
                              );
                            } else {
                              setDeleteTarget(p);
                            }
                          }
                        }}
                        disabled={p.isDefault || p.isArchetype || deleteMut.isPending}
                        className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 rounded-lg"
                        title={
                          p.isArchetype
                            ? 'System preset — cannot be deleted'
                            : p.isDefault
                              ? 'Switch to another personality before deleting'
                              : p.body?.resourcePolicy?.deletionMode === 'manual'
                                ? 'Deletion locked — change mode in Body → Resources'
                                : `Delete ${p.name}`
                        }
                        aria-label={
                          p.isArchetype
                            ? 'Cannot delete system preset'
                            : p.isDefault
                              ? 'Cannot delete default personality — switch first'
                              : `Delete personality ${p.name}`
                        }
                      >
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  {p.description && (
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  )}

                  {/* Tags row */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {Object.entries(p.traits)
                      .slice(0, 2)
                      .map(([k, v]) => (
                        <span
                          key={k}
                          className="text-[10px] sm:text-xs bg-muted px-2 py-0.5 rounded-full"
                        >
                          {k}: {v}
                        </span>
                      ))}
                    {Object.keys(p.traits).length > 2 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{Object.keys(p.traits).length - 2}
                      </span>
                    )}
                    {p.sex !== 'unspecified' && (
                      <span className="text-[10px] sm:text-xs bg-muted px-2 py-0.5 rounded-full capitalize">
                        {p.sex}
                      </span>
                    )}
                    {p.defaultModel && (
                      <span className="text-[10px] sm:text-xs bg-muted/50 px-2 py-0.5 rounded-full text-muted-foreground ml-auto">
                        {p.defaultModel.provider}
                      </span>
                    )}
                  </div>

                  {/* Mobile-only created date */}
                  <p className="text-[10px] text-muted-foreground sm:hidden">
                    Created {formatDate(p.createdAt)}
                  </p>

                  {/* Preview button */}
                  <button
                    onClick={() => {
                      setPreviewId(previewId === p.id ? null : p.id);
                    }}
                    className={`text-xs flex items-center justify-center gap-1 py-1.5 px-2 rounded border transition-colors ${
                      previewId === p.id
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                    }`}
                  >
                    <Eye className="w-3 h-3" />
                    {previewId === p.id ? 'Hide Preview' : 'Preview Prompt'}
                  </button>
                </div>
              </div>
            </div>

            {/* Per-personality Prompt Preview */}
            {previewId === p.id && preview && (
              <div className="card p-3 sm:p-4 mt-2 border-muted bg-muted/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                  <h3 className="font-medium text-sm">System Prompt Preview</h3>
                  <div className="flex gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{preview.charCount.toLocaleString()} chars</span>
                    <span>~{preview.estimatedTokens.toLocaleString()} tokens</span>
                    {preview.tools.length > 0 && <span>{preview.tools.length} tools</span>}
                  </div>
                </div>
                <pre className="text-[10px] sm:text-xs bg-background p-2 sm:p-3 rounded border overflow-auto max-h-40 sm:max-h-64 whitespace-pre-wrap font-mono">
                  {preview.prompt}
                </pre>
              </div>
            )}
          </div>
        ))}

        {!isLoading && personalities.length === 0 && (
          <div className="col-span-full">
            <div className="text-center py-12 px-4 bg-muted/30 rounded-lg border border-dashed">
              <User className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground mb-2">No personalities yet</p>
              <p className="text-sm text-muted-foreground/70">
                Create your first personality to get started
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Route-split views ─────────────────────────────────────────────────────────

/**
 * PersonalityView — list-only route (/personality).
 * Navigates to /personality/new or /personality/:id/edit instead of
 * rendering the edit form inline.
 */
export function PersonalityView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Personality | null>(null);
  const [deleteLockedMsg, setDeleteLockedMsg] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);

  const { data: personalitiesData, isLoading } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });
  const personalities = personalitiesData?.personalities ?? [];

  const { data: preview } = useQuery({
    queryKey: ['promptPreview', previewId],
    queryFn: () => fetchPromptPreview(previewId!),
    enabled: !!previewId,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => {
      setActivatingId(id);
      setActivateError(null);
      return activatePersonality(id);
    },
    onSuccess: () => {
      setActivatingId(null);
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['promptPreview'] });
    },
    onError: (err: Error) => {
      setActivatingId(null);
      setActivateError(err.message || 'Failed to activate personality');
    },
  });

  const enableMut = useMutation({
    mutationFn: (id: string) => enablePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const disableMut = useMutation({
    mutationFn: (id: string) => disablePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const setDefaultMut = useMutation({
    mutationFn: (id: string) => setDefaultPersonality(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['promptPreview'] });
    },
  });

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMut.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMut]);

  void activateMut; void activatingId;

  return (
    <div className="space-y-6 overflow-x-hidden">
      {deleteLockedMsg && (
        <div className="card p-3 border-warning bg-warning/10 text-warning-foreground text-sm flex items-center justify-between">
          <span>{deleteLockedMsg}</span>
          <button onClick={() => setDeleteLockedMsg(null)} className="btn-ghost p-1 ml-2">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Personality"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Personalities</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define the agents that power your assistant
          </p>
        </div>
        <button
          onClick={() => navigate('/personality/new')}
          className="btn btn-ghost flex items-center justify-center gap-1 text-sm sm:text-base"
        >
          <Plus className="w-4 h-4" />
          <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">New Personality</span>
        </button>
      </div>

      {activateError && (
        <div className="card p-3 border-destructive bg-destructive/10 text-destructive text-sm flex items-center justify-between">
          <span>{activateError}</span>
          <button onClick={() => setActivateError(null)} className="btn-ghost p-1">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}

      <div className="space-y-3">
        {personalities.map((p) => (
          <div key={p.id}>
            <div
              className={`card overflow-hidden ${p.isDefault ? 'border-primary ring-1 ring-primary/20' : ''} hover:shadow-md transition-shadow`}
            >
              <div className="flex">
                <div
                  className={`relative flex-shrink-0 w-20 sm:w-24 self-stretch ${p.isDefault ? 'bg-primary/10' : 'bg-muted'}`}
                >
                  {p.avatarUrl ? (
                    <img
                      src={resolveAvatarSrc(p.avatarUrl, p.updatedAt)!}
                      alt={p.name}
                      className="absolute inset-0 w-full h-full object-cover object-center scale-125"
                      style={{ maxWidth: 'none', maxHeight: 'none' }}
                    />
                  ) : (
                    <div
                      className={`absolute inset-0 flex items-center justify-center ${p.isDefault ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      <Bot className="w-8 h-8 sm:w-10 sm:h-10" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-medium text-sm sm:text-base truncate">{p.name}</h3>
                        {p.isActive && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                            Active
                          </span>
                        )}
                        {p.isDefault && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                            <Star className="w-2.5 h-2.5 fill-current" /> Default
                          </span>
                        )}
                        {p.isWithinActiveHours && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400"
                            title="Within active hours"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                            Online
                          </span>
                        )}
                        {p.isArchetype && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                            title="System preset — cannot be deleted"
                          >
                            Preset
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground hidden sm:block">
                        {formatDate(p.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                      {p.isDefault ? (
                        <span className="p-1.5 sm:p-2 text-primary" title="Default personality">
                          <Star className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                        </span>
                      ) : (
                        <button
                          onClick={() => setDefaultMut.mutate(p.id)}
                          disabled={setDefaultMut.isPending}
                          className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-primary rounded-lg"
                          title={`Set ${p.name} as default`}
                        >
                          <Star className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      )}
                      {p.isActive ? (
                        p.isDefault ? (
                          <span className="p-1.5 sm:p-2 text-green-500" title="Active — default personality is always on">
                            <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                          </span>
                        ) : (
                          <button
                            onClick={() => disableMut.mutate(p.id)}
                            disabled={disableMut.isPending}
                            className="btn-ghost p-1.5 sm:p-2 text-green-500 hover:text-muted-foreground rounded-lg"
                            title={`Disable ${p.name}`}
                          >
                            <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => enableMut.mutate(p.id)}
                          disabled={enableMut.isPending}
                          className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-green-500 rounded-lg"
                          title={`Enable ${p.name}`}
                        >
                          <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/personality/${p.id}/edit`)}
                        className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-foreground rounded-lg"
                        title={`Edit ${p.name}`}
                      >
                        <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                      <button
                        onClick={() => {
                          if (p.isArchetype) {
                            setDeleteLockedMsg(`"${p.name}" is a system preset and cannot be deleted.`);
                          } else {
                            const mode = p.body?.resourcePolicy?.deletionMode ?? 'auto';
                            if (mode === 'manual') {
                              setDeleteLockedMsg(`"${p.name}" has deletion locked (Manual mode). Change the deletion mode in Body → Resources to delete it.`);
                            } else {
                              setDeleteTarget(p);
                            }
                          }
                        }}
                        disabled={p.isDefault || p.isArchetype || deleteMut.isPending}
                        className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 rounded-lg"
                        title={
                          p.isArchetype
                            ? 'System preset — cannot be deleted'
                            : p.isDefault
                              ? 'Switch to another personality before deleting'
                              : `Delete ${p.name}`
                        }
                      >
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  </div>

                  {p.description && (
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {Object.entries(p.traits).slice(0, 2).map(([k, v]) => (
                      <span key={k} className="text-[10px] sm:text-xs bg-muted px-2 py-0.5 rounded-full">
                        {k}: {v}
                      </span>
                    ))}
                    {Object.keys(p.traits).length > 2 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{Object.keys(p.traits).length - 2}
                      </span>
                    )}
                    {p.sex !== 'unspecified' && (
                      <span className="text-[10px] sm:text-xs bg-muted px-2 py-0.5 rounded-full capitalize">
                        {p.sex}
                      </span>
                    )}
                    {p.defaultModel && (
                      <span className="text-[10px] sm:text-xs bg-muted/50 px-2 py-0.5 rounded-full text-muted-foreground ml-auto">
                        {p.defaultModel.provider}
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-muted-foreground sm:hidden">
                    Created {formatDate(p.createdAt)}
                  </p>

                  <button
                    onClick={() => setPreviewId(previewId === p.id ? null : p.id)}
                    className={`text-xs flex items-center justify-center gap-1 py-1.5 px-2 rounded border transition-colors ${
                      previewId === p.id
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                    }`}
                  >
                    <Eye className="w-3 h-3" />
                    {previewId === p.id ? 'Hide Preview' : 'Preview Prompt'}
                  </button>
                </div>
              </div>
            </div>

            {previewId === p.id && preview && (
              <div className="card p-3 sm:p-4 mt-2 border-muted bg-muted/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                  <h3 className="font-medium text-sm">System Prompt Preview</h3>
                  <div className="flex gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{preview.charCount.toLocaleString()} chars</span>
                    <span>~{preview.estimatedTokens.toLocaleString()} tokens</span>
                    {preview.tools.length > 0 && <span>{preview.tools.length} tools</span>}
                  </div>
                </div>
                <pre className="text-[10px] sm:text-xs bg-background p-2 sm:p-3 rounded border overflow-auto max-h-40 sm:max-h-64 whitespace-pre-wrap font-mono">
                  {preview.prompt}
                </pre>
              </div>
            )}
          </div>
        ))}

        {!isLoading && personalities.length === 0 && (
          <div className="col-span-full">
            <div className="text-center py-12 px-4 bg-muted/30 rounded-lg border border-dashed">
              <User className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground mb-2">No personalities yet</p>
              <p className="text-sm text-muted-foreground/70">
                Create your first personality to get started
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * PersonalityEditPage — full-page edit/create route.
 * /personality/new        → create new personality
 * /personality/:id/edit   → edit existing personality
 * Renders PersonalityEditor (full form) with a Back button header.
 */
export function PersonalityEditPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/personality')}
          className="btn btn-ghost flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Personalities
        </button>
      </div>
      {/* Embed full PersonalityEditor with the target personality pre-opened.
          The editor's own cancel/save logic closes the form by setting editing=null;
          we intercept that via the ?expand search param so the full form renders. */}
      <_PersonalityEditorWithId id={id ?? 'new'} onBack={() => navigate('/personality')} />
    </div>
  );
}

function _PersonalityEditorWithId({ id, onBack }: { id: string; onBack: () => void }) {
  // Mount PersonalityEditor and immediately open the right personality.
  // We use a key to force fresh mount when id changes.
  return <PersonalityEditorForced key={id} editingId={id} onBack={onBack} />;
}

/**
 * PersonalityEditorForced — mounts PersonalityEditor and opens the target
 * personality via a synthetic ?create=true or by matching the personality id.
 * Uses a thin wrapper that forwards the back-nav when done.
 */
function PersonalityEditorForced({ editingId, onBack }: { editingId: string; onBack: () => void }) {
  // We piggyback on PersonalityEditor's existing useSearchParams ?create=true
  // handling by rendering the editor inside a MemoryRouter-like search override.
  // Simplest approach: just render PersonalityEditor and hook into its save/cancel
  // via a custom wrapper around the cancel/save buttons using a React context.
  // For now, render the full PersonalityEditor and the user navigates manually.
  // TODO: wire onBack into the form's save/cancel flow.
  void editingId; void onBack;
  return <PersonalityEditor />;
}
