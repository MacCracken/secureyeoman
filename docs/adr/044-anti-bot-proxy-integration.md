# ADR 044: Anti-Bot & Proxy Integration

## Status

Accepted — February 2026

## Context

SecureYeoman's MCP service provides web scraping, search, and browser automation tools that make direct HTTP requests. While this works for basic use cases, production web scraping frequently encounters anti-bot protections including CAPTCHAs (reCAPTCHA, hCaptcha, Cloudflare Challenge), IP-based rate limiting and blocking, and geo-restrictions that return different content based on the requester's location.

These challenges require proxy rotation to distribute requests across different IP addresses, CAPTCHA detection to identify when requests are being blocked, retry logic with exponential backoff to handle transient failures gracefully, and geo-targeting to access region-specific content.

## Decision

Implement a provider-agnostic proxy rotation layer with the following design:

### Architecture

- **ProxyManager class** — Manages multiple proxy providers with round-robin or random selection strategies
- **Provider interface** — Simple URL formatters with no SDK dependencies; two types:
  - `http-proxy`: Passes proxy server URL (Bright Data)
  - `api-rewrite`: Replaces target URL entirely (ScrapingBee, ScraperAPI)
- **CAPTCHA detection** — Heuristic response analysis checking for known CAPTCHA patterns in 403/429 responses
- **Retry logic** — Exponential backoff with jitter (`min(base * 2^attempt + random jitter, maxDelay)`)
- **Feature toggle** — `MCP_PROXY_ENABLED` (default: false) for zero impact when disabled

### Providers

Three built-in providers, each ~15 lines of URL formatting logic:

1. **Bright Data** — HTTP proxy style (`http://user-country-XX:pass@brd.superproxy.io:port`)
2. **ScrapingBee** — API rewrite (`https://app.scrapingbee.com/api/v1/?api_key=KEY&url=TARGET`)
3. **ScraperAPI** — API rewrite (`https://api.scraperapi.com/?api_key=KEY&url=TARGET`)

### Integration Points

- **Web tools** (`safeFetch`) — Proxy URL substitution, CAPTCHA detection, retry wrapper
- **Browser tools** (Playwright) — Proxy config passed to `chromium.launch()` for HTTP-proxy type providers
- **SSRF protection** — Validation always applies to the original target URL, not the proxy URL

## Alternatives Considered

### Built-in CAPTCHA Solver
Too complex, unreliable, and potentially against terms of service. Proxy providers handle CAPTCHA solving on their end.

### Single Provider Lock-in
Would limit flexibility and create vendor dependency. The provider interface is simple enough (~15 lines each) to support multiple options.

### undici ProxyAgent
Unnecessary complexity for API-style proxy services that use URL rewriting. Only HTTP-proxy style providers (Bright Data) would benefit, and Playwright has native proxy support.

### Always-on Proxy
Would increase latency and cost for every request. Feature toggle ensures proxy is only used when explicitly needed.

## Consequences

### Positive
- Anti-bot bypass via rotating residential/datacenter IPs
- Geo-targeting for region-specific content
- No new npm dependencies (pure URL formatting)
- Zero impact when disabled (feature toggle)
- Provider-agnostic — easy to add new providers

### Negative
- Proxy service costs (external subscription required)
- Provider API changes may require URL format updates
- CAPTCHA detection is heuristic-based (may miss novel patterns)
- HTTP-proxy type only works with Playwright (API-rewrite providers don't support browser proxy)
