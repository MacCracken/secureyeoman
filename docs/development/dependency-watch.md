# Dependency Watch

> Tracked third-party dependencies with known issues that require upstream resolution before action can be taken.

Check these whenever running `npm update` or when the relevant packages release a new version. Do **not** attempt to force-fix entries here — each has been analysed and accepted as a known risk.

---

| Dependency | Severity | Advisory | Issue | Blocked By | Check When |
|---|---|---|---|---|---|
| `undici` <=6.23.0 (via `discord.js@14` / `@discordjs/rest`) | HIGH | GHSA-f269-vfmq-vjvj, GHSA-2mjp-6q6p-2qxm, GHSA-vrm6-8vpv-qv8q, GHSA-v9p9-hfj2-hcw8, GHSA-4992-7rv2-5pvq | 5 advisories: WebSocket 64-bit length overflow, HTTP request smuggling, WebSocket permessage-deflate memory exhaustion, invalid server_max_window_bits crash, CRLF injection via upgrade option. Current override pins `undici@6.23.0` which is still vulnerable. `npm audit fix --force` would downgrade `discord.js` to v13 (breaking). **`discord.js@15.0.0-dev` bundles `undici@7.22.0` which resolves all 5.** Waiting for v15 stable release. | `discord.js@15` stable release | Any `discord.js` stable release |
| `yauzl` <3.2.1 (via `@capacitor/cli` → `native-run`) | MODERATE | GHSA-gmq8-994r-jv83 | Off-by-one error in ZIP parsing. Only affects Capacitor CLI (mobile build tooling), not production runtime. `npm audit fix --force` would downgrade `@capacitor/cli` to v2 (breaking). | `native-run` releasing with `yauzl@>=3.2.1` | Any `@capacitor/cli` or `native-run` release |
| `minimatch` (via `eslint` / `typescript-eslint`) | HIGH | GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74 | Multiple ReDoS advisories. Dev-only — zero production exposure. Fix requires ESLint v10 which requires `typescript-eslint` to publish an ESLint-v10-compatible release. | `typescript-eslint` publishing ESLint-v10 peer compat | Any `eslint` or `typescript-eslint` release |

---

## How to Use This File

1. **On `npm update`** — check every row. If the blocked-by condition has been resolved upstream, revisit the accepted-risk entry and decide whether to act.
2. **On a new CVE alert** — check whether the affected package appears here. If yes, update the `Issue` cell if the severity changed.
3. **To add an entry** — document the issue, the blocking condition, and when to re-check, then add a row here.

---

*Last updated: 2026-03-15 — 3 active items. mermaid XSS resolved by overriding `@excalidraw/mermaid-to-excalidraw` to `2.1.1` (mermaid `^11.12.1`). undici will be resolved by discord.js v15 stable (dev channel already bundles undici@7.22.0). yauzl blocked by Capacitor CLI (dev-only). minimatch blocked by ESLint v10 (dev-only).*
