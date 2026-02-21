/**
 * MCP Service Configuration — loads config from environment variables.
 */

import { McpServiceConfigSchema, type McpServiceConfig } from '@secureyeoman/shared';

export function loadConfig(
  env: Record<string, string | undefined> = process.env
): McpServiceConfig {
  const raw = {
    enabled: parseBool(env.MCP_ENABLED, true),
    port: parseIntSafe(env.MCP_PORT, 3001),
    host: env.MCP_HOST ?? '127.0.0.1',
    transport: env.MCP_TRANSPORT ?? 'streamable-http',
    autoRegister: parseBool(env.MCP_AUTO_REGISTER, true),
    coreUrl: env.MCP_CORE_URL ?? 'http://127.0.0.1:18789',
    tokenSecret: env.SECUREYEOMAN_TOKEN_SECRET,
    exposeFilesystem: parseBool(env.MCP_EXPOSE_FILESYSTEM, false),
    allowedPaths: env.MCP_ALLOWED_PATHS
      ? env.MCP_ALLOWED_PATHS.split(',')
          .map((p) => p.trim())
          .filter(Boolean)
      : [],
    exposeWeb: parseBool(env.MCP_EXPOSE_WEB, false),
    allowedUrls: env.MCP_ALLOWED_URLS
      ? env.MCP_ALLOWED_URLS.split(',')
          .map((u) => u.trim())
          .filter(Boolean)
      : [],
    webRateLimitPerMinute: parseIntSafe(env.MCP_WEB_RATE_LIMIT, 10),
    exposeWebScraping: parseBool(env.MCP_EXPOSE_WEB_SCRAPING, true),
    exposeWebSearch: parseBool(env.MCP_EXPOSE_WEB_SEARCH, true),
    webSearchProvider: env.MCP_WEB_SEARCH_PROVIDER ?? 'duckduckgo',
    webSearchApiKey: env.MCP_WEB_SEARCH_API_KEY,
    exposeBrowser: parseBool(env.MCP_EXPOSE_BROWSER, false),
    browserEngine: env.MCP_BROWSER_ENGINE ?? 'playwright',
    browserHeadless: parseBool(env.MCP_BROWSER_HEADLESS, true),
    browserMaxPages: parseIntSafe(env.MCP_BROWSER_MAX_PAGES, 3),
    browserTimeoutMs: parseIntSafe(env.MCP_BROWSER_TIMEOUT_MS, 30000),
    rateLimitPerTool: parseIntSafe(env.MCP_RATE_LIMIT_PER_TOOL, 30),
    logLevel: env.MCP_LOG_LEVEL ?? 'info',
    proxyEnabled: parseBool(env.MCP_PROXY_ENABLED, false),
    proxyProviders: env.MCP_PROXY_PROVIDERS
      ? env.MCP_PROXY_PROVIDERS.split(',')
          .map((p) => p.trim())
          .filter(Boolean)
      : [],
    proxyStrategy: env.MCP_PROXY_STRATEGY ?? 'round-robin',
    proxyDefaultCountry: env.MCP_PROXY_DEFAULT_COUNTRY,
    proxyBrightdataUrl: env.MCP_PROXY_BRIGHTDATA_URL,
    proxyScrapingbeeKey: env.MCP_PROXY_SCRAPINGBEE_KEY,
    proxyScraperapiKey: env.MCP_PROXY_SCRAPERAPI_KEY,
    proxyMaxRetries: parseIntSafe(env.MCP_PROXY_MAX_RETRIES, 3),
    proxyRetryBaseDelayMs: parseIntSafe(env.MCP_PROXY_RETRY_BASE_DELAY_MS, 1000),
    exposeSecurityTools: parseBool(env.MCP_EXPOSE_SECURITY_TOOLS, false),
    securityToolsMode: (env.MCP_SECURITY_TOOLS_MODE ?? 'native') as 'native' | 'docker-exec',
    securityToolsContainer: env.MCP_SECURITY_TOOLS_CONTAINER ?? 'kali-sy-toolkit',
    allowedTargets: env.MCP_ALLOWED_TARGETS
      ? env.MCP_ALLOWED_TARGETS.split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    shodanApiKey: env.SHODAN_API_KEY,
    exposeAgnosticTools: parseBool(env.MCP_EXPOSE_AGNOSTIC_TOOLS, false),
    agnosticUrl: env.AGNOSTIC_URL ?? 'http://127.0.0.1:8000',
    agnosticEmail: env.AGNOSTIC_EMAIL,
    agnosticPassword: env.AGNOSTIC_PASSWORD,
  };

  return McpServiceConfigSchema.parse(raw);
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

function parseIntSafe(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}
