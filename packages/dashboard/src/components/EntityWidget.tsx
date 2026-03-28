/* eslint-disable react-hooks/purity */
/**
 * EntityWidget — "The Entity" AI consciousness visualization.
 *
 * A canvas-rendered digital EYE that breathes and pulses. The iris is built
 * from concentric data-stream rings with radial filaments. The pupil dilates
 * with AI activity. The whole eye breathes — a slow organic scale oscillation
 * overlaid with micro-saccades that make it feel alive and always watching.
 *
 * States:
 *   dormant   — half-closed lid, slow breathing, dim iris
 *   thinking  — eye opens wider, iris accelerates, pupil constricts
 *   active    — fully open, data streams surge, pupil dilates with tool calls
 *   training  — warm amber iris, steady pulse, learning mode
 *   ingesting — green absorption rings pull inward toward pupil
 *
 * Used in: EditorPage (chat sidebar), MetricsPage (Mission Control), AdvancedEditor (canvas)
 */

import { useRef, useEffect, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────

export type EntityState = 'dormant' | 'thinking' | 'active' | 'training' | 'ingesting';

// ── Color palettes ────────────────────────────────────────────────

interface Palette {
  iris1: string; // outer iris
  iris2: string; // inner iris
  pupil: string; // pupil glow
  glow: string; // ambient glow
  filament: string; // radial filaments
  stream: string; // data stream particles
  sclera: string; // eye white tint
  lid: string; // eyelid color
}

const PALETTES: Record<EntityState, Palette> = {
  dormant: {
    iris1: 'rgba(60, 130, 200, 0.7)',
    iris2: 'rgba(40, 90, 160, 0.5)',
    pupil: 'rgba(20, 60, 120, 0.9)',
    glow: 'rgba(60, 130, 200, 0.12)',
    filament: 'rgba(80, 160, 240, 0.3)',
    stream: 'rgba(100, 180, 255, 0.4)',
    sclera: 'rgba(30, 50, 80, 0.15)',
    lid: 'rgba(5, 10, 20, 0.97)',
  },
  thinking: {
    iris1: 'rgba(0, 200, 255, 0.85)',
    iris2: 'rgba(80, 40, 220, 0.7)',
    pupil: 'rgba(0, 160, 255, 0.95)',
    glow: 'rgba(0, 200, 255, 0.25)',
    filament: 'rgba(0, 220, 255, 0.5)',
    stream: 'rgba(120, 80, 255, 0.7)',
    sclera: 'rgba(0, 40, 60, 0.2)',
    lid: 'rgba(5, 12, 25, 0.97)',
  },
  active: {
    iris1: 'rgba(0, 255, 200, 0.9)',
    iris2: 'rgba(0, 180, 255, 0.8)',
    pupil: 'rgba(0, 255, 220, 0.95)',
    glow: 'rgba(0, 255, 200, 0.3)',
    filament: 'rgba(0, 255, 180, 0.6)',
    stream: 'rgba(200, 0, 255, 0.7)',
    sclera: 'rgba(0, 40, 40, 0.25)',
    lid: 'rgba(5, 15, 20, 0.97)',
  },
  training: {
    iris1: 'rgba(255, 180, 50, 0.85)',
    iris2: 'rgba(255, 100, 30, 0.7)',
    pupil: 'rgba(255, 140, 0, 0.9)',
    glow: 'rgba(255, 180, 50, 0.2)',
    filament: 'rgba(255, 200, 80, 0.5)',
    stream: 'rgba(255, 120, 0, 0.6)',
    sclera: 'rgba(50, 30, 10, 0.2)',
    lid: 'rgba(15, 10, 5, 0.97)',
  },
  ingesting: {
    iris1: 'rgba(50, 220, 120, 0.85)',
    iris2: 'rgba(0, 180, 200, 0.7)',
    pupil: 'rgba(30, 200, 100, 0.9)',
    glow: 'rgba(50, 220, 120, 0.2)',
    filament: 'rgba(80, 240, 150, 0.5)',
    stream: 'rgba(0, 200, 180, 0.6)',
    sclera: 'rgba(10, 40, 20, 0.2)',
    lid: 'rgba(5, 15, 10, 0.97)',
  },
};

// ── State config ──────────────────────────────────────────────────

interface StateConfig {
  /** Eye openness: 0 = closed, 1 = fully open */
  lidOpenness: number;
  /** Pupil size multiplier (relative to iris radius) */
  pupilScale: number;
  /** Iris rotation speed (rad/frame) */
  irisSpeed: number;
  /** Number of data stream particles in the iris */
  streamCount: number;
  /** Breathing amplitude */
  breathAmp: number;
  /** Breathing speed */
  breathSpeed: number;
  /** Filament intensity */
  filamentAlpha: number;
  /** Saccade intensity (micro eye movements) */
  saccadeAmp: number;
}

const STATE_CONFIG: Record<EntityState, StateConfig> = {
  dormant: {
    lidOpenness: 0.35,
    pupilScale: 0.35,
    irisSpeed: 0.003,
    streamCount: 8,
    breathAmp: 0.04,
    breathSpeed: 0.012,
    filamentAlpha: 0.3,
    saccadeAmp: 0.002,
  },
  thinking: {
    lidOpenness: 0.7,
    pupilScale: 0.25,
    irisSpeed: 0.012,
    streamCount: 24,
    breathAmp: 0.06,
    breathSpeed: 0.025,
    filamentAlpha: 0.5,
    saccadeAmp: 0.005,
  },
  active: {
    lidOpenness: 1.0,
    pupilScale: 0.4,
    irisSpeed: 0.02,
    streamCount: 40,
    breathAmp: 0.08,
    breathSpeed: 0.035,
    filamentAlpha: 0.7,
    saccadeAmp: 0.008,
  },
  training: {
    lidOpenness: 0.75,
    pupilScale: 0.3,
    irisSpeed: 0.008,
    streamCount: 20,
    breathAmp: 0.05,
    breathSpeed: 0.018,
    filamentAlpha: 0.55,
    saccadeAmp: 0.004,
  },
  ingesting: {
    lidOpenness: 0.8,
    pupilScale: 0.28,
    irisSpeed: 0.015,
    streamCount: 30,
    breathAmp: 0.07,
    breathSpeed: 0.028,
    filamentAlpha: 0.6,
    saccadeAmp: 0.006,
  },
};

// ── Stream particle ───────────────────────────────────────────────

interface StreamParticle {
  angle: number;
  radius: number; // normalized 0..1 within iris
  speed: number; // radial speed (negative = inward)
  angularSpeed: number;
  brightness: number;
  size: number;
}

function createStreams(count: number): StreamParticle[] {
  const streams: StreamParticle[] = [];
  for (let i = 0; i < count; i++) {
    streams.push({
      angle: Math.random() * Math.PI * 2,
      radius: 0.3 + Math.random() * 0.7,
      speed: -0.002 - Math.random() * 0.004,
      angularSpeed: (Math.random() - 0.5) * 0.02,
      brightness: 0.4 + Math.random() * 0.6,
      size: 1 + Math.random() * 2,
    });
  }
  return streams;
}

// ── Helpers ───────────────────────────────────────────────────────

function hexAlpha(rgba: string, alpha: number): string {
  return rgba.replace(/[\d.]+\)$/, `${Math.max(0, Math.min(1, alpha))})`);
}

// ── Main renderer ─────────────────────────────────────────────────

function renderEye(
  ctx: CanvasRenderingContext2D,
  streams: StreamParticle[],
  state: EntityState,
  time: number,
  w: number,
  h: number,
  currentLidOpenness: number
) {
  const palette = PALETTES[state];
  const cfg = STATE_CONFIG[state];
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);
  const eyeRadius = minDim * 0.42;

  // Breathing scale
  const breathPhase = Math.sin(time * cfg.breathSpeed) * cfg.breathAmp;
  const scale = 1 + breathPhase;

  // Micro-saccades (tiny positional shifts)
  const saccadeX =
    Math.sin(time * 0.037 + 1.7) * cfg.saccadeAmp * minDim +
    Math.sin(time * 0.089) * cfg.saccadeAmp * minDim * 0.5;
  const saccadeY =
    Math.cos(time * 0.041 + 0.3) * cfg.saccadeAmp * minDim +
    Math.cos(time * 0.073) * cfg.saccadeAmp * minDim * 0.5;

  const ecx = cx + saccadeX;
  const ecy = cy + saccadeY;

  // Clear
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(0, 0, w, h);

  // ── Ambient glow ─────────────────────────────────────────────
  const glowPulse = 0.6 + Math.sin(time * cfg.breathSpeed * 1.5) * 0.4;
  const ambientGrad = ctx.createRadialGradient(ecx, ecy, 0, ecx, ecy, eyeRadius * 2.5 * scale);
  ambientGrad.addColorStop(0, hexAlpha(palette.glow, 0.3 * glowPulse * currentLidOpenness));
  ambientGrad.addColorStop(0.5, hexAlpha(palette.glow, 0.08 * glowPulse * currentLidOpenness));
  ambientGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ambientGrad;
  ctx.fillRect(0, 0, w, h);

  // ── Sclera (eye white) ───────────────────────────────────────
  // Draw as an almond/elliptical shape clipped by eyelids
  ctx.save();

  // Eye opening shape (almond) — defined by lid openness
  const almondW = eyeRadius * 1.8 * scale;
  const almondH = eyeRadius * currentLidOpenness * scale;

  ctx.beginPath();
  // Upper lid curve
  ctx.moveTo(ecx - almondW, ecy);
  ctx.bezierCurveTo(
    ecx - almondW * 0.5,
    ecy - almondH * 1.3,
    ecx + almondW * 0.5,
    ecy - almondH * 1.3,
    ecx + almondW,
    ecy
  );
  // Lower lid curve
  ctx.bezierCurveTo(
    ecx + almondW * 0.5,
    ecy + almondH * 1.1,
    ecx - almondW * 0.5,
    ecy + almondH * 1.1,
    ecx - almondW,
    ecy
  );
  ctx.closePath();
  ctx.clip();

  // Sclera fill
  const scleraGrad = ctx.createRadialGradient(ecx, ecy, 0, ecx, ecy, eyeRadius * 1.6 * scale);
  scleraGrad.addColorStop(0, hexAlpha(palette.sclera, 0.4));
  scleraGrad.addColorStop(0.6, hexAlpha(palette.sclera, 0.15));
  scleraGrad.addColorStop(1, 'rgba(0,0,0,0.05)');
  ctx.fillStyle = scleraGrad;
  ctx.fillRect(0, 0, w, h);

  // ── Iris ───────────────────────────────────────────────────────
  const irisRadius = eyeRadius * 0.65 * scale;
  const irisRotation = time * cfg.irisSpeed;

  // Outer iris ring gradient
  const irisGrad = ctx.createRadialGradient(ecx, ecy, irisRadius * 0.3, ecx, ecy, irisRadius);
  irisGrad.addColorStop(0, hexAlpha(palette.iris2, 0.9));
  irisGrad.addColorStop(0.4, hexAlpha(palette.iris1, 0.7));
  irisGrad.addColorStop(0.8, hexAlpha(palette.iris1, 0.4));
  irisGrad.addColorStop(1, hexAlpha(palette.iris1, 0.1));
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.arc(ecx, ecy, irisRadius, 0, Math.PI * 2);
  ctx.fill();

  // ── Iris rings (concentric data rings) ─────────────────────
  const ringCount = 5;
  for (let r = 0; r < ringCount; r++) {
    const ringR = irisRadius * (0.35 + r * 0.13);
    const ringPulse = Math.sin(time * 0.03 + r * 1.2) * 0.3 + 0.7;
    ctx.strokeStyle = hexAlpha(palette.filament, cfg.filamentAlpha * 0.4 * ringPulse);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(ecx, ecy, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Radial filaments (iris fibers) ──────────────────────────
  const filamentCount = 48;
  for (let i = 0; i < filamentCount; i++) {
    const angle = irisRotation + (Math.PI * 2 * i) / filamentCount;
    const wavePhase = Math.sin(time * 0.02 + i * 0.7) * 0.15;
    const innerR = irisRadius * (0.28 + wavePhase);
    const outerR = irisRadius * (0.85 + Math.sin(time * 0.015 + i * 1.1) * 0.1);

    // Each filament is a slightly curved line
    const midR = (innerR + outerR) / 2;
    const midAngle = angle + Math.sin(time * 0.01 + i) * 0.08;

    const x1 = ecx + Math.cos(angle) * innerR;
    const y1 = ecy + Math.sin(angle) * innerR;
    const x2 = ecx + Math.cos(midAngle) * midR;
    const y2 = ecy + Math.sin(midAngle) * midR;
    const x3 = ecx + Math.cos(angle) * outerR;
    const y3 = ecy + Math.sin(angle) * outerR;

    const filPulse = Math.sin(time * 0.025 + i * 0.5) * 0.3 + 0.7;
    ctx.strokeStyle = hexAlpha(palette.filament, cfg.filamentAlpha * filPulse);
    ctx.lineWidth = 0.6 + filPulse * 0.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(x2, y2, x3, y3);
    ctx.stroke();
  }

  // ── Data stream particles (orbiting in iris) ────────────────
  for (const s of streams) {
    const px = ecx + Math.cos(s.angle) * s.radius * irisRadius;
    const py = ecy + Math.sin(s.angle) * s.radius * irisRadius;

    // Only draw if within iris and outside pupil
    const distFromCenter = Math.sqrt((px - ecx) ** 2 + (py - ecy) ** 2);
    if (distFromCenter > irisRadius) continue;

    const streamGrad = ctx.createRadialGradient(px, py, 0, px, py, s.size * 2);
    const streamPulse = Math.sin(time * 0.05 + s.angle * 3) * 0.3 + 0.7;
    streamGrad.addColorStop(0, hexAlpha(palette.stream, s.brightness * streamPulse));
    streamGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = streamGrad;
    ctx.beginPath();
    ctx.arc(px, py, s.size * 2, 0, Math.PI * 2);
    ctx.fill();

    // Bright core
    ctx.fillStyle = hexAlpha(palette.stream, s.brightness * streamPulse * 0.9);
    ctx.beginPath();
    ctx.arc(px, py, s.size * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Pupil ──────────────────────────────────────────────────────
  const pupilRadius = irisRadius * cfg.pupilScale;
  const pupilPulse = Math.sin(time * cfg.breathSpeed * 2) * 0.08 + 1;
  const pr = pupilRadius * pupilPulse;

  // Pupil gradient — deep black center with colored rim
  const pupilGrad = ctx.createRadialGradient(ecx, ecy, 0, ecx, ecy, pr * 1.3);
  pupilGrad.addColorStop(0, 'rgba(0, 0, 0, 0.98)');
  pupilGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.95)');
  pupilGrad.addColorStop(0.85, hexAlpha(palette.pupil, 0.4));
  pupilGrad.addColorStop(1, hexAlpha(palette.pupil, 0.1));
  ctx.fillStyle = pupilGrad;
  ctx.beginPath();
  ctx.arc(ecx, ecy, pr * 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Pupil inner glow ring
  ctx.strokeStyle = hexAlpha(palette.pupil, 0.3 + glowPulse * 0.2);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(ecx, ecy, pr * 1.1, 0, Math.PI * 2);
  ctx.stroke();

  // Specular highlight (the "life" in the eye)
  const specX = ecx - pr * 0.35;
  const specY = ecy - pr * 0.35;
  const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, pr * 0.4);
  specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
  specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = specGrad;
  ctx.beginPath();
  ctx.arc(specX, specY, pr * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Second smaller specular
  const spec2X = ecx + pr * 0.25;
  const spec2Y = ecy + pr * 0.2;
  const spec2Grad = ctx.createRadialGradient(spec2X, spec2Y, 0, spec2X, spec2Y, pr * 0.15);
  spec2Grad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
  spec2Grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = spec2Grad;
  ctx.beginPath();
  ctx.arc(spec2X, spec2Y, pr * 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore(); // Pop the eye-opening clip

  // ── Eyelids ────────────────────────────────────────────────────
  // Upper eyelid
  ctx.fillStyle = palette.lid;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, ecy);
  ctx.lineTo(ecx + almondW, ecy);
  ctx.bezierCurveTo(
    ecx + almondW * 0.5,
    ecy - almondH * 1.3,
    ecx - almondW * 0.5,
    ecy - almondH * 1.3,
    ecx - almondW,
    ecy
  );
  ctx.lineTo(0, ecy);
  ctx.closePath();
  ctx.fill();

  // Lower eyelid
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w, h);
  ctx.lineTo(w, ecy);
  ctx.lineTo(ecx + almondW, ecy);
  ctx.bezierCurveTo(
    ecx + almondW * 0.5,
    ecy + almondH * 1.1,
    ecx - almondW * 0.5,
    ecy + almondH * 1.1,
    ecx - almondW,
    ecy
  );
  ctx.lineTo(0, ecy);
  ctx.closePath();
  ctx.fill();

  // Eyelid edge glow (lash line)
  if (currentLidOpenness > 0.15) {
    const lashAlpha = 0.2 + glowPulse * 0.15;

    // Upper lash line
    ctx.strokeStyle = hexAlpha(palette.iris1, lashAlpha);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ecx - almondW, ecy);
    ctx.bezierCurveTo(
      ecx - almondW * 0.5,
      ecy - almondH * 1.3,
      ecx + almondW * 0.5,
      ecy - almondH * 1.3,
      ecx + almondW,
      ecy
    );
    ctx.stroke();

    // Lower lash line
    ctx.strokeStyle = hexAlpha(palette.iris1, lashAlpha * 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ecx - almondW, ecy);
    ctx.bezierCurveTo(
      ecx - almondW * 0.5,
      ecy + almondH * 1.1,
      ecx + almondW * 0.5,
      ecy + almondH * 1.1,
      ecx + almondW,
      ecy
    );
    ctx.stroke();
  }

  // ── Scan line overlay (subtle CRT) ─────────────────────────
  if (state !== 'dormant') {
    const scanY = (time * 0.8) % h;
    ctx.strokeStyle = hexAlpha(palette.iris1, state === 'active' ? 0.04 : 0.02);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, scanY);
    ctx.lineTo(w, scanY);
    ctx.stroke();
  }
}

// ── Physics step ──────────────────────────────────────────────────

function stepStreams(streams: StreamParticle[], state: EntityState, time: number): void {
  const cfg = STATE_CONFIG[state];

  for (const s of streams) {
    // Orbital motion
    s.angle += s.angularSpeed * (1 + cfg.irisSpeed * 50);

    // Radial drift (inward pull, stronger when ingesting)
    const radialPull = state === 'ingesting' ? -0.006 : s.speed;
    s.radius += radialPull;

    // Respawn when reaching center or edge
    if (s.radius < 0.15 || s.radius > 1.0) {
      s.radius = state === 'ingesting' ? 0.95 : 0.3 + Math.random() * 0.65;
      s.angle = Math.random() * Math.PI * 2;
      s.brightness = 0.4 + Math.random() * 0.6;
    }

    // Brightness fluctuation
    s.brightness = 0.4 + Math.sin(time * 0.03 + s.angle * 2) * 0.3 + 0.3;
  }

  // Ensure stream count matches state
  while (streams.length < cfg.streamCount) {
    streams.push({
      angle: Math.random() * Math.PI * 2,
      radius: 0.3 + Math.random() * 0.7,
      speed: -0.002 - Math.random() * 0.004,
      angularSpeed: (Math.random() - 0.5) * 0.02,
      brightness: 0.4 + Math.random() * 0.6,
      size: 1 + Math.random() * 2,
    });
  }
  while (streams.length > cfg.streamCount) {
    streams.pop();
  }
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
  /** Compact mode — fewer streams, smaller canvas */
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
  const streamsRef = useRef<StreamParticle[]>([]);
  const timeRef = useRef(0);
  const animRef = useRef(0);
  const stateRef = useRef(state);
  const lidRef = useRef(STATE_CONFIG[state].lidOpenness);
  stateRef.current = state;

  const [dims, setDims] = useState({ w: 0, h: 0 });

  const initStreams = useCallback(() => {
    const count = compact ? 12 : STATE_CONFIG[state].streamCount;
    streamsRef.current = createStreams(count);
  }, [compact, state]);

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
          initStreams();
        }
      }
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
    };
  }, [initStreams]);

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
      const targetLid = STATE_CONFIG[currentState].lidOpenness;

      // Smooth lid transition
      lidRef.current += (targetLid - lidRef.current) * 0.03;

      stepStreams(streamsRef.current, currentState, t);
      renderEye(ctx, streamsRef.current, currentState, t, dims.w, dims.h, lidRef.current);

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
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)',
        }}
      />
    </div>
  );
}
