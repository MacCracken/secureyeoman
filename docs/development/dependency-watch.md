# Dependency Watch

> Tracked third-party dependencies with known issues that require upstream resolution before action can be taken.

Check these whenever running `npm update` or when the relevant packages release a new version. Do **not** attempt to force-fix entries here — each has been analysed and accepted as a known risk.

---

| Dependency | Severity | Advisory | Issue | Blocked By | Check When |
|---|---|---|---|---|---|
| `minimatch` (via `eslint` / `typescript-eslint`) | HIGH | GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74 | Multiple ReDoS advisories. All `eslint@9.x` and `@typescript-eslint/*` sub-packages depend on `minimatch <10.2.1`. Dev-only — zero production exposure. Fix requires ESLint v10 which requires `typescript-eslint` to publish an ESLint-v10-compatible release. Tried upgrading to ESLint v10 on 2026-02-21; failed — `typescript-eslint@8.x` uses removed `FlatESLint` from `eslint/use-at-your-own-risk`. Reverted to `eslint@^9.39.2`. | `typescript-eslint` publishing ESLint-v10 peer compat | Any `eslint`, `typescript-eslint`, or `minimatch` release |
| `dompurify` 3.1.6 (bundled in `@excalidraw/mermaid-to-excalidraw@1.1.2`) | MODERATE | GHSA-vhxf-7vqr-mrjg, GHSA-v8jm-5vwx-cfxm, GHSA-v2wj-7wpq-c8vv | 3 XSS bypass advisories. Bundled inside `@excalidraw/mermaid-to-excalidraw`'s vendored `node_modules` — npm overrides cannot reach it. Our direct `dompurify@3.3.2` (hoisted) is safe; this only affects Excalidraw's internal mermaid→SVG rendering. Mitigated: Excalidraw output is rendered into a sandboxed canvas, not raw DOM. | `@excalidraw/mermaid-to-excalidraw@2.x` stable release (currently `2.0.0-rc4`) | Any `@excalidraw/excalidraw` or `@excalidraw/mermaid-to-excalidraw` release |
| `dompurify` 3.2.7 (bundled in `monaco-editor@0.55.1`) | MODERATE | GHSA-vhxf-7vqr-mrjg, GHSA-v8jm-5vwx-cfxm, GHSA-v2wj-7wpq-c8vv | Same 3 XSS bypass advisories. Monaco bundles its own `dompurify` in `node_modules/monaco-editor/node_modules/dompurify`. Our code never passes untrusted HTML through Monaco's sanitizer. | `monaco-editor` releasing a version with `dompurify >=3.3.2` | Any `monaco-editor` release |
| `nanoid` 3.3.3 / 4.0.2 (bundled in `@excalidraw/*`) | MODERATE | GHSA-mwcw-c2x4-8c55 | Predictable results when given non-integer size. Bundled inside `@excalidraw/excalidraw` (3.3.3) and `@excalidraw/mermaid-to-excalidraw` (4.0.2). Used only for internal element IDs — not for security tokens or secrets. Zero security impact. | `@excalidraw/excalidraw` updating its bundled nanoid | Any `@excalidraw/excalidraw` release |

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
| `tar` (via `@capacitor/cli@6`) | GHSA-r6q2-hw4h-h46w, GHSA-34x7-hfp2-rc4v, GHSA-8qq5-rm4j-mr97, GHSA-83g3-92jg-28cx | 2026-03-02 | Upgraded `@capacitor/*` from `^6` to `^8` in `packages/mobile`. Capacitor v8 drops the vulnerable `tar` transitive dep. All 4 HIGH advisories resolved. `npm audit` reports 0 vulnerabilities. |
| `hono` <=4.12.3 | GHSA-5pq2-9x2x-5p6w, GHSA-p6xx-57qc-3wxr, GHSA-q5qw-h33p-qvwr | 2026-03-06 | Fixed by `npm audit fix`. Cookie attribute injection, SSE control field injection, and arbitrary file access via `serveStatic`. |
| `@hono/node-server` <1.19.10 | GHSA-wc8c-qw6v-h7f6 | 2026-03-06 | Fixed by `npm audit fix`. Authorization bypass for protected static paths via encoded slashes. |
| `fastify` 5.7.2-5.8.0 | GHSA-573f-x89g-hqp9 | 2026-03-06 | Fixed by `npm audit fix`. Missing end anchor in `subtypeNameReg` allowed malformed Content-Types to pass validation. |
| `tar` <=7.5.9 | GHSA-qffp-2rhf-9h96 | 2026-03-06 | Fixed by `npm audit fix`. Hardlink path traversal via drive-relative linkpath. |
| `dompurify` (direct) 3.2.4→3.3.2 | GHSA-vhxf-7vqr-mrjg, GHSA-v8jm-5vwx-cfxm, GHSA-v2wj-7wpq-c8vv | 2026-03-06 | Upgraded direct dep from `^3.2.4` to `^3.3.2`. Dashboard and top-level mermaid imports now resolve to 3.3.2. Root `package.json` also declares `dompurify@^3.3.2` to ensure hoisted version is patched. |

---

## How to Use This File

1. **On `npm update`** — check every row. If the blocked-by condition has been resolved upstream, revisit the accepted-risk entry and decide whether to act.
2. **On a new CVE alert** — check whether the affected package appears here. If yes, update the `Issue` cell if the severity changed.
3. **To add an entry** — document the issue, the blocking condition, and when to re-check, then add a row here.

---

*Last updated: 2026-03-06 — Security audit: `npm audit fix` resolved 4 HIGH vulns (hono, @hono/node-server, fastify, tar). Direct `dompurify` upgraded to 3.3.2. Remaining 6 moderate vulns are bundled inside `@excalidraw/*` and `monaco-editor` — awaiting upstream releases. Active tracked items: minimatch ReDoS (dev-only), excalidraw bundled dompurify/nanoid (moderate, mitigated).*
