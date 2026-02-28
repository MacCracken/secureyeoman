# MCP Tool Context Optimization

SecureYeoman uses **Smart Schema Delivery** (Phase 72) to reduce the number of tool tokens sent on each AI request. Instead of sending all enabled MCP tool JSON schemas on every turn (~4–10K tokens), only the schemas relevant to the current conversation are included.

## How It Works

Each chat request runs a two-pass tool selection:

### Pass 1 — Feature-Flag Filter
All feature-gate-allowed tools for the active personality are collected. This is the existing gate: global toggle AND per-personality toggle must both be enabled.

### Pass 2 — Relevance Filter
From the allowed tools, only schemas for *relevant groups* are sent to the AI model in `AIRequest.tools`:

| Group | Included when message or recent history mentions… |
|---|---|
| Git / GitHub CLI | git, commit, branch, merge, diff, checkout, pull request |
| GitHub API | github, repo, repository, fork, ssh key, issue |
| Filesystem | file, directory, folder, path, read/write file |
| Web Scraping | scrape, crawl, fetch url, extract, parse html |
| Web Search | search, google, look up, find online |
| Browser | browser, screenshot, click, navigate |
| Gmail | email, gmail, inbox, compose, send email |
| Twitter | twitter, tweet, post, mention, timeline |
| Network | network, device, ping, traceroute, vlan, bgp |
| Twingate | twingate, vpn, zero trust, remote access |
| Security | scan, nmap, sqlmap, nuclei, vulnerability, pentest |
| Ollama | ollama, model, pull model, local model |
| **Core** (brain, task, sys, soul, audit …) | **Always included** |

**History scan**: If the AI called a tool from a group in the last 20 conversation turns, that group's schemas stay hot for the remainder of the exchange.

### MCP Tool Catalog

All allowed tools (Pass 1) are listed in a compact catalog appended to the system prompt, regardless of whether their schemas are sent. This means the AI always knows what tools are *available*, even if the schemas aren't in `AIRequest.tools` this turn:

```
## Available MCP Tools
Full tool schemas are loaded on-demand based on conversation context. All listed tools are available to call.

**GitHub API (OAuth)** (20): `github_profile`, `github_list_repos`, …
**Gmail** (7): `gmail_profile`, `gmail_list_messages`, …
**Core (Brain, Tasks, System, Soul)** (15): `brain_remember`, `task_create`, …
```

## Configuration

### Smart Schema Delivery (default: on)

Go to **Settings → Security → Scope** and find the **Smart Schema Delivery** toggle at the top.

| Setting | Behavior |
|---|---|
| ✅ Smart Schema Delivery (default) | Only relevant schemas per turn (~60–90% token reduction on cold requests) |
| ❌ Full Schemas Every Request | All enabled tool schemas on every turn (higher cost, deterministic) |

### When to disable Smart Schema Delivery

- **Integrations that call the API directly** and need all schemas available every turn.
- **Custom workflows** that jump between unrelated tool groups mid-conversation.
- **Debugging**: if the AI unexpectedly fails to call a tool it should know about, try disabling to rule out schema selection as the cause.

## Token Savings Estimate

A typical deployment with GitHub API, Gmail, Git, and Filesystem all enabled:

| Mode | Schemas sent (cold request) | Estimated tokens |
|---|---|---|
| Full schemas | ~80 tools | 4,000–10,000 |
| Smart delivery (unrelated message) | ~15 core tools | 400–800 |
| Smart delivery (github-related message) | ~35 tools | 1,500–3,000 |

## Telemetry

Each request emits a `mcp_tools_selected` audit event (level `debug`) with:
- `tools_available_count` — tools allowed by feature flags
- `tools_sent_count` — schemas actually sent this turn
- `full_schemas` — `true` when the bypass is active

View these in **Settings → Audit Log** filtered by event `mcp_tools_selected`.

## GitHub API Tools Fix (Phase 72 bugfix)

Prior to Phase 72, all `github_*`-prefixed tools were gated under `exposeGit`. This meant the 20 Phase-70 GitHub REST API tools (`github_profile`, `github_list_repos`, `github_sync_fork`, etc.) required the **Git** feature flag to be enabled — not the **GitHub** flag.

**Fixed**: Phase-70 API tools are now correctly gated by `exposeGithub`. The CLI `gh`-binary tools (`github_pr_list`, `github_issue_view`, `github_repo_view`) remain under `exposeGit`.

If you had GitHub API tools working before, you may have had `exposeGit: true`. You can now disable `exposeGit` and enable only `exposeGithub` to expose solely the REST API tools.
