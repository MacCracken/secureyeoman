# Dependency Watch

> Tracked third-party dependencies with known issues that require upstream resolution before action can be taken.

Check these whenever running `npm update` or when the relevant packages release a new version. Do **not** attempt to force-fix entries here — each has been analysed and accepted as a known risk.

---

| Dependency | Severity | Advisory | Issue | Blocked By | Check When |
|---|---|---|---|---|---|
| `minimatch` (via `eslint` / `typescript-eslint`) | HIGH | GHSA-3ppc-4f35-3m26 | ReDoS via repeated wildcards with non-matching literal. All `eslint@9.x` and `@typescript-eslint/*` sub-packages depend on `minimatch <10.2.1`. Dev-only — zero production exposure. Fix requires ESLint v10 which requires `typescript-eslint` to publish an ESLint-v10-compatible release. Tried upgrading to ESLint v10 on 2026-02-21; failed — `typescript-eslint@8.x` uses removed `FlatESLint` from `eslint/use-at-your-own-risk`. Reverted to `eslint@^9.39.2`. | `typescript-eslint` publishing ESLint-v10 peer compat | Any `eslint`, `typescript-eslint`, or `minimatch` release |
| `undici` (via `discord.js` / `@discordjs/rest`) | MODERATE | GHSA-g9mf-h72j-4rw9 | Unbounded decompression chain via `Content-Encoding` — resource exhaustion. `discord.js@14.25.1` bundles `undici@6.21.3`; fix requires `>=6.23.0`. `npm audit fix --force` is not the right path — it would downgrade discord.js. | `discord.js` releasing a patch that bumps its bundled `undici` to `>=6.23.0` | Any `discord.js` patch release |
| MCP SDK — `SSEServerTransport` | N/A (deprecation) | — | `SSEServerTransport` deprecated in favour of `StreamableHTTPServerTransport`. Retained in `packages/mcp/src/transport/sse.ts` for legacy client compatibility; deprecation warnings suppressed. | Migration requires client-side transport compatibility verification. | MCP SDK releases |

---

## Resolved (no longer tracked)

| Dependency | Advisory | Resolved | Notes |
|---|---|---|---|
| `ajv@6.x` (via `eslint`) | GHSA-2g4f-4pwh-qvx6 | 2026-02-21 | Fixed by `npm audit fix`. ESLint internally upgraded its `ajv` usage. |
| `hono` | GHSA-gq3j-xvxp-8hrf | 2026-02-21 | Fixed by `npm audit fix`. Timing comparison hardening in `basicAuth`/`bearerAuth`. |
| `discord.js` v13→v14 upgrade | N/A | 2026-02-21 | `packages/core` upgraded from `^13.17.1` to `^14.25.1`. Adapter was already using v14 APIs — only the dep pin was wrong. Also removed stray root-level `discord.js` dependency. Reduced audit vulns from 17 → 14. |
| `undici` (via `discord.js@13`) | GHSA-g9mf-h72j-4rw9 | 2026-02-21 | Partially resolved — the v13 chain is gone. Remaining exposure is v14's bundled `undici@6.21.3` (see active table). |
| `@types/express` missing | N/A | 2026-02-21 | Added `@types/express@^5.0.0` to `packages/core` devDependencies. Used as type-only import in `capture-permissions.ts`. |
| `@testing-library/dom` missing | N/A | 2026-02-21 | Added as explicit devDependency in `packages/dashboard`. Was a peer dep of `@testing-library/react` that npm was not hoisting. |
| `graphology-types` missing | N/A | 2026-02-21 | Added as explicit devDependency in `packages/dashboard`. Required by `graphology` for `AbstractGraph` type with full graph mutation API. |
| `@storybook/react` not found by TypeScript | N/A | 2026-02-21 | Added as explicit devDependency in `packages/dashboard`. Was only available as a nested dep inside `@storybook/react-vite/node_modules/`; TypeScript could not resolve it from there. |

---

## How to Use This File

1. **On `npm update`** — check every row. If the blocked-by condition has been resolved upstream, revisit the accepted-risk entry and decide whether to act.
2. **On a new CVE alert** — check whether the affected package appears here. If yes, update the `Issue` cell if the severity changed.
3. **To add an entry** — document the issue, the blocking condition, and when to re-check, then add a row here.

---

*Last updated: 2026-02-21 — discord.js v13→v14, @types/express, @testing-library/dom, graphology-types, @storybook/react resolved; minimatch and undici (v14 chain) remain active*
