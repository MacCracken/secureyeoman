/**
 * MCP Service Configuration — loads config from environment variables,
 * then optionally enriches with secrets from core's SecretsManager.
 */

import { McpServiceConfigSchema, type McpServiceConfig } from '@secureyeoman/shared';

/**
 * Well-known secret names that can be stored in the dashboard Secrets panel
 * instead of .env.  Each maps a SecretsManager key → the McpServiceConfig field
 * it populates (env var takes precedence if set).
 */
export const MCP_SECRET_MAPPINGS: {
  secretName: string;
  configKey: string;
  envVar: string;
  label: string;
  category: string;
}[] = [
  // Search providers
  {
    secretName: 'MCP_WEB_SEARCH_API_KEY',
    configKey: 'webSearchApiKey',
    envVar: 'MCP_WEB_SEARCH_API_KEY',
    label: 'Web Search API Key (SerpAPI / Tavily)',
    category: 'Search',
  },
  {
    secretName: 'BRAVE_SEARCH_API_KEY',
    configKey: 'braveSearchApiKey',
    envVar: 'MCP_BRAVE_SEARCH_API_KEY',
    label: 'Brave Search API Key',
    category: 'Search',
  },
  {
    secretName: 'BING_SEARCH_API_KEY',
    configKey: 'bingSearchApiKey',
    envVar: 'MCP_BING_SEARCH_API_KEY',
    label: 'Bing Search API Key',
    category: 'Search',
  },
  {
    secretName: 'EXA_API_KEY',
    configKey: 'exaApiKey',
    envVar: 'MCP_EXA_API_KEY',
    label: 'Exa Neural Search API Key',
    category: 'Search',
  },
  {
    secretName: 'SEARXNG_URL',
    configKey: 'searxngUrl',
    envVar: 'MCP_SEARXNG_URL',
    label: 'SearXNG Instance URL',
    category: 'Search',
  },
  // Security
  {
    secretName: 'SHODAN_API_KEY',
    configKey: 'shodanApiKey',
    envVar: 'SHODAN_API_KEY',
    label: 'Shodan API Key',
    category: 'Security',
  },
  // Proxy providers
  {
    secretName: 'PROXY_BRIGHTDATA_URL',
    configKey: 'proxyBrightdataUrl',
    envVar: 'MCP_PROXY_BRIGHTDATA_URL',
    label: 'Bright Data Proxy URL',
    category: 'Proxy',
  },
  {
    secretName: 'PROXY_SCRAPINGBEE_KEY',
    configKey: 'proxyScrapingbeeKey',
    envVar: 'MCP_PROXY_SCRAPINGBEE_KEY',
    label: 'ScrapingBee API Key',
    category: 'Proxy',
  },
  {
    secretName: 'PROXY_SCRAPERAPI_KEY',
    configKey: 'proxyScraperapiKey',
    envVar: 'MCP_PROXY_SCRAPERAPI_KEY',
    label: 'ScraperAPI Key',
    category: 'Proxy',
  },
  // External services
  {
    secretName: 'AGNOSTIC_API_KEY',
    configKey: 'agnosticApiKey',
    envVar: 'AGNOSTIC_API_KEY',
    label: 'Agnostic QA API Key',
    category: 'Services',
  },
  {
    secretName: 'AGNOS_RUNTIME_API_KEY',
    configKey: 'agnosRuntimeApiKey',
    envVar: 'AGNOS_RUNTIME_API_KEY',
    label: 'AGNOS Runtime API Key',
    category: 'Services',
  },
  {
    secretName: 'AGNOS_GATEWAY_API_KEY',
    configKey: 'agnosGatewayApiKey',
    envVar: 'AGNOS_GATEWAY_API_KEY',
    label: 'AGNOS Gateway API Key',
    category: 'Services',
  },
  // QuickBooks
  {
    secretName: 'QUICKBOOKS_CLIENT_ID',
    configKey: 'quickBooksClientId',
    envVar: 'QUICKBOOKS_CLIENT_ID',
    label: 'QuickBooks Client ID',
    category: 'QuickBooks',
  },
  {
    secretName: 'QUICKBOOKS_CLIENT_SECRET',
    configKey: 'quickBooksClientSecret',
    envVar: 'QUICKBOOKS_CLIENT_SECRET',
    label: 'QuickBooks Client Secret',
    category: 'QuickBooks',
  },
  {
    secretName: 'QUICKBOOKS_REALM_ID',
    configKey: 'quickBooksRealmId',
    envVar: 'QUICKBOOKS_REALM_ID',
    label: 'QuickBooks Realm ID',
    category: 'QuickBooks',
  },
  {
    secretName: 'QUICKBOOKS_REFRESH_TOKEN',
    configKey: 'quickBooksRefreshToken',
    envVar: 'QUICKBOOKS_REFRESH_TOKEN',
    label: 'QuickBooks Refresh Token',
    category: 'QuickBooks',
  },
  // Delta
  {
    secretName: 'DELTA_URL',
    configKey: 'deltaUrl',
    envVar: 'DELTA_URL',
    label: 'Delta Instance URL',
    category: 'Services',
  },
  {
    secretName: 'DELTA_API_TOKEN',
    configKey: 'deltaApiToken',
    envVar: 'DELTA_API_TOKEN',
    label: 'Delta API Token',
    category: 'Services',
  },
];

import { readFileSync, unlinkSync } from 'node:fs';

/** Shared data volume path where core writes the token secret. */
const TOKEN_SECRET_PATH = '/home/secureyeoman/.secureyeoman/.token-secret';

/**
 * Read the token secret from the shared data volume (written by core's SecurityModule).
 * Deletes the file after reading to minimize the on-disk exposure window.
 * Falls back to undefined if the file doesn't exist.
 */
function readTokenSecretFile(): string | undefined {
  try {
    const secret = readFileSync(TOKEN_SECRET_PATH, 'utf8').trim();
    try {
      unlinkSync(TOKEN_SECRET_PATH);
    } catch {
      // deletion is best-effort
    }
    return secret || undefined;
  } catch {
    return undefined;
  }
}

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
    advertiseUrl: env.MCP_ADVERTISE_URL,
    tokenSecret: env.SECUREYEOMAN_TOKEN_SECRET || readTokenSecretFile(),
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
    braveSearchApiKey: env.MCP_BRAVE_SEARCH_API_KEY,
    bingSearchApiKey: env.MCP_BING_SEARCH_API_KEY,
    exaApiKey: env.MCP_EXA_API_KEY,
    searxngUrl: env.MCP_SEARXNG_URL,
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
    agnosticApiKey: env.AGNOSTIC_API_KEY,
    exposeAgnosTools: parseBool(env.MCP_EXPOSE_AGNOS_TOOLS, false),
    agnosRuntimeUrl: env.AGNOS_RUNTIME_URL ?? 'http://127.0.0.1:8090',
    agnosGatewayUrl: env.AGNOS_GATEWAY_URL ?? 'http://127.0.0.1:8088',
    agnosRuntimeApiKey: env.AGNOS_RUNTIME_API_KEY,
    agnosGatewayApiKey: env.AGNOS_GATEWAY_API_KEY,
    exposeQuickBooksTools: parseBool(env.MCP_EXPOSE_QUICKBOOKS_TOOLS, false),
    quickBooksEnvironment: (env.QUICKBOOKS_ENVIRONMENT ?? 'sandbox') as 'sandbox' | 'production',
    quickBooksClientId: env.QUICKBOOKS_CLIENT_ID,
    quickBooksClientSecret: env.QUICKBOOKS_CLIENT_SECRET,
    quickBooksRealmId: env.QUICKBOOKS_REALM_ID,
    quickBooksRefreshToken: env.QUICKBOOKS_REFRESH_TOKEN,
    respectContentSignal: parseBool(env.MCP_RESPECT_CONTENT_SIGNAL, true),
    allowBruteForce: parseBool(env.MCP_ALLOW_BRUTE_FORCE, false),
    exposeDockerTools: parseBool(env.MCP_EXPOSE_DOCKER, false),
    dockerMode: (env.MCP_DOCKER_MODE ?? 'socket') as 'socket' | 'dind',
    dockerHost: env.MCP_DOCKER_HOST,
    exposeBullshiftTools: parseBool(env.MCP_EXPOSE_BULLSHIFT_TOOLS, false),
    exposePhotisnadiTools: parseBool(env.MCP_EXPOSE_PHOTISNADI_TOOLS, false),
    exposeSynapseTools: parseBool(env.MCP_EXPOSE_SYNAPSE_TOOLS, false),
    exposeDeltaTools: parseBool(env.MCP_EXPOSE_DELTA_TOOLS, false),
    deltaUrl: env.DELTA_URL ?? 'http://localhost:8070',
    deltaApiToken: env.DELTA_API_TOKEN,
    exposeAequiTools: parseBool(env.MCP_EXPOSE_AEQUI_TOOLS, false),
    aequiUrl: env.AEQUI_URL ?? 'http://localhost:8060',
    exposeVoiceTools: parseBool(env.MCP_EXPOSE_VOICE_TOOLS, true),
  };

  return McpServiceConfigSchema.parse(raw);
}

/**
 * Enrich a config object with secrets from core's SecretsManager.
 * Env vars take precedence — secrets only fill in missing values.
 * Called once at MCP service startup after loadConfig().
 */
export async function enrichConfigWithSecrets(
  config: McpServiceConfig,
  coreClient: { post: <T>(path: string, body?: unknown) => Promise<T> }
): Promise<McpServiceConfig> {
  const secretNames = MCP_SECRET_MAPPINGS.map((m) => m.secretName);
  try {
    const { secrets } = await coreClient.post<{ secrets: Record<string, string> }>(
      '/api/v1/internal/secrets/resolve',
      { names: secretNames }
    );

    if (!secrets || Object.keys(secrets).length === 0) return config;

    const enriched = { ...config };
    for (const mapping of MCP_SECRET_MAPPINGS) {
      const secretValue = secrets[mapping.secretName];
      if (!secretValue) continue;
      // Env var takes precedence — only fill if the config field is empty/undefined
      const currentValue = (enriched as Record<string, unknown>)[mapping.configKey];
      if (!currentValue) {
        (enriched as Record<string, unknown>)[mapping.configKey] = secretValue;
      }
    }

    return McpServiceConfigSchema.parse(enriched);
  } catch {
    // Core unavailable at startup — proceed with env-only config
    return config;
  }
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
