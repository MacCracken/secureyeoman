# ADR 030 — Native Integration MCP Tools & Multi-Search Aggregation

**Status**: Accepted
**Date**: 2026-03-06
**Changelog**: [2026.3.6]

## Context

SecureYeoman's 31 integration adapters (Connections) provide bidirectional messaging but agents cannot proactively interact with integration-specific APIs (e.g., create Linear issues, query Jira, manage Google Calendar events). Additionally, web search was limited to a single provider at a time, while competitors offer multi-source search aggregation across many engines.

## Decision

Three-layer approach:

1. **Multi-search aggregation** (`web_search_multi` MCP tool): Fan-out to all available search providers (DuckDuckGo, SerpAPI, Tavily, Brave, Bing, Exa, SearxNG) plus connected MCP search servers. Cross-source deduplication by URL domain+path, relevance ranking by provider agreement count.
2. **49 native MCP integration tools** across 6 platforms: Google Calendar (7), Linear (7), Todoist (6), Jira (8), Notion (7), Google Workspace — Drive/Sheets/Docs (14). Each MCP tool proxies through a core REST endpoint which handles credential resolution and external API calls. Two authentication patterns:
   - OAuth-based (Google Calendar, Google Workspace): `OAuthTokenService` with automatic token refresh via `fetchWithOAuthRetry`
   - Integration-config-based (Linear, Todoist, Jira, Notion): Credentials from `IntegrationManager.listIntegrations({ platform, enabled: true })`
3. **Secrets management pipeline**: Core `/api/v1/internal/secrets/resolve` endpoint returns decrypted secrets from SecretsManager. MCP `enrichConfigWithSecrets()` loads secrets at startup. Dashboard `ServiceKeysPanel` provides categorized UI for 16 well-known service keys. Env vars take precedence over stored secrets for backward compatibility.

## Consequences

- MCP tools are registered at the protocol level regardless of whether credentials exist; missing credentials return clear error messages guiding users to configure connections.
- No database migrations required — uses existing SecretsManager, OAuthTokenService, and IntegrationManager infrastructure.
- Route permissions handled by convention: all routes under `/api/v1/integrations/` map to the `integrations` RBAC resource via the existing PREFIX_RESOURCE_MAP.
- Multi-search gracefully degrades: providers without API keys are silently skipped; at least one provider (DuckDuckGo) requires no credentials.
- Google Workspace routes share the same OAuth token as Gmail (provider `google` or `gdrive`), avoiding duplicate auth flows.

## Files

| File | Purpose |
|------|---------|
| `packages/mcp/src/tools/web-tools.ts` | Multi-search aggregation (7 backends + MCP bridge) |
| `packages/mcp/src/tools/googlecalendar-tools.ts` | 7 Google Calendar MCP tools |
| `packages/mcp/src/tools/linear-tools.ts` | 7 Linear MCP tools |
| `packages/mcp/src/tools/todoist-tools.ts` | 6 Todoist MCP tools |
| `packages/mcp/src/tools/jira-tools.ts` | 8 Jira MCP tools |
| `packages/mcp/src/tools/notion-tools.ts` | 7 Notion MCP tools |
| `packages/mcp/src/tools/google-workspace-tools.ts` | 14 Google Drive/Sheets/Docs MCP tools |
| `packages/mcp/src/tools/manifest.ts` | 50 new manifest entries (414 total) |
| `packages/mcp/src/config/config.ts` | `MCP_SECRET_MAPPINGS`, `enrichConfigWithSecrets()` |
| `packages/core/src/integrations/googlecalendar/googlecalendar-routes.ts` | Google Calendar API v3 proxy (7 endpoints) |
| `packages/core/src/integrations/linear/linear-routes.ts` | Linear GraphQL API proxy (7 endpoints) |
| `packages/core/src/integrations/todoist/todoist-routes.ts` | Todoist REST API v2 proxy (6 endpoints) |
| `packages/core/src/integrations/jira/jira-routes.ts` | Jira REST API v3 proxy (8 endpoints) |
| `packages/core/src/integrations/notion/notion-routes.ts` | Notion API v1 proxy (7 endpoints) |
| `packages/core/src/integrations/google-workspace-routes.ts` | Google Drive v3 / Sheets v4 / Docs v1 proxy (14 endpoints) |
| `packages/core/src/gateway/server.ts` | Route registration for all 6 route groups |
| `packages/dashboard/src/components/SecuritySettings.tsx` | `ServiceKeysPanel` component |
| Tests (13+ files) | Coverage for all new tools and routes |
