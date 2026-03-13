# Contributing & Development Reference

Patterns, gotchas, and operational knowledge for working on the SecureYeoman codebase.

---

## Testing

### Running Tests

```bash
# Full suite (all projects)
npx vitest run

# Single file
npx vitest run src/foo/bar.test.ts

# Domain batch
npx vitest run src/gateway/

# Coverage (serial)
cd packages/core && npx vitest run --coverage

# Backend E2E (needs postgres)
npm run test:e2e

# Frontend E2E (Playwright)
npm run test:e2e:fe
```

### Vitest Config

- **`vitest.unit.config.ts`** (core): `fileParallelism: true`, `pool: 'forks'`
- **`vitest.db.config.ts`** (core): `fileParallelism: false`, `singleFork: true`
- **`vitest.e2e.config.ts`** (core): `src/__e2e__/**/*.e2e.test.ts`, serial, real HTTP + real DB
- **Root `vitest.config.ts`**: 5 projects — core:unit, core:db, core:e2e, dashboard, mcp
- **DB test detection**: grep `setupTestDb|teardownTestDb` + `initPool\(` — add to `DB_TEST_EXCLUDE` (unit) and `DB_TESTS` (db)
- **E2E tests**: `src/__e2e__/` excluded from unit config. Uses real `fetch()` against a Fastify server on OS-assigned port.
- **FE E2E**: Playwright config at `packages/dashboard/playwright.config.ts`, tests in `packages/dashboard/e2e/*.spec.ts`.

### Test Patterns

- **Mock pg pool**: `vi.mock('../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }))`
- **vi.hoisted()**: Use when `vi.mock()` factory references variables defined after it (temporal dead zone)
- **RetryManager**: Retries on "503" in error message → use `retryConfig: { maxRetries: 0 }` in error tests
- **apiCall mock**: Must include `headers: { get: (k) => k === 'content-type' ? 'application/json' : null }`
- **vi.mock() class constructors**: MUST use `function` keyword (not arrow) so `new X()` works
- **sendError()**: Sends `{ error, message, statusCode }` — check `.message` not `.error`
- **TanStack Query v5**: Use `userEvent.setup()` then `await user.click(btn)`. `mutationFn` receives `(vars, context)`.
- **Storage test naming**: Use `-store.test.ts` not `-storage.test.ts` to avoid vitest unit config exclusion
- **`node:crypto` default import mock**: Must use `importOriginal` to include `scrypt`
- **Shared package**: Exports source `.ts` directly — no rebuild needed for tests/typecheck

---

## Key Gotchas

### Fastify / Backend

- **Fastify overload**: `@fastify/websocket` creates type ambiguity on 3-arg `app.post()`. Fix: cast opts `as Record<string, unknown>`.
- **`PgBaseStorage.execute()`**: Returns `number` (rowCount) directly, not a `QueryResult`.
- **Pino log calls**: ALWAYS `log.info({ obj }, 'message')` not `log.info('message', { obj })`.
- **Route permissions**: Convention-based in `gateway/route-permissions.ts`. Non-standard routes use `permit()`.

### Dashboard / CSS

- **Tailwind preflight `img`**: `max-width: 100%; height: auto` can silently cap images. Fix: `maxWidth: 'none'` inline.
- **React 18 `onWheel` is passive**: `e.preventDefault()` is a no-op. Use native `{ passive: false }` listener.

### MCP Tool Registration

- **`packages/mcp/src/tools/manifest.ts`** is the ONLY source for AI-visible tools. Tools in `index.ts` but missing from `manifest.ts` are invisible.
- After updating, rebuild + restart MCP: `docker compose --env-file .env.dev build mcp && docker compose --env-file .env.dev up -d mcp`

---

## Workspace Package Resolution

- All workspace packages (`@secureyeoman/shared`, `@secureyeoman/mcp`, `@secureyeoman/core`) export source `.ts` files, NOT `dist/`
- This means `npm ci` alone is sufficient — no build step needed before lint/typecheck/tests
- The `build` job compiles to `dist/` for production binaries and Docker images only
- **Do NOT add build steps to CI test/lint/typecheck jobs**

---

## Release Checklist (Tagged Release)

Run ALL of these before tagging:

1. `npm run lint` — 0 errors
2. `npm run format:check` — all files pass (run `npm run format` first)
3. `npm run typecheck` — `tsc --noEmit` + dashboard tsconfig
4. `npm audit --audit-level=moderate` — security audit
5. `npx vitest run --project core:unit` — all unit tests
6. `npx vitest run --project dashboard` — dashboard tests
7. `npx vitest run --project mcp` — MCP tests
8. `npx vitest run --project core:db` — DB integration tests (needs postgres)
9. `npx vitest run --project core:e2e` — E2E tests (needs postgres)
10. `helm lint deploy/helm/secureyeoman` — Helm chart validation
11. `npm run build` — production build
12. `npm run build:binary` — production binary
13. `docker compose --env-file .env.dev --profile dev up --build -d` — dev with volumes/cache
14. `docker compose --env-file .env.dev --profile dev up --build -d --no-cache` with no volumes — clean build verification

---

## CI / Release Pipelines

- **CI (`ci.yml`)**: lint, typecheck, tests, security audit, Helm lint, and Docker build test (non-blocking)
- NO docker-push jobs in CI — those belong in `release-binary.yml`
- CI is reused as a quality gate via `workflow_call` from `release-binary.yml`
- Jobs with `packages: write` permission CANNOT be in CI (breaks `workflow_call` permission inheritance)

- **Release (`release-binary.yml`)**: Triggered by tag push or `workflow_dispatch`
- CI gate → build binaries → sign (cosign keyless) → SLSA provenance → GitHub Release
- Docker: `container` matrix job builds per-arch images (amd64 + arm64) using `docker/Dockerfile.release`
- GHCR push: `ghcr.io/maccracken/secureyeoman:{version}` + `latest`. Multi-arch manifest. Cosign-signed.

---

## Docker Dev Workflow

```bash
# Rebuild + restart (always use --env-file)
docker compose --env-file .env.dev --profile dev up --build -d

# Clean rebuild (no cache, no volumes)
docker compose --env-file .env.dev --profile dev down -v
docker compose --env-file .env.dev --profile dev build --no-cache
docker compose --env-file .env.dev --profile dev up -d
```

Dashboard uses Vite HMR — no rebuild needed for frontend changes in dev mode.

---

## Key Architecture Patterns

- **Alert manager lazy getter**: Training managers get `getAlertManager?: () => AlertManager | null` to avoid circular init.
- **`registerApiProxyTool()`** in MCP `tool-utils.ts`: Factory for GET/POST→JSON tools.
- **`fetchWithOAuthRetry()`** in `oauth-fetch.ts`: Shared by GitHub + Gmail routes.
- **Builtin skill registration**: ~26 total in `marketplace/storage.ts` BUILTIN_SKILLS array.
- **License enforcement**: `config.licensing.enforcement` (default `false`). `requiresLicense()` preHandler hook.
- **`McpFeaturesSchema`** per-personality gates: Must be added to hardcoded objects in `manager.ts`, `presets.ts`, `soul-routes.ts`.
- **SecurityModule multi-phase init**: initEarly (keyring/TLS) → initCore (RBAC/DLP/stores) → initPostAuth (SSO/rotation) → initLate (scanning/ATHI/SRA).

---

## External Service Integration

All integration code lives in SecureYeoman. External repos are read-only unless user grants permission.

### Service Contracts & Ports

| Service | Port | Key Endpoints |
|---------|------|---------------|
| AGNOSTIC (QA) | 8000 | `/api/v1/tasks`, `/api/v1/webhooks`, `/events` (SSE) |
| AGNOS (runtime) | 8090/8088 | `/v1/policies/landlock`, `/v1/chat/completions`, `/health` |
| BullShift (trading) | 8787 | `/api/portfolio`, `/api/orders`, `/api/market/:symbol` |
| Synapse (LLM) | 8420/8421 | `/api/v1/models`, `/api/v1/inference`, `/api/v1/training/jobs` |
| Delta (code forge) | 8070 | `/api/v1/repos`, `/api/v1/pulls`, `/api/v1/pipelines` |
| Shruti (DAW) | 8050 | `/api/v1/session`, `/api/v1/tracks`, `/api/v1/transport` |
| Aequi (accounting) | 8060 | TBD |

### MCP Tool Gating

| Prefix | Flag | File |
|--------|------|------|
| `agnostic_` | `exposeAgnosticTools` | `agnostic-tools.ts` |
| `agnos_` | `exposeAgnosTools` | `agnos-tools.ts` |
| `bullshift_` | always-on | `trading-tools.ts` |
| `delta_` | `exposeDeltaTools` | `delta-tools.ts` |
| `synapse_` | `exposeSynapseTools` | `synapse-tools.ts` |
| `shruti_` | `exposeShrutiTools` | `shruti-tools.ts` |
| `edge_` | `exposeEdgeTools` | `edge-tools.ts` |
| `voice_` | `exposeVoiceTools` | `voice-tools.ts` |

### Native Integration Routes (ADR 030)

Two auth patterns:
- **OAuth-based** (use `OAuthTokenService` + `fetchWithOAuthRetry`): Google Calendar, Google Workspace
- **Config-based** (use `IntegrationManager.listIntegrations()`): Linear, Todoist, Jira, Notion

| Platform | Route File | Endpoints |
|----------|-----------|-----------|
| Google Calendar | `integrations/googlecalendar/googlecalendar-routes.ts` | 7 |
| Google Workspace | `integrations/google-workspace-routes.ts` | 14 |
| Linear | `integrations/linear/linear-routes.ts` | 7 |
| Todoist | `integrations/todoist/todoist-routes.ts` | 6 |
| Jira | `integrations/jira/jira-routes.ts` | 8 |
| Notion | `integrations/notion/notion-routes.ts` | 7 |

All routes under `/api/v1/integrations/` auto-map to `integrations` RBAC resource (no `route-permissions.ts` changes needed).
`sendError()` sanitizes 500 messages to `'An internal error occurred'` — test expectations must match.

---

*Last updated: 2026-03-13*
