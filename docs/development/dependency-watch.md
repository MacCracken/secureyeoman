# Dependency Watch

> Tracked third-party dependencies with known issues that require upstream resolution before action can be taken.

Check these whenever running `npm update` or when the relevant packages release a new version. Do **not** attempt to force-fix entries here — each has been analysed and accepted as a known risk.

---

| Dependency | Severity | Advisory | Issue | Blocked By | Check When |
|---|---|---|---|---|---|
| `minimatch` (via `eslint` / `typescript-eslint`) | HIGH | GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74 | Multiple ReDoS advisories. All `eslint@9.x` and `@typescript-eslint/*` sub-packages depend on `minimatch <10.2.1`. Dev-only — zero production exposure. Fix requires ESLint v10 which requires `typescript-eslint` to publish an ESLint-v10-compatible release. Tried upgrading to ESLint v10 on 2026-02-21; failed — `typescript-eslint@8.x` uses removed `FlatESLint` from `eslint/use-at-your-own-risk`. Reverted to `eslint@^9.39.2`. | `typescript-eslint` publishing ESLint-v10 peer compat | Any `eslint`, `typescript-eslint`, or `minimatch` release |

---

## Resolved (no longer tracked)

| Dependency | Advisory | Resolved | Notes |
|---|---|---|---|
| `ajv@6.x` (via `eslint`) | GHSA-2g4f-4pwh-qvx6 | 2026-02-21 | Fixed by `npm audit fix`. ESLint internally upgraded its `ajv` usage. |
| `hono` | GHSA-gq3j-xvxp-8hrf | 2026-02-21 | Fixed by `npm audit fix`. Timing comparison hardening in `basicAuth`/`bearerAuth`. |
| `hono` | GHSA-xh87-mx6m-69f3 | 2026-02-27 | Fixed by `npm audit fix`. Authentication bypass via IP spoofing in AWS Lambda ALB conninfo. |
| `rollup` | GHSA-mw96-cpmx-2vgc | 2026-02-27 | Fixed by `npm audit fix`. Arbitrary file write via path traversal in bundler output. Dev-only (build toolchain). |
| `discord.js` v13→v14 upgrade | N/A | 2026-02-21 | `packages/core` upgraded from `^13.17.1` to `^14.25.1`. Adapter was already using v14 APIs — only the dep pin was wrong. Also removed stray root-level `discord.js` dependency. Reduced audit vulns from 17 → 14. |
| `undici` (via `discord.js@13`) | GHSA-g9mf-h72j-4rw9 | 2026-02-21 | Partially resolved — the v13 chain is gone. Remaining exposure was v14's bundled `undici@6.21.3` (see below). |
| `undici` (via `discord.js@14` / `@discordjs/rest`) | GHSA-g9mf-h72j-4rw9 | 2026-02-27 | Resolved without downgrading discord.js. `npm audit fix --force` would have reverted to `discord.js@13`. Fix applied by: (1) pinning `undici@6.23.0` as a direct dep in `packages/core`; (2) patching `package-lock.json` to replace the two nested `6.21.3` installs (`packages/core/node_modules/undici` and `node_modules/@discordjs/rest/node_modules/undici`) with `6.23.0` + correct integrity; (3) adding `"overrides": { "undici": "6.23.0" }` to root `package.json` to prevent regression on `npm install`. All 71 Discord adapter tests pass after upgrade. `npm audit` now reports 0 vulnerabilities. |
| `@types/express` missing | N/A | 2026-02-21 | Added `@types/express@^5.0.0` to `packages/core` devDependencies. Used as type-only import in `capture-permissions.ts`. |
| `@testing-library/dom` missing | N/A | 2026-02-21 | Added as explicit devDependency in `packages/dashboard`. Was a peer dep of `@testing-library/react` that npm was not hoisting. |
| `graphology-types` missing | N/A | 2026-02-21 | Added as explicit devDependency in `packages/dashboard`. Required by `graphology` for `AbstractGraph` type with full graph mutation API. |
| `@storybook/react` not found by TypeScript | N/A | 2026-02-21 | Added as explicit devDependency in `packages/dashboard`. Was only available as a nested dep inside `@storybook/react-vite/node_modules/`; TypeScript could not resolve it from there. |
| MCP SDK — `SSEServerTransport` | N/A | 2026-02-28 | Migrated to `StreamableHTTPServerTransport`. `sse.ts` removed; `McpTransportSchema` now `['stdio', 'streamable-http']`; `MCP_TRANSPORT=streamable-http` in `.env.dev`. |

---

## How to Use This File

1. **On `npm update`** — check every row. If the blocked-by condition has been resolved upstream, revisit the accepted-risk entry and decide whether to act.
2. **On a new CVE alert** — check whether the affected package appears here. If yes, update the `Issue` cell if the severity changed.
3. **To add an entry** — document the issue, the blocking condition, and when to re-check, then add a row here.

---

*Last updated: 2026-02-28 — SSEServerTransport migration complete; `sse.ts` removed, transport schema narrowed to `['stdio', 'streamable-http']`. Active tracked items: minimatch ReDoS (dev-only).*
