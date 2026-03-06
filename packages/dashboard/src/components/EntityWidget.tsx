/**
 * EntityWidget — "The Entity" AI consciousness visualization.
 *
 * Inspired by the rogue AI visualization in Mission Impossible: Dead Reckoning.
 * A canvas-rendered neural network of particles and connections that pulses
 * and intensifies when the AI is actively thinking/processing.
 *
 * States:
 *   dormant   — slow drift, dim connections, occasional pulse
 *   thinking  — particles accelerate, connections multiply, core pulses
 *   active    — full intensity, data streams flow through network
 *   training  — warm orange/amber network, steady pulsing, learning mode
 *   ingesting — green data-absorption streams, particles pull inward
 *
 * Used in: EditorPage (chat sidebar), AdvancedEditorPage (canvas widget)
 */

import { useRef, useEffect, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────

export type EntityState = 'dormant' | 'thinking' | 'active' | 'training' | 'ingesting';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  /** 0–1 brightness pulsation phase */
  phase: number;
  phaseSpeed: number;
  /** Connection willingness — higher = more connections drawn */
  connectionAffinity: number;
  /** Ring index for layered orbit (0=core, 1=inner, 2=mid, 3=outer) */
  ring: number;
  /** Orbital angle for structured motion */
  angle: number;
  angleSpeed: number;
  /** Data pulse traveling along this particle's connections */
  dataPulse: number;
}

interface DataStream {
  fromIdx: number;
  toIdx: number;
  progress: number;
  speed: number;
  color: string;
}

// ── Color palettes ────────────────────────────────────────────────

const PALETTES: Record<
  EntityState,
  { primary: string; secondary: string; glow: string; core: string; stream: string }
> = {
  dormant: {
    primary: 'rgba(100, 160, 220, 0.6)',
    secondary: 'rgba(80, 120, 180, 0.3)',
    glow: 'rgba(100, 160, 220, 0.15)',
    core: 'rgba(120, 180, 240, 0.4)',
    stream: 'rgba(100, 180, 255, 0.5)',
  },
  thinking: {
    primary: 'rgba(0, 200, 255, 0.85)',
    secondary: 'rgba(120, 80, 255, 0.5)',
    glow: 'rgba(0, 200, 255, 0.3)',
    core: 'rgba(0, 220, 255, 0.7)',
    stream: 'rgba(0, 220, 255, 0.8)',
  },
  active: {
    primary: 'rgba(0, 255, 200, 0.9)',
    secondary: 'rgba(200, 0, 255, 0.6)',
    glow: 'rgba(0, 255, 200, 0.35)',
    core: 'rgba(0, 255, 220, 0.85)',
    stream: 'rgba(0, 255, 200, 0.9)',
  },
  training: {
    primary: 'rgba(255, 180, 50, 0.85)',
    secondary: 'rgba(255, 100, 30, 0.5)',
    glow: 'rgba(255, 180, 50, 0.25)',
    core: 'rgba(255, 200, 80, 0.7)',
    stream: 'rgba(255, 160, 0, 0.8)',
  },
  ingesting: {
    primary: 'rgba(50, 220, 120, 0.85)',
    secondary: 'rgba(0, 180, 255, 0.5)',
    glow: 'rgba(50, 220, 120, 0.25)',
    core: 'rgba(80, 240, 140, 0.7)',
    stream: 'rgba(50, 220, 120, 0.8)',
  },
};

// ── Helpers ────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function hexAlpha(rgba: string, alpha: number): string {
  return rgba.replace(/[\d.]+\)$/, `${alpha})`);
}

// ── Particle factory ──────────────────────────────────────────────

function createParticles(count: number, w: number, h: number): Particle[] {
  const cx = w / 2;
  const cy = h / 2;
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const ring = i < 3 ? 0 : i < 10 ? 1 : i < 22 ? 2 : 3;
    const ringRadius =
      ring === 0
        ? 0
        : ring === 1
          ? Math.min(w, h) * 0.12
          : ring === 2
            ? Math.min(w, h) * 0.25
            : Math.min(w, h) * 0.38;
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const r = ringRadius + (Math.random() - 0.5) * ringRadius * 0.4;

    particles.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: ring === 0 ? 3 : ring === 1 ? 2.5 : ring === 2 ? 2 : 1.5,
      baseRadius: ring === 0 ? 3 : ring === 1 ? 2.5 : ring === 2 ? 2 : 1.5,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.02 + Math.random() * 0.03,
      connectionAffinity: ring <= 1 ? 0.8 : ring === 2 ? 0.5 : 0.3,
      ring,
      angle,
      angleSpeed: (0.003 + Math.random() * 0.005) * (Math.random() > 0.5 ? 1 : -1),
      dataPulse: 0,
    });
  }
  return particles;
}

// ── Speed / intensity multipliers per state ───────────────────────

const STATE_CONFIG: Record<
  EntityState,
  {
    speedMul: number;
    connectionDist: number;
    connectionAlpha: number;
    coreSize: number;
    corePulseSpeed: number;
    particleGlow: number;
    streamCount: number;
    streamSpeed: number;
  }
> = {
  dormant: {
    speedMul: 0.3,
    connectionDist: 80,
    connectionAlpha: 0.12,
    coreSize: 8,
    corePulseSpeed: 0.015,
    particleGlow: 4,
    streamCount: 1,
    streamSpeed: 0.008,
  },
  thinking: {
    speedMul: 1.0,
    connectionDist: 120,
    connectionAlpha: 0.3,
    coreSize: 14,
    corePulseSpeed: 0.04,
    particleGlow: 8,
    streamCount: 4,
    streamSpeed: 0.02,
  },
  active: {
    speedMul: 1.6,
    connectionDist: 150,
    connectionAlpha: 0.45,
    coreSize: 18,
    corePulseSpeed: 0.06,
    particleGlow: 12,
    streamCount: 8,
    streamSpeed: 0.035,
  },
  training: {
    speedMul: 0.8,
    connectionDist: 110,
    connectionAlpha: 0.35,
    coreSize: 16,
    corePulseSpeed: 0.025,
    particleGlow: 9,
    streamCount: 5,
    streamSpeed: 0.015,
  },
  ingesting: {
    speedMul: 1.2,
    connectionDist: 130,
    connectionAlpha: 0.4,
    coreSize: 12,
    corePulseSpeed: 0.035,
    particleGlow: 7,
    streamCount: 6,
    streamSpeed: 0.025,
  },
};

// ── Main renderer ─────────────────────────────────────────────────

function renderFrame(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  streams: DataStream[],
  state: EntityState,
  time: number,
  w: number,
  h: number
) {
  const palette = PALETTES[state];
  const cfg = STATE_CONFIG[state];
  const cx = w / 2;
  const cy = h / 2;

  // Clear with subtle trail effect
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.fillRect(0, 0, w, h);

  // ── Core glow ────────────────────────────────────────────────
  const corePulse = Math.sin(time * cfg.corePulseSpeed) * 0.5 + 0.5;
  const coreRadius = cfg.coreSize + corePulse * cfg.coreSize * 0.5;

  // Outer glow rings
  for (let r = 3; r >= 1; r--) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * r * 2.5);
    grad.addColorStop(0, hexAlpha(palette.core, 0.05 * r * corePulse));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Core
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
  coreGrad.addColorStop(0, hexAlpha(palette.core, 0.9 * (0.5 + corePulse * 0.5)));
  coreGrad.addColorStop(0.6, hexAlpha(palette.core, 0.3 * (0.5 + corePulse * 0.5)));
  coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
  ctx.fill();

  // ── Connections ──────────────────────────────────────────────
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j];
      const d = dist(a.x, a.y, b.x, b.y);
      const maxDist = cfg.connectionDist * (a.connectionAffinity + b.connectionAffinity);
      if (d < maxDist) {
        const alpha = (1 - d / maxDist) * cfg.connectionAlpha;
        // Pulse connections near active data streams
        const streamBoost = streams.some(
          (s) => (s.fromIdx === i && s.toIdx === j) || (s.fromIdx === j && s.toIdx === i)
        )
          ? 0.4
          : 0;

        ctx.strokeStyle = hexAlpha(palette.secondary, Math.min(alpha + streamBoost, 0.8));
        ctx.lineWidth = alpha > 0.15 ? 1.2 : 0.6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  // ── Data streams ─────────────────────────────────────────────
  for (const stream of streams) {
    const from = particles[stream.fromIdx];
    const to = particles[stream.toIdx];
    if (!from || !to) continue;

    const px = lerp(from.x, to.x, stream.progress);
    const py = lerp(from.y, to.y, stream.progress);

    const streamGrad = ctx.createRadialGradient(px, py, 0, px, py, 4);
    streamGrad.addColorStop(0, stream.color);
    streamGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = streamGrad;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Particles ────────────────────────────────────────────────
  for (const p of particles) {
    const brightness = Math.sin(p.phase) * 0.3 + 0.7;
    const r = p.radius * (0.8 + brightness * 0.4);

    // Glow
    if (cfg.particleGlow > 2) {
      const glowGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, cfg.particleGlow);
      glowGrad.addColorStop(0, hexAlpha(palette.glow, brightness * 0.6));
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, cfg.particleGlow, 0, Math.PI * 2);
      ctx.fill();
    }

    // Particle dot
    ctx.fillStyle = hexAlpha(palette.primary, brightness);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Scan line overlay (subtle CRT feel) ──────────────────────
  if (state !== 'dormant') {
    const scanY = (time * 0.5) % h;
    ctx.strokeStyle = `rgba(0, 255, 255, ${state === 'active' ? 0.04 : 0.02})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, scanY);
    ctx.lineTo(w, scanY);
    ctx.stroke();
  }
}

// ── Physics step ──────────────────────────────────────────────────

function stepPhysics(
  particles: Particle[],
  streams: DataStream[],
  state: EntityState,
  time: number,
  w: number,
  h: number
): DataStream[] {
  const cfg = STATE_CONFIG[state];
  const cx = w / 2;
  const cy = h / 2;

  for (const p of particles) {
    // Orbital motion
    const ringRadius =
      p.ring === 0
        ? 5
        : p.ring === 1
          ? Math.min(w, h) * 0.12
          : p.ring === 2
            ? Math.min(w, h) * 0.25
            : Math.min(w, h) * 0.38;
    p.angle += p.angleSpeed * cfg.speedMul;

    const targetX = cx + Math.cos(p.angle) * ringRadius;
    const targetY = cy + Math.sin(p.angle) * ringRadius;

    // Soft attraction to orbit (ingesting pulls particles inward)
    const attractStrength = state === 'ingesting' ? 0.012 : 0.005;
    const ingestPull = state === 'ingesting' ? 0.003 : 0;
    p.vx += (targetX - p.x) * attractStrength * cfg.speedMul - (p.x - cx) * ingestPull;
    p.vy += (targetY - p.y) * attractStrength * cfg.speedMul - (p.y - cy) * ingestPull;

    // Damping
    p.vx *= 0.96;
    p.vy *= 0.96;

    // Apply velocity
    p.x += p.vx;
    p.y += p.vy;

    // Boundary soft-bounce
    const margin = 10;
    if (p.x < margin) p.vx += 0.5;
    if (p.x > w - margin) p.vx -= 0.5;
    if (p.y < margin) p.vy += 0.5;
    if (p.y > h - margin) p.vy -= 0.5;

    // Phase animation
    p.phase += p.phaseSpeed * cfg.speedMul * 1.5;

    // Radius pulse in active states
    p.radius = p.baseRadius * (state === 'dormant' ? 1 : 1 + Math.sin(time * 0.05 + p.phase) * 0.3);
  }

  // Advance existing streams
  const kept: DataStream[] = [];
  for (const s of streams) {
    s.progress += s.speed;
    if (s.progress < 1) kept.push(s);
  }

  // Spawn new streams
  while (kept.length < cfg.streamCount) {
    const fromIdx = Math.floor(Math.random() * particles.length);
    let toIdx = Math.floor(Math.random() * particles.length);
    if (toIdx === fromIdx) toIdx = (toIdx + 1) % particles.length;
    const palette = PALETTES[state];
    kept.push({
      fromIdx,
      toIdx,
      progress: 0,
      speed: cfg.streamSpeed * (0.5 + Math.random()),
      color: Math.random() > 0.5 ? palette.stream : palette.primary,
    });
  }

  return kept;
}

// ── React Component ───────────────────────────────────────────────

export interface EntityWidgetProps {
  /** AI processing state */
  state?: EntityState;
  /** CSS class for the container */
  className?: string;
  /** Width. Defaults to '100%'. */
  width?: number | string;
  /** Height. Defaults to 200. */
  height?: number;
  /** Show label overlay */
  showLabel?: boolean;
  /** Label text override */
  label?: string;
  /** Compact mode — fewer particles, smaller canvas */
  compact?: boolean;
}

const STATE_LABELS: Record<EntityState, string> = {
  dormant: 'STANDBY',
  thinking: 'PROCESSING',
  active: 'ACTIVE',
  training: 'TRAINING',
  ingesting: 'INGESTING',
};

const STATE_LABEL_CLS: Record<EntityState, string> = {
  dormant: 'text-blue-400/60',
  thinking: 'text-cyan-400 animate-pulse',
  active: 'text-emerald-400',
  training: 'text-amber-400 animate-pulse',
  ingesting: 'text-green-400 animate-pulse',
};

export function EntityWidget({
  state = 'dormant',
  className = '',
  width = '100%',
  height = 200,
  showLabel = true,
  label,
  compact = false,
}: EntityWidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const streamsRef = useRef<DataStream[]>([]);
  const timeRef = useRef(0);
  const animRef = useRef<number>(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Track canvas dimensions for responsive resize
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const initParticles = useCallback(
    (w: number, h: number) => {
      const count = compact ? 20 : 35;
      particlesRef.current = createParticles(count, w, h);
      streamsRef.current = [];
    },
    [compact]
  );

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          const dpr = window.devicePixelRatio || 1;
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.scale(dpr, dpr);
          setDims({ w, h });
          initParticles(w, h);
        }
      }
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
    };
  }, [initParticles]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dims.w === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const loop = () => {
      if (!running) return;

      timeRef.current++;
      const t = timeRef.current;
      const currentState = stateRef.current;

      streamsRef.current = stepPhysics(
        particlesRef.current,
        streamsRef.current,
        currentState,
        t,
        dims.w,
        dims.h
      );

      renderFrame(ctx, particlesRef.current, streamsRef.current, currentState, t, dims.w, dims.h);

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [dims]);

  const displayLabel = label ?? STATE_LABELS[state];

  return (
    <div
      className={`relative overflow-hidden rounded bg-black ${className}`}
      style={{ width, height }}
      data-testid="entity-widget"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
        data-testid="entity-canvas"
      />

      {/* Label overlay */}
      {showLabel && (
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-1.5 pointer-events-none">
          <div className="flex items-center gap-2">
            {/* Status dot */}
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                state === 'dormant'
                  ? 'bg-blue-400/60'
                  : state === 'thinking'
                    ? 'bg-cyan-400 animate-pulse'
                    : state === 'training'
                      ? 'bg-amber-400 animate-pulse'
                      : state === 'ingesting'
                        ? 'bg-green-400 animate-pulse'
                        : 'bg-emerald-400'
              }`}
            />
            <span
              className={`text-[10px] font-mono font-bold tracking-[0.2em] uppercase ${STATE_LABEL_CLS[state]}`}
              data-testid="entity-label"
            >
              {displayLabel}
            </span>
          </div>

          {/* Activity indicator */}
          {state !== 'dormant' && (
            <div className="flex items-center gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-0.5 rounded-full ${
                    state === 'active'
                      ? 'bg-emerald-400'
                      : state === 'training'
                        ? 'bg-amber-400'
                        : state === 'ingesting'
                          ? 'bg-green-400'
                          : 'bg-cyan-400'
                  }`}
                  style={{
                    height: `${6 + Math.sin(Date.now() / 200 + i * 1.2) * 4}px`,
                    opacity: 0.6 + Math.sin(Date.now() / 300 + i) * 0.4,
                    transition: 'height 0.15s',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
        }}
      />
    </div>
  );
}
