/**
 * Rasa MCP Tools — Image editor operations exposed as native SY MCP tools.
 *
 * Rasa is a stdio-based MCP server. These tool definitions allow SY to
 * proxy calls to a running rasa-mcp process via the MCP client manager,
 * or to be used directly when rasa-mcp is registered as an external MCP server.
 *
 * Tools:
 * - rasa_open_image:       Open an image file or create a blank document
 * - rasa_get_document:     Get current document state (layers, dimensions)
 * - rasa_edit_layer:       Layer operations (add, remove, rename, reorder, merge)
 * - rasa_apply_filter:     Apply image filters (brightness, blur, sharpen, etc.)
 * - rasa_export:           Export to PNG, JPEG, WebP, or TIFF
 * - rasa_batch_export:     Batch process multiple images
 * - rasa_import_video_frame: Import a video frame from Tazama
 * - rasa_export_for_video: Export for video timeline insertion
 */

import type { McpToolDef } from '@secureyeoman/shared';

export const RASA_TOOL_DEFINITIONS: McpToolDef[] = [
  {
    name: 'rasa_open_image',
    description:
      'Open an existing image file or create a new blank document in Rasa. Supports PNG, JPEG, TIFF, WebP, BMP, GIF, and native .rasa format.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to image file to open (omit to create blank)',
        },
        width: {
          type: 'number',
          description: 'Width in pixels for new blank document (default: 1920)',
        },
        height: {
          type: 'number',
          description: 'Height in pixels for new blank document (default: 1080)',
        },
      },
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'rasa_get_document',
    description:
      'Get the current document state including layers, dimensions, color space, and undo/redo status.',
    inputSchema: { type: 'object', properties: {} },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'rasa_edit_layer',
    description:
      'Perform layer operations: add, remove, rename, reorder, duplicate, merge, set opacity, set blend mode, toggle visibility.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'add',
            'remove',
            'rename',
            'reorder',
            'duplicate',
            'merge_down',
            'set_opacity',
            'set_blend_mode',
            'toggle_visibility',
          ],
          description: 'Layer operation to perform',
        },
        layer_index: {
          type: 'number',
          description: 'Target layer index (0-based)',
        },
        name: { type: 'string', description: 'New name (for rename/add)' },
        opacity: {
          type: 'number',
          description: 'Opacity 0.0-1.0 (for set_opacity)',
        },
        blend_mode: {
          type: 'string',
          description: 'Blend mode (normal, multiply, screen, overlay, etc.)',
        },
        new_index: {
          type: 'number',
          description: 'New position (for reorder)',
        },
      },
      required: ['action'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'rasa_apply_filter',
    description:
      'Apply an image filter to the current layer or entire document. Supports brightness, contrast, hue, saturation, blur, sharpen, invert, grayscale.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: [
            'brightness',
            'contrast',
            'hue',
            'saturation',
            'blur',
            'sharpen',
            'invert',
            'grayscale',
          ],
          description: 'Filter to apply',
        },
        value: {
          type: 'number',
          description: 'Filter intensity (-100 to 100 for most, radius for blur)',
        },
        layer_index: {
          type: 'number',
          description: 'Target layer (omit for active layer)',
        },
      },
      required: ['filter'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'rasa_export',
    description: 'Export the document to a file. Supports PNG, JPEG, WebP, and TIFF formats.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Output file path' },
        format: {
          type: 'string',
          enum: ['png', 'jpeg', 'webp', 'tiff'],
          description: 'Output format (default: png)',
        },
        quality: {
          type: 'number',
          description: 'Quality 0-100 for JPEG/WebP (default: 90)',
        },
      },
      required: ['path'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'rasa_batch_export',
    description:
      'Batch process multiple image files: import, apply filters, and export. Useful for thumbnail generation, format conversion, and batch watermarking.',
    inputSchema: {
      type: 'object',
      properties: {
        input_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of input image file paths',
        },
        output_dir: {
          type: 'string',
          description: 'Output directory for processed images',
        },
        format: {
          type: 'string',
          enum: ['png', 'jpeg', 'webp', 'tiff'],
          description: 'Output format',
        },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filter: { type: 'string' },
              value: { type: 'number' },
            },
          },
          description: 'Filters to apply to each image',
        },
      },
      required: ['input_paths', 'output_dir'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'rasa_import_video_frame',
    description:
      'Import a video frame (typically from Tazama video editor) into Rasa for editing. Preserves source metadata for re-export.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to video frame image' },
        source_video: {
          type: 'string',
          description: 'Source video file path (metadata)',
        },
        frame_number: {
          type: 'number',
          description: 'Frame number in source video',
        },
        timecode: {
          type: 'string',
          description: 'Timecode in source video (HH:MM:SS:FF)',
        },
      },
      required: ['path'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'rasa_export_for_video',
    description:
      'Export the current document as PNG optimized for video timeline insertion (Tazama integration).',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Output path for the video-ready frame',
        },
      },
      required: ['path'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
];
