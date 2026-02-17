/**
 * Browser Automation Tools — Playwright-based browser tools for MCP.
 *
 * When `exposeBrowser` is disabled (default), all tools return the NOT_AVAILABLE_MSG.
 * When enabled and Playwright is installed, tools use a shared BrowserPool.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@friday/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';
import { BrowserPool } from './browser-pool.js';

const NOT_AVAILABLE_MSG =
  'Browser automation is not available. Set MCP_EXPOSE_BROWSER=true and install Playwright ' +
  '(npm install playwright && npx playwright install chromium) to enable browser tools.';

let _pool: BrowserPool | null = null;

function getPool(config: McpServiceConfig): BrowserPool {
  if (!_pool) {
    _pool = BrowserPool.fromConfig(config);
  }
  return _pool;
}

export function getBrowserPool(): BrowserPool | null {
  return _pool;
}

export function registerBrowserTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware,
): void {
  server.tool(
    'browser_navigate',
    'Navigate to a URL and return page title, URL, and a content snippet',
    {
      url: z.string().describe('URL to navigate to'),
      waitFor: z.string().optional().describe('CSS selector to wait for before returning'),
      timeout: z.number().int().min(1000).max(120000).default(30000).describe('Timeout in ms'),
    },
    wrapToolHandler('browser_navigate', middleware, async (args) => {
      if (!config.exposeBrowser) {
        return { content: [{ type: 'text' as const, text: NOT_AVAILABLE_MSG }], isError: true };
      }

      const pool = getPool(config);
      const page = await pool.getPage();
      try {
        await page.goto(args.url, { timeout: args.timeout, waitUntil: 'domcontentloaded' });

        if (args.waitFor) {
          await page.waitForSelector(args.waitFor, { timeout: args.timeout });
        }

        const title = await page.title();
        const url = page.url();
        const snippet = await page.evaluate(
          'document.body ? document.body.innerText.slice(0, 2000) : ""',
        );

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ title, url, snippet }, null, 2) },
          ],
        };
      } finally {
        await pool.releasePage(page);
      }
    }),
  );

  server.tool(
    'browser_screenshot',
    'Take a screenshot of a webpage and return it as base64 PNG',
    {
      url: z.string().describe('URL to screenshot'),
      fullPage: z.boolean().default(false).describe('Capture full page or viewport only'),
      width: z.number().int().min(320).max(3840).default(1280).describe('Viewport width'),
      height: z.number().int().min(240).max(2160).default(720).describe('Viewport height'),
    },
    wrapToolHandler('browser_screenshot', middleware, async (args) => {
      if (!config.exposeBrowser) {
        return { content: [{ type: 'text' as const, text: NOT_AVAILABLE_MSG }], isError: true };
      }

      const pool = getPool(config);
      const page = await pool.getPage();
      try {
        await page.setViewportSize({ width: args.width, height: args.height });
        await page.goto(args.url, { timeout: pool.timeoutMs, waitUntil: 'domcontentloaded' });

        const buffer = await page.screenshot({ fullPage: args.fullPage });
        const base64 = buffer.toString('base64');

        return {
          content: [
            { type: 'text' as const, text: `Screenshot captured (${args.width}x${args.height}, fullPage=${args.fullPage})` },
            { type: 'text' as const, text: `data:image/png;base64,${base64}` },
          ],
        };
      } finally {
        await pool.releasePage(page);
      }
    }),
  );

  server.tool(
    'browser_click',
    'Click an element on the current page by CSS selector',
    {
      selector: z.string().describe('CSS selector of element to click'),
      waitAfter: z.number().int().min(0).max(10000).default(1000).describe('Wait time after click in ms'),
    },
    wrapToolHandler('browser_click', middleware, async (args) => {
      if (!config.exposeBrowser) {
        return { content: [{ type: 'text' as const, text: NOT_AVAILABLE_MSG }], isError: true };
      }

      const pool = getPool(config);
      const page = await pool.getPage();
      try {
        await page.click(args.selector);
        if (args.waitAfter > 0) {
          await page.waitForTimeout(args.waitAfter);
        }

        return {
          content: [
            { type: 'text' as const, text: `Clicked element matching "${args.selector}"` },
          ],
        };
      } finally {
        await pool.releasePage(page);
      }
    }),
  );

  server.tool(
    'browser_fill',
    'Fill in a form field on a page by CSS selector',
    {
      selector: z.string().describe('CSS selector of the input element'),
      value: z.string().describe('Value to fill in'),
    },
    wrapToolHandler('browser_fill', middleware, async (args) => {
      if (!config.exposeBrowser) {
        return { content: [{ type: 'text' as const, text: NOT_AVAILABLE_MSG }], isError: true };
      }

      const pool = getPool(config);
      const page = await pool.getPage();
      try {
        await page.fill(args.selector, args.value);

        return {
          content: [
            { type: 'text' as const, text: `Filled "${args.selector}" with value (${args.value.length} chars)` },
          ],
        };
      } finally {
        await pool.releasePage(page);
      }
    }),
  );

  server.tool(
    'browser_evaluate',
    'Execute JavaScript in the browser context and return the JSON result',
    {
      script: z.string().describe('JavaScript code to evaluate'),
    },
    wrapToolHandler('browser_evaluate', middleware, async (args) => {
      if (!config.exposeBrowser) {
        return { content: [{ type: 'text' as const, text: NOT_AVAILABLE_MSG }], isError: true };
      }

      const pool = getPool(config);
      const page = await pool.getPage();
      try {
        const result = await page.evaluate(args.script);

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } finally {
        await pool.releasePage(page);
      }
    }),
  );

  server.tool(
    'browser_pdf',
    'Generate a PDF from a webpage and return it as base64',
    {
      url: z.string().describe('URL to generate PDF from'),
      format: z.enum(['A4', 'Letter', 'Legal']).default('A4').describe('Paper format'),
    },
    wrapToolHandler('browser_pdf', middleware, async (args) => {
      if (!config.exposeBrowser) {
        return { content: [{ type: 'text' as const, text: NOT_AVAILABLE_MSG }], isError: true };
      }

      const pool = getPool(config);
      const page = await pool.getPage();
      try {
        await page.goto(args.url, { timeout: pool.timeoutMs, waitUntil: 'domcontentloaded' });

        const buffer = await page.pdf({ format: args.format });
        const base64 = buffer.toString('base64');

        return {
          content: [
            { type: 'text' as const, text: `PDF generated (${args.format})` },
            { type: 'text' as const, text: `data:application/pdf;base64,${base64}` },
          ],
        };
      } finally {
        await pool.releasePage(page);
      }
    }),
  );
}
