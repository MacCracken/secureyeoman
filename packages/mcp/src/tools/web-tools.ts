/**
 * Web Tools — web scraping and search (opt-in, admin-only).
 *
 * Follows the filesystem-tools.ts pattern: tools are always registered at the
 * MCP protocol level, but feature toggles (exposeWeb) control visibility in
 * the core API response.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@friday/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

const MAX_OUTPUT_BYTES = 500 * 1024; // 500KB output cap
const MAX_BATCH_URLS = 10;
const MAX_BATCH_QUERIES = 5;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 30_000;

// ─── SSRF Protection ────────────────────────────────────────

const BLOCKED_IP_RANGES = [
  /^127\./, // loopback
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^169\.254\./, // link-local / cloud metadata
  /^0\./, // 0.0.0.0/8
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 ULA
  /^fe80:/i, // IPv6 link-local
];

const BLOCKED_HOSTNAMES = ['localhost', 'metadata.google.internal', 'metadata.internal'];

class UrlValidationError extends Error {
  constructor(url: string, reason: string) {
    super(`URL "${url}" blocked: ${reason}`);
    this.name = 'UrlValidationError';
  }
}

function validateUrl(urlStr: string, config: McpServiceConfig): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new UrlValidationError(urlStr, 'Invalid URL');
  }

  // Protocol check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UrlValidationError(
      urlStr,
      `Protocol "${parsed.protocol}" not allowed, only http/https`
    );
  }

  // Hostname checks
  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new UrlValidationError(urlStr, 'Hostname blocked (private/reserved)');
  }

  for (const pattern of BLOCKED_IP_RANGES) {
    if (pattern.test(hostname)) {
      throw new UrlValidationError(urlStr, 'IP address blocked (private/reserved range)');
    }
  }

  // Allowlist enforcement
  if (config.allowedUrls.length > 0) {
    const domainAllowed = config.allowedUrls.some((allowed) => {
      const allowedLower = allowed.toLowerCase();
      return hostname === allowedLower || hostname.endsWith('.' + allowedLower);
    });
    if (!domainAllowed) {
      throw new UrlValidationError(
        urlStr,
        `Domain not in allowlist: ${config.allowedUrls.join(', ')}`
      );
    }
  }

  return parsed;
}

// ─── Rate Limiter (web-specific) ────────────────────────────

class WebRateLimiter {
  private timestamps: number[] = [];
  private maxPerMinute: number;

  constructor(maxPerMinute: number) {
    this.maxPerMinute = maxPerMinute;
  }

  check(): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const windowStart = now - 60_000;
    this.timestamps = this.timestamps.filter((t) => t > windowStart);

    if (this.timestamps.length >= this.maxPerMinute) {
      const oldest = this.timestamps[0]!;
      return { allowed: false, retryAfterMs: oldest + 60_000 - now };
    }

    this.timestamps.push(now);
    return { allowed: true, retryAfterMs: 0 };
  }
}

// ─── Fetch Helpers ──────────────────────────────────────────

async function safeFetch(
  urlStr: string,
  config: McpServiceConfig,
  webLimiter: WebRateLimiter
): Promise<{ body: string; finalUrl: string; contentType: string }> {
  const rate = webLimiter.check();
  if (!rate.allowed) {
    throw new Error(
      `Web rate limit exceeded (${config.webRateLimitPerMinute}/min). Retry after ${rate.retryAfterMs}ms.`
    );
  }

  let currentUrl = urlStr;
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    validateUrl(currentUrl, config);

    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'SecureYeoman-WebMCP/1.0 (bot)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    // Handle redirects manually (re-validate each hop)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without Location header');
      currentUrl = new URL(location, currentUrl).href;
      redirectCount++;
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') ?? 'text/html';
    const body = await response.text();

    return { body, finalUrl: currentUrl, contentType };
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}

function truncateOutput(text: string): string {
  const bytes = Buffer.byteLength(text, 'utf-8');
  if (bytes <= MAX_OUTPUT_BYTES) return text;

  // Truncate at byte boundary
  const buf = Buffer.from(text, 'utf-8');
  const truncated = buf.subarray(0, MAX_OUTPUT_BYTES).toString('utf-8');
  return truncated + '\n\n[OUTPUT TRUNCATED — exceeded 500KB limit]';
}

// ─── HTML to Markdown (lightweight) ─────────────────────────

function htmlToMarkdown(html: string): string {
  // Lazy-load node-html-markdown to avoid hard crash if not installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NodeHtmlMarkdown } = require('node-html-markdown') as {
      NodeHtmlMarkdown: { translate(html: string): string };
    };
    return NodeHtmlMarkdown.translate(html);
  } catch {
    // Fallback: strip tags manually
    return stripHtmlTags(html);
  }
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWithSelector(html: string, selector: string): string {
  // Basic CSS selector extraction (id and class only)
  const patterns: RegExp[] = [];

  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    patterns.push(
      new RegExp(
        `<[^>]+id=["']${escapeRegExp(id)}["'][^>]*>[\\s\\S]*?(?=<\\/[a-z]+>\\s*<[a-z])`,
        'i'
      )
    );
  } else if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    patterns.push(
      new RegExp(
        `<[^>]+class=["'][^"']*\\b${escapeRegExp(cls)}\\b[^"']*["'][^>]*>[\\s\\S]*?(?=<\\/[a-z]+>\\s*<[a-z])`,
        'i'
      )
    );
  } else {
    patterns.push(
      new RegExp(`<${escapeRegExp(selector)}[^>]*>[\\s\\S]*?<\\/${escapeRegExp(selector)}>`, 'gi')
    );
  }

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[0];
  }

  return html;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Search Backend ─────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function performSearch(
  query: string,
  config: McpServiceConfig,
  maxResults: number
): Promise<SearchResult[]> {
  switch (config.webSearchProvider) {
    case 'serpapi':
      return searchSerpApi(query, config.webSearchApiKey ?? '', maxResults);
    case 'tavily':
      return searchTavily(query, config.webSearchApiKey ?? '', maxResults);
    case 'duckduckgo':
    default:
      return searchDuckDuckGo(query, maxResults);
  }
}

async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent': 'SecureYeoman-WebMCP/1.0 (bot)',
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // Parse DuckDuckGo HTML results
  const resultPattern =
    /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = resultPattern.exec(html)) !== null && results.length < maxResults) {
    results.push({
      url: decodeURIComponent(match[1]!.replace(/.*uddg=/, '').replace(/&.*/, '')),
      title: stripHtmlTags(match[2]!),
      snippet: stripHtmlTags(match[3]!),
    });
  }

  return results;
}

async function searchSerpApi(
  query: string,
  apiKey: string,
  maxResults: number
): Promise<SearchResult[]> {
  if (!apiKey) throw new Error('SerpAPI requires MCP_WEB_SEARCH_API_KEY');

  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: 'google',
    num: String(maxResults),
  });

  const response = await fetch(`https://serpapi.com/search.json?${params}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`SerpAPI search failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    organic_results?: { title: string; link: string; snippet: string }[];
  };

  return (data.organic_results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
  }));
}

async function searchTavily(
  query: string,
  apiKey: string,
  maxResults: number
): Promise<SearchResult[]> {
  if (!apiKey) throw new Error('Tavily requires MCP_WEB_SEARCH_API_KEY');

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    results?: { title: string; url: string; content: string }[];
  };

  return (data.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }));
}

// ─── Tool Registration ──────────────────────────────────────

export function registerWebTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  const webLimiter = new WebRateLimiter(config.webRateLimitPerMinute);

  // 1. web_scrape_markdown — convert webpage to clean LLM-ready markdown
  server.tool(
    'web_scrape_markdown',
    'Scrape a webpage and convert to clean LLM-ready markdown (requires MCP_EXPOSE_WEB=true)',
    {
      url: z.string().describe('URL to scrape'),
    },
    wrapToolHandler('web_scrape_markdown', middleware, async (args) => {
      const { body, finalUrl } = await safeFetch(args.url, config, webLimiter);
      const markdown = htmlToMarkdown(body);
      const output = truncateOutput(`# Scraped: ${finalUrl}\n\n${markdown}`);
      return { content: [{ type: 'text' as const, text: output }] };
    })
  );

  // 2. web_scrape_html — raw HTML extraction with optional CSS selector
  server.tool(
    'web_scrape_html',
    'Scrape raw HTML from a webpage, optionally filtering by CSS selector (requires MCP_EXPOSE_WEB=true)',
    {
      url: z.string().describe('URL to scrape'),
      selector: z.string().optional().describe('CSS selector to extract (basic: #id, .class, tag)'),
    },
    wrapToolHandler('web_scrape_html', middleware, async (args) => {
      const { body, finalUrl } = await safeFetch(args.url, config, webLimiter);
      const html = args.selector ? extractWithSelector(body, args.selector) : body;
      const output = truncateOutput(html);
      return {
        content: [{ type: 'text' as const, text: `<!-- Source: ${finalUrl} -->\n${output}` }],
      };
    })
  );

  // 3. web_scrape_batch — parallel multi-URL scraping
  server.tool(
    'web_scrape_batch',
    'Scrape multiple URLs in parallel and return markdown (max 10 URLs, requires MCP_EXPOSE_WEB=true)',
    {
      urls: z.array(z.string()).min(1).max(MAX_BATCH_URLS).describe('URLs to scrape (max 10)'),
    },
    wrapToolHandler('web_scrape_batch', middleware, async (args) => {
      const results = await Promise.allSettled(
        args.urls.map(async (url: string) => {
          const { body, finalUrl } = await safeFetch(url, config, webLimiter);
          const markdown = htmlToMarkdown(body);
          return { url: finalUrl, markdown };
        })
      );

      const output = results
        .map((r, i) => {
          if (r.status === 'fulfilled') {
            return `## ${r.value.url}\n\n${r.value.markdown}`;
          }
          return `## ${args.urls[i]}\n\n**Error:** ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`;
        })
        .join('\n\n---\n\n');

      return { content: [{ type: 'text' as const, text: truncateOutput(output) }] };
    })
  );

  // 4. web_extract_structured — structured JSON extraction from pages
  server.tool(
    'web_extract_structured',
    'Extract structured data from a webpage as JSON based on a schema description (requires MCP_EXPOSE_WEB=true)',
    {
      url: z.string().describe('URL to extract data from'),
      fields: z
        .array(
          z.object({
            name: z.string().describe('Field name'),
            selector: z.string().optional().describe('CSS selector hint'),
            description: z.string().describe('What this field should contain'),
          })
        )
        .describe('Fields to extract'),
    },
    wrapToolHandler('web_extract_structured', middleware, async (args) => {
      const { body, finalUrl } = await safeFetch(args.url, config, webLimiter);
      const text = stripHtmlTags(body);

      // Best-effort extraction based on field descriptions
      const extracted: Record<string, string> = { _sourceUrl: finalUrl };
      for (const field of args.fields) {
        if (field.selector) {
          const selected = extractWithSelector(body, field.selector);
          extracted[field.name] = stripHtmlTags(selected).slice(0, 2000);
        } else {
          // Return raw text for AI to parse
          extracted[field.name] = `[Extract "${field.description}" from page text]`;
        }
      }

      // Include a text summary for AI processing
      extracted._pageText = text.slice(0, 10000);

      return {
        content: [
          { type: 'text' as const, text: truncateOutput(JSON.stringify(extracted, null, 2)) },
        ],
      };
    })
  );

  // 5. web_search — web search with configurable backend
  server.tool(
    'web_search',
    'Search the web using configurable search backend (requires MCP_EXPOSE_WEB=true)',
    {
      query: z.string().min(1).max(500).describe('Search query'),
      maxResults: z.number().int().min(1).max(20).default(10).describe('Maximum results to return'),
    },
    wrapToolHandler('web_search', middleware, async (args) => {
      const rate = webLimiter.check();
      if (!rate.allowed) {
        throw new Error(`Web rate limit exceeded. Retry after ${rate.retryAfterMs}ms.`);
      }

      const results = await performSearch(args.query, config, args.maxResults);

      const output =
        results.length === 0
          ? 'No results found.'
          : results
              .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
              .join('\n\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: `## Search: "${args.query}"\n\nProvider: ${config.webSearchProvider}\n\n${output}`,
          },
        ],
      };
    })
  );

  // 6. web_search_batch — batch search for research tasks
  server.tool(
    'web_search_batch',
    'Run multiple search queries in parallel for research (max 5 queries, requires MCP_EXPOSE_WEB=true)',
    {
      queries: z
        .array(z.string().min(1).max(500))
        .min(1)
        .max(MAX_BATCH_QUERIES)
        .describe('Search queries (max 5)'),
      maxResultsPerQuery: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(5)
        .describe('Max results per query'),
    },
    wrapToolHandler('web_search_batch', middleware, async (args) => {
      const results = await Promise.allSettled(
        args.queries.map(async (query: string) => {
          const rate = webLimiter.check();
          if (!rate.allowed) {
            throw new Error('Web rate limit exceeded');
          }
          const searchResults = await performSearch(query, config, args.maxResultsPerQuery);
          return { query, results: searchResults };
        })
      );

      const output = results
        .map((r, i) => {
          if (r.status === 'fulfilled') {
            const { query, results: searchResults } = r.value;
            const items =
              searchResults.length === 0
                ? '  No results found.'
                : searchResults
                    .map((sr, j) => `  ${j + 1}. **${sr.title}** — ${sr.url}\n     ${sr.snippet}`)
                    .join('\n');
            return `## "${query}"\n\n${items}`;
          }
          return `## "${args.queries[i]}"\n\n  **Error:** ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`;
        })
        .join('\n\n---\n\n');

      return { content: [{ type: 'text' as const, text: truncateOutput(output) }] };
    })
  );
}

// Exported for testing
export { validateUrl, WebRateLimiter, truncateOutput, htmlToMarkdown, stripHtmlTags };
