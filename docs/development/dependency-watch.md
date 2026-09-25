# Dependency Watch

> Tracked third-party dependencies with known issues that require upstream resolution before action can be taken.

Check these whenever running `npm update` or when the relevant packages release a new version. Do **not** attempt to force-fix entries here — each has been analysed and accepted as a known risk.

---

| Dependency | Severity | Advisory | Issue | Blocked By | Check When |
|---|---|---|---|---|---|
| `yauzl` <3.2.1 (via `@capacitor/cli` → `native-run`) | MODERATE | GHSA-gmq8-994r-jv83 | Off-by-one error in ZIP parsing. Only affects Capacitor CLI (mobile build tooling), not production runtime. `npm audit fix --force` would downgrade `@capacitor/cli` to v2 (breaking). Not surfaced by `npm audit` (nested optional dev dep), but still present at `node_modules/yauzl@2.10.0`. | `native-run` releasing with `yauzl@>=3.2.1` | Any `@capacitor/cli` or `native-run` release |

---

## How to Use This File

1. **On `npm update`** — check every row. If the blocked-by condition has been resolved upstream, revisit the accepted-risk entry and decide whether to act.
2. **On a new CVE alert** — check whether the affected package appears here. If yes, update the `Issue` cell if the severity changed.
3. **To add an entry** — document the issue, the blocking condition, and when to re-check, then add a row here.

---

## npm audit Summary (2026-09-25)

`npm audit` reports **0 vulnerabilities** (was 50 before this refresh: 1 critical, 20 high, 26 moderate, 3 low — accumulated since the 0.5.1 clean slate).

**Fixes applied in the 2026-09-25 refresh:**

- In-range `npm update` across all workspaces (286 packages) — cleared the `tar` critical and most highs (`axios`, `vite`, `postcss`, `react-router`, `fastify`/`find-my-way`, `hono`, `form-data`, `fast-uri`, `@xmldom/xmldom`, `brace-expansion`, `immutable`, `ip-address`, `imapflow`).
- Root override pins that had themselves become the vulnerable versions were raised: `undici` 6.25.0 → 6.29.0 (discord.js subtrees), `dompurify` 3.4.0 → 3.4.16, `nanoid` 5.1.9 → 5.1.16, `protobufjs` 8.6.1 → 8.8.0; `serialize-javascript` 7.0.5 → 7.1.2.
- New scoped override `xcode` → `uuid` 11.1.1 (`@capacitor/cli` → `xcode` 3.0.1 pinned `uuid@7`, GHSA-w5hq-g745-h8pq). `xcode` calls only `uuid.v4()`, which uuid 11 still exports for CommonJS; verified with `generateUuid()`.
- Majors in `packages/core`, each checked against its changelog: `@fastify/static` 9 → 10 (only `setHeaders` precedence + content-disposition 2 changed; unused here), `nodemailer` 8 → 10 (TLS verification on remote-content fetch by default; Node ≥ 20; ships its own types, so `@types/nodemailer` was dropped), `@opentelemetry/exporter-trace-otlp-grpc` 0.214 → 0.222 (dev).
- **Resolved upstream:** the mermaid XSS chain (GHSA-7rqq-prvp-x9jh) tracked here since 0.5.0 — `@excalidraw/mermaid-to-excalidraw` 2.2.2 now depends on `mermaid ^11.12.1`, so the tree carries a single `mermaid` 11.17.2.

Rust side for the same date: `cargo audit` 0 advisories (was 2: RUSTSEC-2026-0185 `quinn-proto`, RUSTSEC-2026-0285 `rustls`) and `cargo deny check` green (was failing on the `rustls` advisory + yanked `spin` 0.9.8).

---

*Last updated: 2026-09-25 — 1 active item (`yauzl` via `@capacitor/cli` → `native-run`, dev-only, not surfaced by `npm audit`). The mermaid XSS chain was resolved upstream.*
