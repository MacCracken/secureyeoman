# ADR-038: WebMCP Ecosystem Tools

**Status**: Accepted
**Date**: 2026-02-16
**Deciders**: Core team
**Phase**: 8 (WebMCP)

## Context

FRIDAY's roadmap (Phase 8) calls for WebMCP — web scraping, search, and browser automation. The MCP service already has a well-established toggleable feature pattern (git/filesystem) with environment variables, Zod schemas, API visibility filtering, persistent config, and dashboard toggles. We need to extend this pattern to add web capabilities as first-class tools while maintaining security (SSRF protection) and operational safety (rate limiting, output caps).

Additionally, external MCP server connections need health monitoring and credential management to be production-ready.

## Decision

### Web Tools (Phase 8.1–8.2)

Add 6 web tools following the exact same pattern as filesystem tools:

| Tool | Category | Description |
|------|----------|-------------|
| `web_scrape_markdown` | Scraping | HTML→markdown conversion |
| `web_scrape_html` | Scraping | Raw HTML with optional CSS selector |
| `web_scrape_batch` | Scraping | Parallel multi-URL (max 10) |
| `web_extract_structured` | Scraping | Field-based JSON extraction |
| `web_search` | Search | Single query with provider selection |
| `web_search_batch` | Search | Parallel queries (max 5) |

Tools are always registered at the MCP protocol level. Feature toggles (`exposeWeb`, `exposeWebScraping`, `exposeWebSearch`) control visibility in the core API response, not whether tools exist on the server.

### Browser Automation (Phase 8.3 — Complete)

6 browser tools implemented with Playwright (`browser_navigate`, `browser_screenshot`, `browser_click`, `browser_fill`, `browser_evaluate`, `browser_pdf`). A `BrowserPool` manager handles lazy browser launch, page pool with `MCP_BROWSER_MAX_PAGES` limit, `MCP_BROWSER_TIMEOUT_MS` enforcement, and graceful shutdown. Playwright is an optional dependency — tools return "not available" when `exposeBrowser` is false or Playwright is not installed.

### Security: SSRF Protection

All web tool requests go through `validateUrl()` which:
- Blocks private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 0.x)
- Blocks link-local/cloud metadata (169.254.x, metadata.google.internal)
- Only allows `http:` and `https:` protocols
- Enforces URL domain allowlist when `MCP_ALLOWED_URLS` is set
- Limits redirects to 3 hops with re-validation per hop

### Rate Limiting

Web-specific rate limiter (sliding window, 10 req/min default) independent of per-tool rate limiter. Configurable via `MCP_WEB_RATE_LIMIT`.

### Output Safety

500KB output cap per tool call with `[OUTPUT TRUNCATED]` marker.

### Health Monitoring (Phase 8.6)

`McpHealthMonitor` provides periodic health checks (60s default) for external MCP servers:
- HTTP ping for remote servers, tool count check for stdio
- Tracks latency, consecutive failures
- Auto-disables server after configurable threshold (default 5 failures)
- Health status: healthy, degraded, unhealthy, unknown

### Credential Management (Phase 8.6)

`McpCredentialManager` provides encrypted credential storage:
- AES-256-GCM encryption at rest
- Key derived from `SECUREYEOMAN_TOKEN_SECRET` via SHA-256 + salt
- Credentials injected into server spawn environment on connect
- API exposes keys only, never decrypted values

## Consequences

### Positive
- Web scraping and search available as first-class MCP tools with full security enforcement
- Follows established toggleable feature pattern — no architectural changes needed
- Health monitoring reduces manual monitoring burden for external servers
- Credential management eliminates plaintext API keys in server env config

### Negative
- Browser automation deferred (requires Playwright/Puppeteer dependency)
- DuckDuckGo HTML scraping may be fragile across updates
- Health monitoring adds periodic DB writes for each server check

### Risks
- DuckDuckGo may rate-limit or block the bot user-agent
- SerpAPI/Tavily API costs scale with usage
- CSS selector extraction is basic (id, class, tag only) — not a full CSS engine

## Alternatives Considered

1. **External MCP servers only (Bright Data, Firecrawl)**: Rejected — adds external dependency, cost, and requires user signup for basic functionality
2. **Puppeteer for all scraping**: Rejected — heavy dependency, most scraping doesn't need a browser
3. **No rate limiting**: Rejected — risk of accidental DDoS or cost overrun with SerpAPI/Tavily
4. **Plaintext credential storage**: Rejected — unacceptable for API keys at rest
