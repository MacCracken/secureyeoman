/**
 * Excalidraw Diagramming Types (Phase 117)
 *
 * Zod schemas for Excalidraw scene construction, validation, and patching.
 */

import { z } from 'zod';

// ─── Element Spec (simplified input) ────────────────────────────────────────

export const ExcalidrawElementSpecSchema = z.object({
  /** Optional ID; auto-generated if omitted. */
  id: z.string().optional(),
  /** Element type. */
  type: z.enum(['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'text', 'freedraw', 'image']),
  /** Text label — for shapes, auto-creates a bound text element. */
  label: z.string().optional(),
  /** X coordinate. */
  x: z.number(),
  /** Y coordinate. */
  y: z.number(),
  /** Width (default varies by type). */
  width: z.number().optional(),
  /** Height (default varies by type). */
  height: z.number().optional(),
  /** Stroke color (CSS hex). */
  strokeColor: z.string().optional(),
  /** Background color (CSS hex). */
  backgroundColor: z.string().optional(),
  /** Fill style. */
  fillStyle: z.enum(['hachure', 'cross-hatch', 'solid']).optional(),
  /** Stroke width. */
  strokeWidth: z.number().optional(),
  /** Roughness (0 = sharp, 1 = normal, 2 = rough). */
  roughness: z.number().int().min(0).max(2).optional(),
  /** Corner roundness type. */
  roundness: z
    .object({ type: z.number().int(), value: z.number().optional() })
    .nullable()
    .optional(),
  /** Font family (1 = hand-drawn, 2 = normal, 3 = code). */
  fontFamily: z.number().int().min(1).max(3).optional(),
  /** Font size in px. */
  fontSize: z.number().positive().optional(),
  /** Text alignment. */
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  /** Group ID for grouping elements. */
  groupId: z.string().optional(),
  /** Container element ID (for bound text). */
  containerId: z.string().optional(),
  /** Arrow start binding element ID. */
  startId: z.string().optional(),
  /** Arrow end binding element ID. */
  endId: z.string().optional(),
  /** Points for line/arrow elements (relative to x,y). */
  points: z.array(z.tuple([z.number(), z.number()])).optional(),
});

export type ExcalidrawElementSpec = z.infer<typeof ExcalidrawElementSpecSchema>;

// ─── Full Excalidraw Element (output) ───────────────────────────────────────

export const ExcalidrawElementSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  angle: z.number(),
  strokeColor: z.string(),
  backgroundColor: z.string(),
  fillStyle: z.string(),
  strokeWidth: z.number(),
  strokeStyle: z.string(),
  roughness: z.number(),
  opacity: z.number(),
  groupIds: z.array(z.string()),
  frameId: z.string().nullable(),
  index: z.string().nullable().optional(),
  roundness: z.object({ type: z.number().int(), value: z.number().optional() }).nullable(),
  seed: z.number().int(),
  version: z.number().int(),
  versionNonce: z.number().int(),
  isDeleted: z.boolean(),
  boundElements: z.array(z.object({ type: z.string(), id: z.string() })).nullable(),
  updated: z.number(),
  link: z.string().nullable(),
  locked: z.boolean(),
  // Text-specific fields
  text: z.string().optional(),
  fontSize: z.number().optional(),
  fontFamily: z.number().optional(),
  textAlign: z.string().optional(),
  verticalAlign: z.string().optional(),
  containerId: z.string().nullable().optional(),
  originalText: z.string().optional(),
  autoResize: z.boolean().optional(),
  lineHeight: z.number().optional(),
  // Arrow-specific fields
  points: z.array(z.tuple([z.number(), z.number()])).optional(),
  startBinding: z
    .object({
      elementId: z.string(),
      focus: z.number(),
      gap: z.number(),
      fixedPoint: z.tuple([z.number(), z.number()]).nullable().optional(),
    })
    .nullable()
    .optional(),
  endBinding: z
    .object({
      elementId: z.string(),
      focus: z.number(),
      gap: z.number(),
      fixedPoint: z.tuple([z.number(), z.number()]).nullable().optional(),
    })
    .nullable()
    .optional(),
  startArrowhead: z.string().nullable().optional(),
  endArrowhead: z.string().nullable().optional(),
  elbowed: z.boolean().optional(),
});

export type ExcalidrawElement = z.infer<typeof ExcalidrawElementSchema>;

// ─── Scene ──────────────────────────────────────────────────────────────────

export const ExcalidrawSceneSchema = z.object({
  type: z.literal('excalidraw'),
  version: z.literal(2),
  source: z.string().optional(),
  elements: z.array(ExcalidrawElementSchema),
  appState: z.object({
    gridSize: z.number().nullable().optional(),
    viewBackgroundColor: z.string(),
    theme: z.enum(['light', 'dark']).optional(),
  }),
  files: z.record(z.unknown()),
});

export type ExcalidrawScene = z.infer<typeof ExcalidrawSceneSchema>;

// ─── Patch Operations ───────────────────────────────────────────────────────

export const PatchOperationSchema = z.object({
  /** Operation type. */
  op: z.enum(['add', 'update', 'delete', 'move', 'restyle']),
  /** Target element ID (required for update/delete/move/restyle). */
  elementId: z.string().optional(),
  /** Element spec to add (required for 'add'). */
  element: ExcalidrawElementSpecSchema.optional(),
  /** Properties to update/move/restyle. For move: { dx, dy }. */
  properties: z.record(z.unknown()).optional(),
});

export type PatchOperation = z.infer<typeof PatchOperationSchema>;

// ─── Validation ─────────────────────────────────────────────────────────────

export const ValidationIssueSchema = z.object({
  /** Issue category. */
  type: z.enum([
    'overlap',
    'orphaned-binding',
    'text-overflow',
    'unbalanced-layout',
    'missing-label',
    'low-contrast',
  ]),
  /** Severity level. */
  severity: z.enum(['error', 'warning', 'info']),
  /** Human-readable description. */
  message: z.string(),
  /** Element IDs involved. */
  elementIds: z.array(z.string()).optional(),
});

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
