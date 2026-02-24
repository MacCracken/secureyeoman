/**
 * Desktop Control Tools — MCP surface for screen capture and input control.
 *
 * All 13 desktop_* tools call the core API (/api/v1/desktop/*) which runs
 * the actual capture/actuator drivers. Each handler:
 *   1. Checks SecurityConfig.allowDesktopControl via /api/v1/security/policy
 *   2. Checks body.capabilities[] for 'vision' or 'limb_movement'
 *   3. Calls the appropriate core desktop route
 *   4. Emits audit event
 *
 * Tools:
 *   Vision capability:
 *     desktop_screenshot        — capture screen/window/region
 *     desktop_window_list       — list open windows
 *     desktop_display_list      — list monitors
 *     desktop_camera_capture    — camera frame (requires allowCamera)
 *   Limb movement capability:
 *     desktop_window_focus      — focus window by ID
 *     desktop_window_resize     — resize/reposition window
 *     desktop_mouse_move        — move mouse cursor
 *     desktop_click             — click mouse button
 *     desktop_scroll            — scroll mouse wheel
 *     desktop_type              — type text
 *     desktop_key               — press key combination
 *     desktop_clipboard_read    — read clipboard
 *     desktop_clipboard_write   — write clipboard
 *     desktop_input_sequence    — execute input sequence (max 50 steps)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

const NOT_EXPOSED_MSG =
  'Remote Desktop Control tools are not enabled on this server. ' +
  'Enable Desktop Control in Connections → Yeoman MCP → Feature Toggles, ' +
  'then ensure Desktop Control is also enabled in Security Settings.';

// ── Response helpers ─────────────────────────────────────────────────────────

function capabilityDisabledResponse(reason: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: 'capability_disabled', reason }),
      },
    ],
  };
}

function textResponse(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResponse(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
  };
}

// ── Capability guards ─────────────────────────────────────────────────────────

async function getSecurityPolicy(
  client: CoreApiClient
): Promise<{ allowDesktopControl: boolean; allowCamera: boolean; allowMultimodal: boolean }> {
  try {
    const result = await client.get('/api/v1/security/policy');
    return {
      allowDesktopControl: (result as Record<string, unknown>)?.allowDesktopControl === true,
      allowCamera: (result as Record<string, unknown>)?.allowCamera === true,
      allowMultimodal: (result as Record<string, unknown>)?.allowMultimodal === true,
    };
  } catch {
    return { allowDesktopControl: false, allowCamera: false, allowMultimodal: false };
  }
}

async function getPersonalityCapabilities(client: CoreApiClient): Promise<string[]> {
  try {
    const result = await client.get('/api/v1/soul/personality');
    const personality = (result as Record<string, Record<string, unknown>>)?.personality;
    const body = personality?.body as Record<string, unknown> | undefined;
    return (body?.capabilities as string[]) ?? [];
  } catch {
    return [];
  }
}

async function hasVisionCapability(client: CoreApiClient): Promise<boolean> {
  const caps = await getPersonalityCapabilities(client);
  return caps.includes('vision');
}

async function hasLimbMovementCapability(client: CoreApiClient): Promise<boolean> {
  const caps = await getPersonalityCapabilities(client);
  return caps.includes('limb_movement');
}

// ── Tool registration ────────────────────────────────────────────────────────

export function registerDesktopTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  // Gate all desktop tools at the MCP-config level — same pattern as browser/filesystem.
  // If exposeDesktopControl is false (the default), every tool returns an informational error
  // rather than being unregistered, so the agent understands why the tool isn't working.
  const desktopHandler = <T extends Record<string, unknown>>(
    name: string,
    fn: (args: T) => Promise<ReturnType<typeof capabilityDisabledResponse>>
  ) =>
    wrapToolHandler(name, middleware, async (args: T) => {
      if (!config.exposeDesktopControl) {
        return { content: [{ type: 'text' as const, text: NOT_EXPOSED_MSG }], isError: true };
      }
      return fn(args);
    });
  // ── desktop_screenshot ──────────────────────────────────────────────────────

  server.registerTool(
    'desktop_screenshot',
    {
      description:
        'Capture a screenshot of the screen, a specific window, or a region. Returns base64 image and AI-generated description (when Multimodal is enabled). Use this to observe screen state before acting.',
      inputSchema: {
        target: z
          .enum(['display', 'window', 'region'])
          .optional()
          .describe("Capture target type: 'display' (default), 'window', or 'region'"),
        targetId: z
          .string()
          .optional()
          .describe('Display index (for display), window ID (for window)'),
        region: z
          .object({
            x: z.number().int().nonnegative(),
            y: z.number().int().nonnegative(),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          })
          .optional()
          .describe('Region to capture (for region target)'),
        format: z.enum(['png', 'jpeg']).optional().describe('Image format (default: png)'),
        prompt: z.string().max(1000).optional().describe('Analysis prompt for AI interpretation'),
      },
    },
    desktopHandler('desktop_screenshot', async (args) => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled. Enable it in Security Settings.');
      }
      if (!(await hasVisionCapability(client))) {
        return capabilityDisabledResponse("'vision' capability not enabled on active personality");
      }
      try {
        const result = await client.post('/api/v1/desktop/screenshot', args);
        await middleware.auditLogger.log({
          event: 'desktop_capture',
          level: 'info',
          message: 'Screenshot captured',
          metadata: { tool: 'desktop_screenshot', target: args.target ?? 'display' },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_window_list ─────────────────────────────────────────────────────

  server.registerTool(
    'desktop_window_list',
    {
      description: 'List all open windows with their IDs, titles, and bounds.',
      inputSchema: {},
    },
    desktopHandler('desktop_clipboard_read', async () => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!(await hasVisionCapability(client))) {
        return capabilityDisabledResponse("'vision' capability not enabled on active personality");
      }
      try {
        const result = await client.get('/api/v1/desktop/windows');
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_display_list ────────────────────────────────────────────────────

  server.registerTool(
    'desktop_display_list',
    {
      description: 'List all connected monitors/displays with their IDs, names, and resolutions.',
      inputSchema: {},
    },
    desktopHandler('desktop_clipboard_write', async () => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!(await hasVisionCapability(client))) {
        return capabilityDisabledResponse("'vision' capability not enabled on active personality");
      }
      try {
        const result = await client.get('/api/v1/desktop/displays');
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_camera_capture ──────────────────────────────────────────────────

  server.registerTool(
    'desktop_camera_capture',
    {
      description:
        'Capture a single frame from the camera. Requires allowCamera to be enabled in Security Settings.',
      inputSchema: {
        deviceId: z
          .string()
          .optional()
          .describe('Camera device ID (default: system default camera)'),
        prompt: z.string().max(1000).optional().describe('Analysis prompt for AI interpretation'),
      },
    },
    desktopHandler('desktop_window_list', async (args) => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!policy.allowCamera) {
        return capabilityDisabledResponse('Camera capture is disabled. Enable allowCamera in Security Settings.');
      }
      if (!(await hasVisionCapability(client))) {
        return capabilityDisabledResponse("'vision' capability not enabled on active personality");
      }
      try {
        const result = await client.post('/api/v1/desktop/camera', args);
        await middleware.auditLogger.log({
          event: 'desktop_capture',
          level: 'info',
          message: 'Camera frame captured',
          metadata: { tool: 'desktop_camera_capture', deviceId: args.deviceId },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_window_focus ────────────────────────────────────────────────────

  server.registerTool(
    'desktop_window_focus',
    {
      description: 'Focus (bring to foreground) a window by its ID.',
      inputSchema: {
        windowId: z.string().describe('Window ID (from desktop_window_list)'),
      },
    },
    desktopHandler('desktop_display_list', async (args) => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!(await hasLimbMovementCapability(client))) {
        return capabilityDisabledResponse("'limb_movement' capability not enabled on active personality");
      }
      try {
        const result = await client.post('/api/v1/desktop/window/focus', args);
        await middleware.auditLogger.log({
          event: 'desktop_input',
          level: 'info',
          message: `Window focused: ${args.windowId}`,
          metadata: { tool: 'desktop_window_focus', windowId: args.windowId },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_window_resize ───────────────────────────────────────────────────

  server.registerTool(
    'desktop_window_resize',
    {
      description: 'Resize and/or reposition a window.',
      inputSchema: {
        windowId: z.string().describe('Window ID'),
        x: z.number().int().describe('New x position'),
        y: z.number().int().describe('New y position'),
        width: z.number().int().positive().describe('New width'),
        height: z.number().int().positive().describe('New height'),
      },
    },
    desktopHandler('desktop_camera_capture', async (args) => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!(await hasLimbMovementCapability(client))) {
        return capabilityDisabledResponse("'limb_movement' capability not enabled");
      }
      try {
        const result = await client.post('/api/v1/desktop/window/resize', args);
        await middleware.auditLogger.log({
          event: 'desktop_input',
          level: 'info',
          message: `Window resized: ${args.windowId}`,
          metadata: { tool: 'desktop_window_resize', windowId: args.windowId },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_mouse_move ──────────────────────────────────────────────────────

  server.registerTool(
    'desktop_mouse_move',
    {
      description: 'Move the mouse cursor to absolute screen coordinates.',
      inputSchema: {
        x: z.number().int().nonnegative().describe('X coordinate'),
        y: z.number().int().nonnegative().describe('Y coordinate'),
      },
    },
    desktopHandler('desktop_window_focus', async (args) => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!(await hasLimbMovementCapability(client))) {
        return capabilityDisabledResponse("'limb_movement' capability not enabled");
      }
      try {
        const result = await client.post('/api/v1/desktop/mouse/move', args);
        await middleware.auditLogger.log({
          event: 'desktop_input',
          level: 'info',
          message: `Mouse moved to (${args.x}, ${args.y})`,
          metadata: { tool: 'desktop_mouse_move', x: args.x, y: args.y },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_click ───────────────────────────────────────────────────────────

  server.registerTool(
    'desktop_click',
    {
      description:
        "Click a mouse button. Optionally move to coordinates first. Supports left, right, middle buttons and double-click.",
      inputSchema: {
        x: z.number().int().nonnegative().optional().describe('X coordinate to click'),
        y: z.number().int().nonnegative().optional().describe('Y coordinate to click'),
        button: z.enum(['left', 'right', 'middle']).optional().describe("Mouse button (default: 'left')"),
        double: z.boolean().optional().describe('Double-click (default: false)'),
      },
    },
    desktopHandler('desktop_window_resize', async (args) => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!(await hasLimbMovementCapability(client))) {
        return capabilityDisabledResponse("'limb_movement' capability not enabled");
      }
      try {
        const result = await client.post('/api/v1/desktop/mouse/click', args);
        await middleware.auditLogger.log({
          event: 'desktop_input',
          level: 'info',
          message: `Mouse clicked at (${args.x ?? 'current'}, ${args.y ?? 'current'})`,
          metadata: { tool: 'desktop_click', button: args.button, double: args.double },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_scroll ──────────────────────────────────────────────────────────

  server.registerTool(
    'desktop_scroll',
    {
      description: 'Scroll the mouse wheel. Positive dy scrolls down, negative dy scrolls up.',
      inputSchema: {
        dx: z.number().int().describe('Horizontal scroll amount (positive = right)'),
        dy: z.number().int().describe('Vertical scroll amount (positive = down)'),
      },
    },
    desktopHandler('desktop_mouse_move', async (args) => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!(await hasLimbMovementCapability(client))) {
        return capabilityDisabledResponse("'limb_movement' capability not enabled");
      }
      try {
        const result = await client.post('/api/v1/desktop/mouse/scroll', args);
        await middleware.auditLogger.log({
          event: 'desktop_input',
          level: 'info',
          message: `Scrolled (dx=${args.dx}, dy=${args.dy})`,
          metadata: { tool: 'desktop_scroll', dx: args.dx, dy: args.dy },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_type ────────────────────────────────────────────────────────────

  server.registerTool(
    'desktop_type',
    {
      description: 'Type text into the currently focused window.',
      inputSchema: {
        text: z.string().min(1).max(10000).describe('Text to type'),
        delayMs: z.number().int().nonnegative().max(500).optional().describe('Delay between keystrokes in ms (default: 0)'),
      },
    },
    desktopHandler('desktop_click', async (args) => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!(await hasLimbMovementCapability(client))) {
        return capabilityDisabledResponse("'limb_movement' capability not enabled");
      }
      try {
        const result = await client.post('/api/v1/desktop/keyboard/type', args);
        await middleware.auditLogger.log({
          event: 'desktop_input',
          level: 'info',
          message: `Typed ${args.text.length} characters`,
          metadata: { tool: 'desktop_type', textLength: args.text.length },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_key ─────────────────────────────────────────────────────────────

  server.registerTool(
    'desktop_key',
    {
      description:
        "Press a key combination. Use '+' to combine modifiers: e.g., 'ctrl+c', 'shift+alt+tab', 'enter', 'escape'.",
      inputSchema: {
        combo: z.string().min(1).max(100).describe("Key combination (e.g., 'ctrl+c', 'enter', 'shift+tab')"),
        release: z.boolean().optional().describe('If true, release the key instead of pressing (default: false)'),
      },
    },
    desktopHandler('desktop_scroll', async (args) => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!(await hasLimbMovementCapability(client))) {
        return capabilityDisabledResponse("'limb_movement' capability not enabled");
      }
      try {
        const result = await client.post('/api/v1/desktop/keyboard/key', args);
        await middleware.auditLogger.log({
          event: 'desktop_input',
          level: 'info',
          message: `Key ${args.release ? 'released' : 'pressed'}: ${args.combo}`,
          metadata: { tool: 'desktop_key', combo: args.combo, release: args.release },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_clipboard_read ──────────────────────────────────────────────────

  server.registerTool(
    'desktop_clipboard_read',
    {
      description: 'Read the current clipboard content.',
      inputSchema: {},
    },
    desktopHandler('desktop_input_sequence', async () => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!(await hasLimbMovementCapability(client))) {
        return capabilityDisabledResponse("'limb_movement' capability not enabled");
      }
      try {
        const result = await client.get('/api/v1/desktop/clipboard');
        await middleware.auditLogger.log({
          event: 'desktop_clipboard',
          level: 'info',
          message: 'Clipboard read',
          metadata: { tool: 'desktop_clipboard_read' },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_clipboard_write ─────────────────────────────────────────────────

  server.registerTool(
    'desktop_clipboard_write',
    {
      description: 'Write text to the clipboard.',
      inputSchema: {
        text: z.string().max(100000).describe('Text to write to clipboard'),
      },
    },
    desktopHandler('desktop_type', async (args) => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!(await hasLimbMovementCapability(client))) {
        return capabilityDisabledResponse("'limb_movement' capability not enabled");
      }
      try {
        const result = await client.post('/api/v1/desktop/clipboard', args);
        await middleware.auditLogger.log({
          event: 'desktop_clipboard',
          level: 'info',
          message: `Clipboard written (${args.text.length} chars)`,
          metadata: { tool: 'desktop_clipboard_write', textLength: args.text.length },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── desktop_input_sequence ──────────────────────────────────────────────────

  const InputActionSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('mouse_move'), x: z.number().int(), y: z.number().int() }),
    z.object({
      type: z.literal('mouse_click'),
      x: z.number().int().optional(),
      y: z.number().int().optional(),
      button: z.enum(['left', 'right', 'middle']).optional(),
      double: z.boolean().optional(),
    }),
    z.object({ type: z.literal('mouse_scroll'), dx: z.number().int(), dy: z.number().int() }),
    z.object({ type: z.literal('type'), text: z.string().max(10000) }),
    z.object({ type: z.literal('key_press'), combo: z.string().max(100) }),
    z.object({ type: z.literal('key_release'), combo: z.string().max(100) }),
    z.object({ type: z.literal('clipboard_write'), text: z.string().max(100000) }),
    z.object({ type: z.literal('clipboard_read') }),
    z.object({ type: z.literal('wait'), ms: z.number().int().nonnegative().max(5000) }),
  ]);

  server.registerTool(
    'desktop_input_sequence',
    {
      description:
        'Execute an ordered sequence of input actions atomically (max 50 steps). Returns after all steps complete.',
      inputSchema: {
        steps: z
          .array(
            z.object({
              action: InputActionSchema,
              delayAfterMs: z.number().int().nonnegative().max(5000).optional(),
            })
          )
          .min(1)
          .max(50)
          .describe('Ordered list of input actions'),
      },
    },
    desktopHandler('desktop_key', async (args) => {
      const policy = await getSecurityPolicy(client);
      if (!policy.allowDesktopControl) {
        return capabilityDisabledResponse('Desktop Control is disabled.');
      }
      if (!(await hasLimbMovementCapability(client))) {
        return capabilityDisabledResponse("'limb_movement' capability not enabled");
      }
      try {
        const result = await client.post('/api/v1/desktop/input/sequence', { steps: args.steps });
        await middleware.auditLogger.log({
          event: 'desktop_input',
          level: 'info',
          message: `Input sequence executed (${args.steps.length} steps)`,
          metadata: { tool: 'desktop_input_sequence', stepCount: args.steps.length },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );
}
