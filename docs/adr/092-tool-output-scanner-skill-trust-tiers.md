# ADR 092 — ToolOutputScanner & Skill Trust Tiers

**Status:** Accepted
**Date:** 2026-02-21

---

## Context

Two related security gaps were identified in a comparative analysis against [nearai/ironclaw](https://github.com/nearai/ironclaw), a Rust-based privacy-first agent with strong sandbox depth and memory architecture.

### Gap 1 — Tool-output credential leak

A shell tool that echoes `$AWS_SECRET_ACCESS_KEY`, or a web-fetch that returns a page containing an API key, currently flows straight into the model context and is subsequently returned to the caller verbatim. This is a real exfiltration path: the LLM processes the secret and may echo it back in its response.

The existing `secrets.ts` keyring knows the shape of managed secrets, but provides no mechanism to detect those values — or common secret patterns — when they appear in tool outputs or LLM responses.

### Gap 2 — Community skill over-privilege

Community-sourced skills (`source === 'community'`) are currently granted the same tool access as user-authored skills — including shell execution, file writes, and arbitrary HTTP. The `source` field already exists on `BrainSkill`; it is not used at dispatch time.

An unvetted community skill can instruct the model to run `execute_shell` or `http_post`, giving it effectively the same capability as a trusted skill written by the operator.

---

## Decision

### 1. ToolOutputScanner (`packages/core/src/security/tool-output-scanner.ts`)

A new `ToolOutputScanner` class scans text for credential patterns and replaces matches with `[REDACTED:<type>]`.

**Pattern registry:** 18 built-in patterns covering:
- OpenAI (`sk-…`) and Anthropic (`sk-ant-…`) API keys
- GitHub PAT variants (`ghp_`, `github_pat_`, `gho_`, `ghs_`, `ghr_`)
- AWS access key IDs (`AKIA…`) and secret key assignments
- PEM private key blocks (RSA, EC, DSA, OPENSSH, generic)
- Database connection strings (PostgreSQL, MySQL, MongoDB, Redis, AMQP)
- Bearer token `Authorization:` headers
- JSON Web Tokens (three-segment base64url)
- Slack tokens (`xox[baprs]-…`)
- Stripe secret and publishable keys
- Twilio tokens (`SK…`)
- Discord bot tokens
- Generic `api_key=` / `secret_key=` assignments with 32+ char values
- SSH private key content lines (base64 PEM body heuristic)
- GCP service account private key JSON fields

**SecretStore integration:** `buildSecretStorePatterns()` and `createScannerWithSecrets()` accept known secret values from the live keyring and convert them to literal-match patterns. This ensures managed secrets are caught even when they don't match any known format (e.g. a custom 12-char token).

**Integration point:** `chat-routes.ts` instantiates a scanner once at route registration and calls `scanner.scan(response.content, 'llm_response')` before returning the AI response to the caller. This closes the LLM-response exfiltration path. Tool execution output scanning is the correct next step (requires provider-level interception).

**Logging:** Every redaction emits a `warn`-level structured log entry: `{ source, redactions: [{ type, count }] }`.

### 2. Skill Trust Tiers (`packages/core/src/soul/skill-trust.ts`)

`applySkillTrustFilter(tools, source)` applies tool-list filtering at dispatch time based on `skill.source`:

| Source | Tool access |
|--------|-------------|
| `user` | Full — all tools |
| `ai_proposed` | Full — all tools |
| `ai_learned` | Full — all tools |
| `marketplace` | Full — all tools |
| `community` | Read-only only |

**Read-only definition:** A tool is considered read-only when its name begins with one of 26 allow-listed prefixes: `get_`, `list_`, `read_`, `search_`, `query_`, `fetch_`, `retrieve_`, `find_`, `lookup_`, `check_`, `inspect_`, `describe_`, `show_`, `view_`, `summarise_`, `summarize_`, `analyze_`, `analyse_`, `extract_`, `count_`, `stat_`, `stats_`, `info_`, `status_`, `ping_`, `health_`.

**Integration:** Both `SoulManager.getActiveTools()` and `BrainManager.getActiveTools()` now call `applySkillTrustFilter()` per skill before accumulating the tool list. The skill's instructions continue to inject into the system prompt normally — only the *available tool set* is restricted.

**Override path:** Skills that legitimately need broader access can be overridden per-skill using the `allowedPermissions` field (already on `SkillSchema`). Full dashboard editor support is a follow-on item.

---

## Consequences

### Positive

- **Closes real exfiltration path** — `$AWS_SECRET_ACCESS_KEY` echoed from a shell tool no longer reaches the caller.
- **Manages pattern set automatically** — Known secrets from the SecretStore are contributed as patterns without manual maintenance.
- **Zero-config for existing deployments** — Community skills without write tools are unaffected; their read tools continue to work.
- **Enforcement without prompt changes** — Community skill instructions inject normally; only the tool list is filtered.
- **Both code paths covered** — `SoulManager` and `BrainManager` each call `applySkillTrustFilter()`.

### Negative / Trade-offs

- **LLM response only (Phase 1)** — Tool output scanning currently applies to the final LLM response, not individual tool call results mid-conversation. Provider-level interception (for tool result messages) is the correct next step.
- **Prefix heuristic** — The read-only classification relies on tool name prefixes. A write tool named `get_and_delete_record` would incorrectly be treated as safe. Operators should be aware of this convention when naming custom tools.
- **No per-skill override UI** — The `allowedPermissions` override path is schema-ready but not yet surfaced in the dashboard skill editor.

---

## Related

- `packages/core/src/security/tool-output-scanner.ts` — scanner implementation
- `packages/core/src/security/tool-output-scanner.test.ts` — test suite (35+ cases)
- `packages/core/src/soul/skill-trust.ts` — trust tier implementation
- `packages/core/src/soul/skill-trust.test.ts` — test suite
- `packages/core/src/ai/chat-routes.ts` — scanner integration point
- `packages/core/src/soul/manager.ts` — `getActiveTools()` patched
- `packages/core/src/brain/manager.ts` — `getActiveTools()` patched
- Phase 35, High Priority items — closes both open checklist entries
