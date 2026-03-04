/**
 * Excalidraw MCP Tools (Phase 117)
 *
 * Four local-computation tools for Excalidraw diagram generation,
 * validation, modification, and template listing.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';
import { buildScene, validateScene, patchScene } from './excalidraw-scene.js';
import {
  getTemplateCategories,
  getTemplatesByCategory,
  getAllPalettes,
} from './excalidraw-templates.js';

const ElementSpecInputSchema = z.object({
  id: z.string().optional().describe('Optional element ID; auto-generated if omitted'),
  type: z.enum([
    'rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'text', 'freedraw', 'image',
  ]).describe('Element type'),
  label: z.string().optional().describe('Text label — shapes with labels auto-create bound text'),
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
  width: z.number().optional().describe('Width (default varies by type)'),
  height: z.number().optional().describe('Height (default varies by type)'),
  strokeColor: z.string().optional().describe('Stroke color (CSS hex)'),
  backgroundColor: z.string().optional().describe('Background color (CSS hex)'),
  fillStyle: z.enum(['hachure', 'cross-hatch', 'solid']).optional().describe('Fill style'),
  strokeWidth: z.number().optional().describe('Stroke width'),
  roughness: z.number().optional().describe('Roughness (0=sharp, 1=normal, 2=rough)'),
  roundness: z.object({ type: z.number(), value: z.number().optional() }).nullable().optional(),
  fontFamily: z.number().optional().describe('Font family (1=hand-drawn, 2=normal, 3=code)'),
  fontSize: z.number().optional().describe('Font size in px'),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  groupId: z.string().optional().describe('Group ID for grouping elements'),
  containerId: z.string().optional().describe('Container element ID (for bound text)'),
  startId: z.string().optional().describe('Arrow start binding element ID'),
  endId: z.string().optional().describe('Arrow end binding element ID'),
  points: z.array(z.tuple([z.number(), z.number()])).optional().describe('Points for line/arrow'),
});

const SceneInputSchema = z.object({
  type: z.literal('excalidraw'),
  version: z.literal(2),
  source: z.string().optional(),
  elements: z.array(z.record(z.unknown())),
  appState: z.object({
    gridSize: z.number().nullable().optional(),
    viewBackgroundColor: z.string(),
    theme: z.enum(['light', 'dark']).optional(),
  }),
  files: z.record(z.unknown()),
}).describe('Excalidraw scene JSON');

const PatchOpSchema = z.object({
  op: z.enum(['add', 'update', 'delete', 'move', 'restyle']).describe('Operation type'),
  elementId: z.string().optional().describe('Target element ID'),
  element: z.record(z.unknown()).optional().describe('Element spec (for add)'),
  properties: z.record(z.unknown()).optional().describe('Properties to update/move/restyle'),
});

export function registerExcalidrawTools(
  server: McpServer,
  _config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  // ── excalidraw_create ───────────────────────────────────────────────────

  server.registerTool(
    'excalidraw_create',
    {
      description:
        'Generate an Excalidraw scene JSON from structured element specs. ' +
        'Provide a title and array of elements (rectangles, ellipses, diamonds, arrows, text). ' +
        'Shapes with a "label" field automatically get bound text. ' +
        'Arrows can reference startId/endId to bind to other elements.',
      inputSchema: {
        title: z.string().describe('Scene title'),
        elements: z.array(ElementSpecInputSchema).describe('Array of element specs'),
        theme: z.enum(['light', 'dark']).optional().describe('Color theme'),
        gridMode: z.boolean().optional().describe('Enable grid (20px)'),
      },
    },
    wrapToolHandler(
      'excalidraw_create',
      middleware,
      async (args: {
        title: string;
        elements: z.infer<typeof ElementSpecInputSchema>[];
        theme?: 'light' | 'dark';
        gridMode?: boolean;
      }) => {
        const scene = buildScene(args.title, args.elements, {
          theme: args.theme,
          gridSize: args.gridMode ? 20 : null,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(scene, null, 2) }],
        };
      }
    )
  );

  // ── excalidraw_validate ─────────────────────────────────────────────────

  server.registerTool(
    'excalidraw_validate',
    {
      description:
        'Validate an Excalidraw scene for layout issues, orphaned bindings, text overflow, ' +
        'contrast problems, and accessibility. Returns issues and suggestions.',
      inputSchema: {
        scene: SceneInputSchema,
      },
    },
    wrapToolHandler(
      'excalidraw_validate',
      middleware,
      async (args: { scene: z.infer<typeof SceneInputSchema> }) => {
        const result = validateScene(
          args.scene as unknown as import('@secureyeoman/shared').ExcalidrawScene
        );

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    )
  );

  // ── excalidraw_modify ───────────────────────────────────────────────────

  server.registerTool(
    'excalidraw_modify',
    {
      description:
        'Patch an existing Excalidraw scene with add/update/delete/move/restyle operations. ' +
        'Each operation targets an element by ID. Returns the modified scene.',
      inputSchema: {
        scene: SceneInputSchema.describe('Excalidraw scene JSON to modify'),
        operations: z.array(PatchOpSchema).describe('Patch operations to apply'),
      },
    },
    wrapToolHandler(
      'excalidraw_modify',
      middleware,
      async (args: {
        scene: z.infer<typeof SceneInputSchema>;
        operations: z.infer<typeof PatchOpSchema>[];
      }) => {
        const result = patchScene(
          args.scene as unknown as import('@secureyeoman/shared').ExcalidrawScene,
          args.operations as unknown as import('@secureyeoman/shared').PatchOperation[]
        );

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    )
  );

  // ── excalidraw_templates ────────────────────────────────────────────────

  server.registerTool(
    'excalidraw_templates',
    {
      description:
        'List available Excalidraw element templates and color palettes. ' +
        'Optionally filter by category (data, compute, infrastructure, messaging, actors, security).',
      inputSchema: {
        category: z.string().optional().describe('Filter templates by category'),
      },
    },
    wrapToolHandler(
      'excalidraw_templates',
      middleware,
      async (args: { category?: string }) => {
        const categories = getTemplateCategories();
        const templates = getTemplatesByCategory(args.category);
        const palettes = getAllPalettes();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ categories, templates, palettes }, null, 2),
            },
          ],
        };
      }
    )
  );
}
