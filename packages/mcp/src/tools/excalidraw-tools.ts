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
import { buildScene, validateScene, patchScene, renderSceneToSvg } from './excalidraw-scene.js';
import {
  getTemplateCategories,
  getTemplatesByCategory,
  getAllPalettes,
} from './excalidraw-templates.js';

const ElementSpecInputSchema = z.object({
  id: z.string().optional().describe('Optional element ID; auto-generated if omitted'),
  type: z
    .enum(['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'text', 'freedraw', 'image'])
    .describe('Element type'),
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
  points: z
    .array(z.tuple([z.number(), z.number()]))
    .optional()
    .describe('Points for line/arrow'),
});

const SceneInputSchema = z
  .object({
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
  })
  .describe('Excalidraw scene JSON');

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
    wrapToolHandler('excalidraw_templates', middleware, async (args: { category?: string }) => {
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
    })
  );

  // ── excalidraw_from_description ─────────────────────────────────────────

  const DiagramTypeEnum = z.enum([
    'architecture',
    'sequence',
    'flowchart',
    'network',
    'er_diagram',
    'class_diagram',
    'deployment',
    'data_flow',
    'threat_model',
    'state_machine',
    'mind_map',
    'org_chart',
  ]);

  server.registerTool(
    'excalidraw_from_description',
    {
      description:
        'Generate an Excalidraw scene from a natural language description. ' +
        'Describe what you want to diagram and specify the diagram type. ' +
        'The tool translates the description into element specs and builds the scene.',
      inputSchema: {
        description: z.string().describe('Natural language description of the diagram'),
        diagramType: DiagramTypeEnum.describe('Type of diagram to generate'),
        style: z.enum(['minimal', 'detailed', 'technical']).optional().describe('Visual style'),
        colorPalette: z
          .string()
          .optional()
          .describe('Color palette name from excalidraw_templates'),
      },
    },
    wrapToolHandler(
      'excalidraw_from_description',
      middleware,
      async (args: {
        description: string;
        diagramType: z.infer<typeof DiagramTypeEnum>;
        style?: 'minimal' | 'detailed' | 'technical';
        colorPalette?: string;
      }) => {
        // Build element specs from the description using diagram-type heuristics
        const elements = descriptionToElements(args.description, args.diagramType, args.style);
        const scene = buildScene(args.description.slice(0, 60), elements, {
          theme: 'light',
          gridSize: 20,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  scene,
                  diagramType: args.diagramType,
                  style: args.style ?? 'minimal',
                  elementCount: scene.elements.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    )
  );

  // ── excalidraw_render ───────────────────────────────────────────────────

  server.registerTool(
    'excalidraw_render',
    {
      description:
        'Render an Excalidraw scene to SVG. Takes a scene JSON and returns an SVG string. ' +
        'Lightweight server-side rendering without external dependencies.',
      inputSchema: {
        scene: SceneInputSchema.describe('Excalidraw scene JSON to render'),
        format: z.literal('svg').default('svg').describe('Output format (svg)'),
        width: z.number().optional().describe('SVG width in pixels (auto-computed if omitted)'),
        height: z.number().optional().describe('SVG height in pixels (auto-computed if omitted)'),
        darkMode: z.boolean().optional().describe('Render with dark background'),
      },
    },
    wrapToolHandler(
      'excalidraw_render',
      middleware,
      async (args: {
        scene: z.infer<typeof SceneInputSchema>;
        format?: 'svg';
        width?: number;
        height?: number;
        darkMode?: boolean;
      }) => {
        const svg = renderSceneToSvg(
          args.scene as unknown as import('@secureyeoman/shared').ExcalidrawScene,
          { width: args.width, height: args.height, darkMode: args.darkMode }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ svg, format: 'svg' }, null, 2),
            },
          ],
        };
      }
    )
  );
}

// ── Description-to-elements heuristic engine ──────────────────────────────

interface ElementSpec {
  id?: string;
  type: 'rectangle' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'text' | 'freedraw' | 'image';
  label?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  strokeColor?: string;
  backgroundColor?: string;
  startId?: string;
  endId?: string;
  groupId?: string;
}

function descriptionToElements(
  description: string,
  diagramType: string,
  style?: string
): ElementSpec[] {
  // Extract meaningful nouns/phrases from description
  const phrases = description
    .replace(/[^\w\s,→\->]/g, ' ')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 80);

  // Deduplicate and limit
  const items = [...new Set(phrases)].slice(0, 12);
  if (items.length === 0) items.push('Component');

  const spacing = style === 'detailed' ? 200 : 160;
  const nodeW = style === 'detailed' ? 160 : 120;
  const nodeH = style === 'detailed' ? 80 : 60;
  const elements: ElementSpec[] = [];

  const layoutFn = LAYOUT_STRATEGIES[diagramType] ?? LAYOUT_STRATEGIES.flowchart!;
  layoutFn(items, elements, { spacing, nodeW, nodeH, diagramType });

  return elements;
}

interface LayoutOpts {
  spacing: number;
  nodeW: number;
  nodeH: number;
  diagramType: string;
}

const LAYOUT_STRATEGIES: Record<
  string,
  (items: string[], elements: ElementSpec[], opts: LayoutOpts) => void
> = {
  architecture: (items, elements, { spacing, nodeW, nodeH }) => {
    // Grid layout
    const cols = Math.ceil(Math.sqrt(items.length));
    items.forEach((label, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      elements.push({
        id: `node_${i}`,
        type: 'rectangle',
        label,
        x: col * spacing,
        y: row * (nodeH + 60),
        width: nodeW,
        height: nodeH,
        backgroundColor: '#a5d8ff',
      });
    });
    // Connect adjacent nodes
    for (let i = 0; i < items.length - 1; i++) {
      elements.push({
        type: 'arrow',
        x: 0,
        y: 0,
        startId: `node_${i}`,
        endId: `node_${i + 1}`,
      });
    }
  },

  flowchart: (items, elements, { spacing, nodeW, nodeH }) => {
    // Vertical flow
    items.forEach((label, i) => {
      elements.push({
        id: `step_${i}`,
        type: i === 0 || i === items.length - 1 ? 'ellipse' : 'rectangle',
        label,
        x: 0,
        y: i * (nodeH + 40),
        width: nodeW,
        height: nodeH,
        backgroundColor: i === 0 ? '#b2f2bb' : i === items.length - 1 ? '#ffa8a8' : '#a5d8ff',
      });
    });
    for (let i = 0; i < items.length - 1; i++) {
      elements.push({
        type: 'arrow',
        x: 0,
        y: 0,
        startId: `step_${i}`,
        endId: `step_${i + 1}`,
      });
    }
  },

  sequence: (items, elements, { spacing, nodeW, nodeH }) => {
    // Horizontal actors with vertical messages
    items.forEach((label, i) => {
      elements.push({
        id: `actor_${i}`,
        type: 'rectangle',
        label,
        x: i * spacing,
        y: 0,
        width: nodeW,
        height: nodeH,
        backgroundColor: '#d0bfff',
      });
    });
    for (let i = 0; i < items.length - 1; i++) {
      elements.push({
        type: 'arrow',
        x: 0,
        y: 0,
        startId: `actor_${i}`,
        endId: `actor_${i + 1}`,
      });
    }
  },

  network: (items, elements, { spacing, nodeW, nodeH }) => {
    // Star topology: first item is central, rest surround
    const centerX = spacing * 2;
    const centerY = spacing * 2;
    elements.push({
      id: 'core',
      type: 'ellipse',
      label: items[0] ?? 'Core',
      x: centerX,
      y: centerY,
      width: nodeW + 20,
      height: nodeH + 20,
      backgroundColor: '#ffd43b',
    });
    const others = items.slice(1);
    others.forEach((label, i) => {
      const angle = (2 * Math.PI * i) / others.length;
      elements.push({
        id: `node_${i}`,
        type: 'rectangle',
        label,
        x: centerX + Math.cos(angle) * spacing * 1.5,
        y: centerY + Math.sin(angle) * spacing * 1.5,
        width: nodeW,
        height: nodeH,
        backgroundColor: '#a5d8ff',
      });
      elements.push({
        type: 'arrow',
        x: 0,
        y: 0,
        startId: 'core',
        endId: `node_${i}`,
      });
    });
  },

  threat_model: (items, elements, { spacing, nodeW, nodeH }) => {
    // DFD-style: processes (circles), data stores (parallel lines → rectangles), external entities (rectangles)
    items.forEach((label, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      elements.push({
        id: `dfd_${i}`,
        type: col === 0 ? 'ellipse' : col === 1 ? 'rectangle' : 'diamond',
        label,
        x: col * spacing,
        y: row * (nodeH + 60),
        width: nodeW,
        height: nodeH,
        backgroundColor: col === 2 ? '#ffa8a8' : '#a5d8ff',
      });
    });
    for (let i = 0; i < items.length - 1; i++) {
      elements.push({
        type: 'arrow',
        x: 0,
        y: 0,
        startId: `dfd_${i}`,
        endId: `dfd_${i + 1}`,
      });
    }
  },

  mind_map: (items, elements, { spacing, nodeW, nodeH }) => {
    // Central node with radial branches
    elements.push({
      id: 'center',
      type: 'ellipse',
      label: items[0] ?? 'Topic',
      x: spacing * 2,
      y: spacing * 2,
      width: nodeW + 40,
      height: nodeH + 20,
      backgroundColor: '#ffd43b',
    });
    const branches = items.slice(1);
    branches.forEach((label, i) => {
      const angle = (2 * Math.PI * i) / branches.length;
      elements.push({
        id: `branch_${i}`,
        type: 'rectangle',
        label,
        x: spacing * 2 + Math.cos(angle) * spacing * 1.8,
        y: spacing * 2 + Math.sin(angle) * spacing * 1.8,
        width: nodeW,
        height: nodeH,
        backgroundColor: '#b2f2bb',
      });
      elements.push({
        type: 'line',
        x: 0,
        y: 0,
        startId: 'center',
        endId: `branch_${i}`,
      });
    });
  },

  org_chart: (items, elements, { spacing, nodeW, nodeH }) => {
    // Top-down tree
    items.forEach((label, i) => {
      const level = i === 0 ? 0 : i < 4 ? 1 : 2;
      const posInLevel = i === 0 ? 0 : level === 1 ? i - 1 : i - 4;
      const levelWidth =
        level === 0 ? 1 : level === 1 ? Math.min(3, items.length - 1) : items.length - 4;
      const offsetX = (posInLevel - (levelWidth - 1) / 2) * spacing;
      elements.push({
        id: `person_${i}`,
        type: 'rectangle',
        label,
        x: spacing * 2 + offsetX,
        y: level * (nodeH + 60),
        width: nodeW,
        height: nodeH,
        backgroundColor: level === 0 ? '#ffd43b' : '#a5d8ff',
      });
      if (i > 0) {
        const parentId =
          level === 1 ? 'person_0' : `person_${Math.min(3, Math.floor((i - 4) / 2) + 1)}`;
        elements.push({
          type: 'arrow',
          x: 0,
          y: 0,
          startId: parentId,
          endId: `person_${i}`,
        });
      }
    });
  },
};

// Aliases
LAYOUT_STRATEGIES.er_diagram = LAYOUT_STRATEGIES.architecture!;
LAYOUT_STRATEGIES.class_diagram = LAYOUT_STRATEGIES.architecture!;
LAYOUT_STRATEGIES.deployment = LAYOUT_STRATEGIES.architecture!;
LAYOUT_STRATEGIES.data_flow = LAYOUT_STRATEGIES.flowchart!;
LAYOUT_STRATEGIES.state_machine = LAYOUT_STRATEGIES.flowchart!;
