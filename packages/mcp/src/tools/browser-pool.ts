/**
 * Browser Pool Manager — manages Playwright browser lifecycle.
 *
 * Lazy-launches a browser and manages a pool of pages with configurable limits.
 */

import type { McpServiceConfig } from '@friday/shared';

// Playwright types — dynamically imported to keep it optional
type Browser = import('playwright').Browser;
type Page = import('playwright').Page;

export interface BrowserPoolOptions {
  headless: boolean;
  maxPages: number;
  timeoutMs: number;
}

export class BrowserPool {
  private browser: Browser | null = null;
  private pages: Page[] = [];
  private readonly options: BrowserPoolOptions;

  constructor(options: BrowserPoolOptions) {
    this.options = options;
  }

  static fromConfig(config: McpServiceConfig): BrowserPool {
    return new BrowserPool({
      headless: config.browserHeadless,
      maxPages: config.browserMaxPages,
      timeoutMs: config.browserTimeoutMs,
    });
  }

  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    let playwright: typeof import('playwright');
    try {
      playwright = await import('playwright');
    } catch {
      throw new Error(
        'Playwright is not installed. Install it with: npm install playwright && npx playwright install chromium',
      );
    }

    this.browser = await playwright.chromium.launch({
      headless: this.options.headless,
    });

    return this.browser;
  }

  async getPage(): Promise<Page> {
    if (this.pages.length >= this.options.maxPages) {
      throw new Error(
        `Browser page limit reached (${this.options.maxPages}). Release a page before opening a new one.`,
      );
    }

    const browser = await this.getBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(this.options.timeoutMs);
    this.pages.push(page);
    return page;
  }

  async releasePage(page: Page): Promise<void> {
    const idx = this.pages.indexOf(page);
    if (idx !== -1) {
      this.pages.splice(idx, 1);
    }
    try {
      if (!page.isClosed()) {
        await page.close();
      }
    } catch {
      // Page already closed
    }
  }

  async shutdown(): Promise<void> {
    for (const page of this.pages) {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch {
        // Ignore close errors during shutdown
      }
    }
    this.pages = [];

    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore close errors during shutdown
      }
      this.browser = null;
    }
  }

  get pageCount(): number {
    return this.pages.length;
  }

  get maxPages(): number {
    return this.options.maxPages;
  }

  get timeoutMs(): number {
    return this.options.timeoutMs;
  }
}
