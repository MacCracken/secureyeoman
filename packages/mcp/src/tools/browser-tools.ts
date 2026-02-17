/**
 * Browser Automation Tools — placeholder for Playwright/Puppeteer-based tools.
 *
 * These tools are registered at the MCP protocol level but return "not yet
 * available" until a browser engine (Playwright or Puppeteer) is installed.
 * The feature toggle (exposeBrowser) controls visibility in the core API.
 *
 * Phase 8 roadmap: full implementation with Playwright.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@friday/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

const NOT_AVAILABLE_MSG =
  'Browser automation is not yet available. This feature requires Playwright or Puppeteer ' +
  'to be installed. See the FRIDAY roadmap (Phase 8) for details.';

export function registerBrowserTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware,
): void {
  server.tool(
    'browser_navigate',
    'Navigate to a URL and return page content (requires browser engine — coming soon)',
    {
      url: z.string().describe('URL to navigate to'),
      waitFor: z.string().optional().describe('CSS selector to wait for before returning'),
      timeout: z.number().int().min(1000).max(120000).default(30000).describe('Timeout in ms'),
    },
    wrapToolHandler('browser_navigate', middleware, async () => {
      return { content: [{ type: 'text' as const, text: NOT_AVAILABLE_MSG }], isError: true };
    }),
  );

  server.tool(
    'browser_screenshot',
    'Take a screenshot of a webpage (requires browser engine — coming soon)',
    {
      url: z.string().describe('URL to screenshot'),
      fullPage: z.boolean().default(false).describe('Capture full page or viewport only'),
      width: z.number().int().min(320).max(3840).default(1280).describe('Viewport width'),
      height: z.number().int().min(240).max(2160).default(720).describe('Viewport height'),
    },
    wrapToolHandler('browser_screenshot', middleware, async () => {
      return { content: [{ type: 'text' as const, text: NOT_AVAILABLE_MSG }], isError: true };
    }),
  );

  server.tool(
    'browser_click',
    'Click an element on a page (requires browser engine — coming soon)',
    {
      selector: z.string().describe('CSS selector of element to click'),
      waitAfter: z.number().int().min(0).max(10000).default(1000).describe('Wait time after click in ms'),
    },
    wrapToolHandler('browser_click', middleware, async () => {
      return { content: [{ type: 'text' as const, text: NOT_AVAILABLE_MSG }], isError: true };
    }),
  );

  server.tool(
    'browser_fill',
    'Fill in a form field on a page (requires browser engine — coming soon)',
    {
      selector: z.string().describe('CSS selector of the input element'),
      value: z.string().describe('Value to fill in'),
    },
    wrapToolHandler('browser_fill', middleware, async () => {
      return { content: [{ type: 'text' as const, text: NOT_AVAILABLE_MSG }], isError: true };
    }),
  );

  server.tool(
    'browser_evaluate',
    'Execute JavaScript in the browser context and return the result (requires browser engine — coming soon)',
    {
      script: z.string().describe('JavaScript code to evaluate'),
    },
    wrapToolHandler('browser_evaluate', middleware, async () => {
      return { content: [{ type: 'text' as const, text: NOT_AVAILABLE_MSG }], isError: true };
    }),
  );

  server.tool(
    'browser_pdf',
    'Generate a PDF from a webpage (requires browser engine — coming soon)',
    {
      url: z.string().describe('URL to generate PDF from'),
      format: z.enum(['A4', 'Letter', 'Legal']).default('A4').describe('Paper format'),
    },
    wrapToolHandler('browser_pdf', middleware, async () => {
      return { content: [{ type: 'text' as const, text: NOT_AVAILABLE_MSG }], isError: true };
    }),
  );
}
