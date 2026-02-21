# Functionality Audit: SecureYeoman vs Competitors

> Comparative analysis of SecureYeoman against OpenClaw, Agent Zero, PicoClaw, Ironclaw, and Personal AI Agents

---

## Executive Summary

| Aspect | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw | Personal AI (Market) |
|--------|--------------|----------|------------|----------|----------|---------------------|
| **Focus** | Enterprise-grade secure AI agent | Consumer/local-first personal AI | Developer automation framework | Ultra-lightweight embedded AI | Privacy-first, security-depth Rust agent | Managed SaaS solutions |
| **Deployment** | Self-hosted, server-centric | Local-first, desktop/server | Docker-based VM | $10 hardware, embedded | Self-hosted, local-first | Cloud-hosted |
| **Language** | TypeScript | TypeScript | Python | Go | **Rust** | Various |
| **RAM Usage** | ~1GB+ | >1GB | >100MB | **<10MB** | ~50MB (Rust) | Cloud-based |
| **Startup Time** | ~30s+ | >500s | >30s | **<1s** | **<1s** (Rust) | N/A |
| **Security** | **Strong** - RBAC, encryption, audit, ToolOutputScanner, Skill Trust Tiers | Basic | Basic (Docker isolation) | Basic (sandbox) | **Strong** - WASM sandbox, Docker proxy, credential leak detection | Variable |
| **Multi-channel** | 22+ platforms | 15+ platforms | CLI/Web only | 5 platforms | 5 channels (TUI, HTTP, WS, WASM, REPL) | Platform-specific |
| **Multi-agent** | Sub-agents, A2A protocol, Agnostic QA Bridge | Workspace/agent routing | Hierarchical agents | Sub-agents (spawn) | ❌ Not a focus | Limited |
| **Memory** | Vector (FAISS/Qdrant), consolidation, **Hybrid FTS + RRF**, chunked | Markdown/YAML file-based | Persistent memory | File-based | **Hybrid FTS + vector (RRF)**, chunked | Cloud storage |
| **Customization** | Hooks, extensions, skills, trust tiers | Skills, plugins | Dynamic tool creation | Skills | SKILL.md + ClawHub + WASM plugins | Limited |

---

## Detailed Feature Comparison

### 1. Core Architecture

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|--------------|----------|------------|----------|----------|
| **Agent Type** | Server-first, API-driven | Gateway-based, message-driven | Docker VM with Linux | Single binary, embedded | Message-driven, multi-channel |
| **Language** | TypeScript | TypeScript/JS | Python | Go | **Rust** |
| **Database** | PostgreSQL + SQLite | File-based (Markdown) | File-based | File-based | PostgreSQL + libSQL (trait-swappable) |
| **AI Providers** | 10+ (Anthropic, OpenAI, Gemini, Ollama, LM Studio, LocalAI, OpenCode Zen, DeepSeek, Mistral, **x.ai Grok**, Letta) | Multiple | Multiple | OpenRouter, Zhipu, Groq, Anthropic, OpenAI, Gemini, DeepSeek | NEAR AI, Tinfoil (TEE), OpenAI, Anthropic, Ollama, any OAI-compatible |
| **MCP Support** | Full MCP server + client (58+ tools, 7 resources, 4 prompts) | Limited | No | ❌ | ✅ As tool implementation path |
| **Memory Footprint** | ~1GB+ | >1GB | >100MB | **<10MB** | ~50MB (Rust) |
| **Startup Time** | ~30s+ | >500s | >30s | **<1s** | **<1s** (Rust static) |
| **Enterprise Ready** | ✅ Production-hardened (Single binary, K8s) | ❌ Developer-focused | ❌ Experimental | ❌ Embedded/IoT focus | ❌ No RBAC/SSO/K8s |

### 2. Security & Compliance

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|--------------|----------|------------|----------|----------|
| **RBAC** | ✅ Full (Admin/Operator/Auditor/Viewer) | ❌ | ❌ | ❌ | ❌ |
| **Encryption at Rest** | ✅ AES-256-GCM | ❌ | ❌ | ❌ | ✅ Local PostgreSQL |
| **Audit Chain** | ✅ HMAC-SHA256 | ❌ | ❌ | ❌ | ❌ |
| **Input Validation** | ✅ Prompt injection defense | ❌ | ❌ | ❌ | ✅ Multi-layer (sanitize → validate → policy → leak) |
| **Tool-output Credential Scanning** | ✅ ToolOutputScanner — 18 patterns (API keys, JWTs, PEM, DB strings, bearer tokens); scans every LLM response; `[REDACTED:<type>]` replacement | ❌ | ❌ | ❌ | ✅ LeakDetector at tool output + LLM response |
| **Rate Limiting** | ✅ Per-user, per-IP, global | Basic | ❌ | ❌ | ✅ WASM fuel metering |
| **Sandboxing** | ✅ Landlock (Linux), sandbox-exec (macOS), seccomp, namespaces | ❌ | Docker-only | ✅ Workspace restriction | ✅ WASM (wasmtime) + Docker + outbound network proxy |
| **Skill Trust Tiers** | ✅ community skills restricted to read-only tool access (26 name-prefix allow-list); enforced in SoulManager + BrainManager | ❌ | ❌ | ❌ | ✅ Trusted (all tools) vs Installed (read-only) |
| **Outbound Network Proxy** | ❌ | ❌ | ❌ | ❌ | ✅ Credential injection at proxy; endpoint allowlist |
| **API Keys** | ✅ With rate limiting | Basic | ❌ | ✅ Config-based | ✅ |
| **mTLS** | ✅ | ❌ | ❌ | ❌ | ❌ |

### 3. Messaging & Integrations

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|--------------|----------|------------|----------|----------|
| **Telegram** | ✅ Stable | ✅ | ❌ | ✅ | ✅ WASM module |
| **Discord** | ✅ Stable | ✅ | ❌ | ✅ | ❌ |
| **Slack** | ✅ Stable | ✅ | ❌ | ❌ | ✅ WASM module |
| **WhatsApp** | ✅ Stable | ✅ | ❌ | ❌ | ❌ |
| **Signal** | ✅ Stable | ✅ | ❌ | ❌ | ❌ |
| **Google Chat** | ✅ Stable | ✅ | ❌ | ❌ | ❌ |
| **Google Gmail** | ✅ Stable | ✅ | ❌ | ❌ | ❌ |
| **Google Calendar** | ✅ Stable | ✅ | ❌ | ❌ | ❌ |
| **MS Teams** | ✅ Stable | ❌ | ❌ | ❌ | ❌ |
| **iMessage** | ✅ Beta | ✅ | ❌ | ❌ | ❌ |
| **Email (SMTP/IMAP)** | ✅ Stable | ✅ | ❌ | ❌ | ❌ |
| **GitHub** | ✅ Stable | ✅ | ❌ | ❌ | ❌ |
| **GitLab** | ✅ Stable | ✅ | ❌ | ❌ | ❌ |
| **Jira** | ✅ Stable | ✅ | ❌ | ❌ | ❌ |
| **Notion** | ✅ Stable | ✅ | ❌ | ❌ | ❌ |
| **AWS** | ✅ Stable | ✅ | ❌ | ❌ | ❌ |
| **Azure DevOps** | ✅ Stable | ❌ | ❌ | ❌ | ❌ |
| **OAuth2** | ✅ First-class (Google) | ❌ | ❌ | ❌ | ❌ |
| **SSO/OIDC** | ✅ (Okta, Azure AD, Auth0, any OIDC) | ❌ | ✅ (some) | ❌ | ❌ |
| **Generic Webhook** | ✅ | ✅ | ❌ | ❌ | ✅ Webhook triggers routines |
| **Terminal UI (TUI)** | ✅ `secureyeoman tui` — full-screen, live status, scrollable chat, keyboard shortcuts | ❌ | ❌ | ❌ | ✅ Ratatui full TUI |

### 4. Tools & Automation

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|--------------|----------|------------|----------|----------|
| **Browser Automation** | ✅ Playwright | ✅ Built-in | ✅ | ❌ | ❌ |
| **Web Scraping** | ✅ Advanced (MCP) | ✅ | ❌ | ❌ | ✅ (via HTTP WASM tools) |
| **Web Search** | ✅ Multi-provider | ✅ | ❌ | ✅ (Brave, DuckDuckGo) | ❌ |
| **Shell Execution** | ✅ Sandboxed | ✅ | ✅ | ✅ (restricted) | ✅ Sandboxed (env-scrubbed) |
| **File Operations** | ✅ Sandboxed | ✅ | ✅ | ✅ (workspace-restricted) | ✅ Sandboxed |
| **Calendar** | ✅ Google Calendar | ✅ | ❌ | ❌ | ❌ |
| **Code Execution** | ✅ Sandboxed (Python, Node.js, shell) | ✅ | ✅ | ❌ | ✅ Docker container (3 isolation policies) |
| **Custom Skills** | ✅ Lifecycle hooks (38 hook points) | ✅ 5,700+ community | ✅ Dynamic | ✅ Skills | ✅ SKILL.md + ClawHub registry |
| **WASM Tool Sandbox** | ✅ (policy flag, off by default) | ❌ | ❌ | ❌ | ✅ First-class (wasmtime, fuel metering, capability-based) |
| **MCP Tools** | ✅ 58+ tools | ❌ | ❌ | ❌ | ✅ MCP as tool path |
| **Cron/Scheduling** | ✅ | ❌ | ❌ | ✅ | ✅ Routines engine |
| **Heartbeat Tasks** | ✅ | ❌ | ✅ | ✅ | ✅ HEARTBEAT.md polling |
| **Self-Repairing Tasks** | ✅ `TaskLoop` — timeout + repeated-call detection; `buildRecoveryPrompt()` injects diagnostic context (ADR 098) | ❌ | ❌ | ❌ | ✅ Stuck detection + re-analysis prompt |
| **LLM Response Caching** | ❌ | ❌ | ❌ | ❌ | ✅ Hash-keyed response cache |
| **Sub-agent Spawn** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Agent Swarms** | ✅ (sequential, parallel, dynamic) | ❌ | ✅ | ❌ | ❌ |
| **Dynamic Tool Creation** | ✅ (Agent Zero-style) | ❌ | ✅ | ❌ | ❌ |
| **Binary Agents** | ✅ (JSON stdin/stdout) | ❌ | ❌ | ❌ | ❌ |
| **MCP Bridge Agents** | ✅ (Mustache template) | ❌ | ❌ | ❌ | ❌ |
| **QA Sub-Agent Team** | ✅ Agnostic 6-agent QA platform bridged via 10 `agnostic_*` MCP tools + A2A delegation | ❌ | ❌ | ❌ | ❌ |

### 5. Memory & Knowledge

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|--------------|----------|------------|----------|----------|
| **Vector Memory** | ✅ FAISS, Qdrant | ❌ | ❌ | ❌ | ✅ pgvector |
| **Full-Text Search (FTS)** | ✅ tsvector GIN index on memories + knowledge (migration 029) | ❌ | ❌ | ❌ | ✅ tsvector |
| **Hybrid FTS + Vector (RRF)** | ✅ `queryMemoriesByRRF()` + `queryKnowledgeByRRF()`; Reciprocal Rank Fusion (ADR 095) | ❌ | ❌ | ❌ | ✅ Reciprocal Rank Fusion |
| **Content Chunking** | ✅ `brain.document_chunks` — 800 tokens, 15% overlap; per-chunk FTS + vector (ADR 096) | ❌ | ❌ | ❌ | ✅ 800 tokens, 15% overlap |
| **ChromaDB** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Semantic Search** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Memory Consolidation** | ✅ LLM-driven | ✅ File-based | ✅ | ❌ | ❌ |
| **Context Compaction** | ✅ `ContextCompactor` — proactive at 80% context-window fill; older turns summarised before limit hit (ADR 097) | ✅ | ❌ | ❌ | ✅ Proactive before limit hit |
| **History Compression** | ✅ Progressive | ✅ | ❌ | ❌ | ✅ Session compaction |
| **Importance Scoring** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Workspace Memory** | ✅ | ✅ | ✅ | ✅ (MEMORY.md) | ✅ Identity files (SOUL.md, AGENTS.md, USER.md) |

### 6. Multi-Agent & Collaboration

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|--------------|----------|------------|----------|----------|
| **Sub-Agents** | ✅ With budget/depth | ✅ Workspaces | ✅ Hierarchical | ✅ Spawn | ❌ |
| **A2A Protocol** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Agent Swarms** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Delegation Controls** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **External QA Team** | ✅ Agnostic bridge — 10 MCP tools + A2A delegation | ❌ | ❌ | ❌ | ❌ |

### 7. Dashboard & UX

| Feature | SecureYeoman | OpenClaw | Agent Zero | Ironclaw |
|---------|--------------|----------|------------|----------|
| **Web Dashboard** | ✅ React SPA | ✅ Web UI | ✅ Web | ✅ Web gateway (SSE/WebSocket) |
| **Terminal UI (TUI)** | ✅ `secureyeoman tui` — full-screen status + chat, Ctrl+R/L/↑↓, alternate screen buffer | ❌ | ❌ | ✅ Ratatui (full approval overlays) |
| **IDE Integration** | ✅ Monaco Editor | ❌ | ❌ | ❌ |
| **WebGL Graph Visualization** | ✅ Sigma.js + Graphology | ❌ | ❌ | ❌ |
| **Rich Chat Rendering** | ✅ Markdown, Prism code, Mermaid, KaTeX, GitHub alerts | ✅ | ❌ | Basic |
| **Voice (STT/TTS)** | ✅ (Push-to-talk, per-personality voice) | ✅ | ❌ | ❌ |
| **Image Generation** | ✅ DALL-E | ✅ | ❌ | ❌ |
| **Mobile Support** | ✅ (via messaging) | ✅ (via messaging) | ❌ | ❌ |
| **Storybook** | ✅ | ❌ | ❌ | ❌ |
| **ReactFlow Graph** | ✅ (System flow, live edges) | ❌ | ❌ | ❌ |

### 8. Enterprise Features

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|--------------|----------|------------|----------|----------|
| **Kubernetes** | ✅ Helm charts (HPA, PDB, NetworkPolicies) | ❌ | ❌ | ❌ | ❌ |
| **Prometheus** | ✅ Metrics + Grafana dashboards | ❌ | ❌ | ❌ | ❌ |
| **Workspace/Team** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **SSO/OIDC** | ✅ (Okta, Azure AD, Auth0, any OIDC via openid-client v6) | ❌ | ✅ (some) | ❌ | ❌ |
| **Onboarding** | ✅ (Wizard at http://localhost:18789) | ❌ | ✅ | ✅ (onboard CLI) | ❌ |
| **Single Binary** | ✅ (Bun compile, ~80MB, Linux x64/arm64, macOS arm64) | ❌ | ❌ | ✅ | ✅ (Rust static) |
| **Lite Binary** | ✅ (SQLite, edge/embedded) | ❌ | ❌ | ✅ ($10 hardware) | ✅ (libSQL backend) |
| **Docker** | ✅ (~80MB binary-based) | ✅ | ✅ | ❌ | ✅ |
| **CLI** | ✅ (24 commands, shell completions, --json output) | ✅ | ✅ | ✅ | ✅ (REPL) |
| **Dual DB Backend** | ✅ (PostgreSQL + SQLite, same schema) | ❌ | ❌ | ❌ | ✅ (PostgreSQL + libSQL via trait) |

### 9. Testing & Quality

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|--------------|----------|------------|----------|----------|
| **Test Count** | 6,744+ | ~Limited (community-driven) | Minimal | Minimal | Unknown (Rust type system provides baseline safety) |
| **Test Coverage** | 84% lines / 85% funcs / 71% branches | Not publicly tracked | Not publicly tracked | Not publicly tracked | Not publicly tracked |
| **Test Files** | 366 | Unknown | Unknown | Unknown | Unknown |
| **CI/CD Pipeline** | ✅ (lint/typecheck/test/build/security audit/docker-push/helm-lint) | ✅ | Basic | Minimal | ✅ (Cargo CI) |
| **Security Tests** | ✅ Dedicated security + chaos test suites | ❌ (recent CVEs: CVE-2026-25253 RCE, CVE-2026-26327) | ❌ | ❌ | ✅ Memory-safe by language; WASM sandbox tests |
| **Storybook** | ✅ (component development) | ❌ | ❌ | ❌ | ❌ |

**Notes:**
- **SecureYeoman**: Full TypeScript strict mode, 6,744+ tests across 366 files with 84% line coverage
- **OpenClaw**: Rapid growth (185K+ stars), but significant security concerns — multiple CVEs in 2026, including critical RCE vulnerability (CVE-2026-25253, CVSS 8.8), auth bypass, and supply chain poisoning in skills marketplace
- **Agent Zero**: Minimal test infrastructure, experimental/prototype status
- **PicoClaw**: Minimal test infrastructure, Go-based lightweight focus

---

## Gap Analysis: Where SecureYeoman Leads

### ✅ Unique to SecureYeoman
1. **Enterprise Security** - RBAC, encryption, audit chain, mTLS, sandboxing (Landlock)
2. **ToolOutputScanner** - 18-pattern credential leak detection on every LLM response; `[REDACTED:<type>]` replacement (ADR 092)
3. **Skill Trust Tiers** - Community skills restricted to read-only tool access; enforced in SoulManager + BrainManager (ADR 092)
4. **Vector Memory** - FAISS, Qdrant, ChromaDB, semantic search, consolidation
5. **Hybrid FTS + RRF Search** - tsvector GIN + pgvector merged via Reciprocal Rank Fusion; improves recall for exact terms and named entities (ADR 095)
6. **Content-Chunked Workspace Indexing** - Large documents split into 800-token overlapping chunks with independent FTS + vector indexes (ADR 096)
7. **Proactive Context Compaction** - Token usage estimated before each LLM call; older turns summarised at 80% context-window fill (ADR 097)
8. **Self-Repairing Task Loop** - `TaskLoop` detects stuck agents (timeout or repeated tool calls) and injects diagnostic recovery prompts (ADR 098)
9. **MCP Ecosystem** - Full MCP server + client (58+ tools), SSRF protection, encrypted credentials, Kali security toolkit
10. **Agnostic QA Sub-Agent Bridge** - 10 `agnostic_*` MCP tools + `agnostic_delegate_a2a` A2A delegation; `AGNOSTIC_AUTO_START` for one-command launch (ADR 090)
11. **Kubernetes Ready** - Production deployment with HPA, PDBs, NetworkPolicies, ExternalSecret CRD
12. **A2A Protocol** - Agent-to-agent communication with E2E encryption, peer discovery (mDNS/DNS-SD), `addTrustedLocalPeer()`
13. **IDE Integration** - Monaco editor with AI chat sidebar
14. **Comprehensive Audit** - Security events, HMAC-SHA256 verification
15. **Multi-voice TTS** - Per-personality voice selection with browser-native synthesis
16. **Haptic Feedback** - Pattern-based triggers
17. **WebGL Visualization** - Sigma.js + Graphology with pluggable layouts (ForceAtlas2, Dagre)
18. **Rich Chat Rendering** - Markdown, Prism syntax highlighting, Mermaid diagrams, KaTeX math, GitHub alerts
19. **Agent Swarms** - Sequential, parallel, dynamic strategies with templates
20. **Dynamic Tool Creation** - Agent Zero-style, gated by security policy
21. **Extensible Sub-agent Types** - llm, binary, mcp-bridge agents
22. **Usage Tracking** - PostgreSQL-backed with persistence
23. **OAuth2 First-Class** - Google services with automatic token refresh
24. **Email (SMTP/IMAP)** - IMAP receive + SMTP send with provider presets
25. **SSO/OIDC** - Okta, Azure AD, Auth0, any standards-compliant OIDC via openid-client v6
26. **TUI Dashboard** - `secureyeoman tui` — full-screen terminal dashboard, no new dependencies (ADR 093)
27. **CLI** - 24 commands, shell completions, rich output, plugin management
28. **Single Binary** - ~80MB no-runtime-deps for Linux/macOS
29. **Lite Binary** - SQLite tier for edge/embedded deployment
30. **Community Skills Sync** - Bundled + remote repo sync capability; `triggerPatterns` routing pipeline end-to-end

---

## Gap Analysis: Opportunities to Improve

### ❌ Missing vs OpenClaw
1. **Community Skills** - 5,700+ community skills vs SecureYeoman hooks (mitigated by Marketplace + community sync)

### ❌ Missing vs PicoClaw
1. **Ultra-low Memory Footprint** - <10MB vs 1GB+ (optimization opportunity via lite binary)
2. **Sub-second Startup** - <1s vs 30s+ (lite binary helps)
3. **$10 Hardware Deployment** - Embedded device support (lite binary available)
4. **Go-based Runtime** - Potential future language option for core

#### ❌ Missing vs Ironclaw

| Gap | Ironclaw approach | SecureYeoman status | Priority |
|-----|------------------|---------------------|----------|
| **LLM response caching** | Hash-keyed cache (model + system prompt + messages) with configurable TTL; immediate wins on heartbeat probes | No response caching | Low-Medium |
| **Outbound proxy for sandbox credentials** | HTTP proxy in sandbox network namespace intercepts outbound calls, injects `Authorization` headers, enforces endpoint allowlist; secrets never enter container as env vars | Sandbox isolation (namespaces/seccomp/landlock) but no HTTP-layer credential injection | Low |

**What Ironclaw does NOT have** (SecureYeoman advantages to preserve):
- RBAC, SSO/OIDC, mTLS, HMAC audit chain
- Kubernetes / Helm / HPA / NetworkPolicies
- Personality system (named, scoped, schedulable, per-personality active hours, presets)
- Multi-agent: A2A protocol, swarms, sub-agent budget/depth controls, Agnostic QA bridge
- 22+ messaging integrations vs ~2 (Telegram + Slack WASM modules)
- Intelligent model routing (task complexity scoring, cost-aware tier selection)
- Full React dashboard (Monaco editor, WebGL graph, rich chat, group chat)
- Voice TTS/STT, DALL-E image generation
- Community marketplace with trust model and install pipeline

### ❌ Missing vs Market
1. **Mobile App** - Native iOS/Android

### ✅ Implemented (Feature Flags, Off by Default)
1. **gVisor Kernel Isolation** - Optional gVisor sandbox (`sandboxGvisor` policy flag, default off)
2. **WASM Execution Isolation** - Optional WASM sandbox (`sandboxWasm` policy flag, default off)
3. **ML Anomaly Detection** - ML-based anomaly detection engine (`allowAnomalyDetection` policy flag, default off)

---

## Competitive Positioning

| Market Segment | SecureYeoman Position |
|----------------|---------------------|
| **Enterprise Self-Hosted** | Leader - Only option with full security, RBAC, SSO |
| **Developer Automation** | Challenger - OpenClaw/Agent Zero lead |
| **Privacy-First / Rust** | Challenged by Ironclaw - deeper sandbox + credential safety, lower RAM; SecureYeoman leads on features and enterprise posture; Ironclaw's high/medium security gaps (credential scanning, skill trust, hybrid search, context compaction, self-repair) now resolved |
| **Embedded/IoT AI** | Challenger - Lite binary available, PicoClaw leads on cost |
| **Consumer Personal AI** | Differentiated - Local-first with enterprise features |
| **Managed SaaS** | Not positioned - Self-hosted only |

**Key Differentiator**: SecureYeoman is the **only** enterprise-grade, self-hosted AI agent with:
- Full RBAC and security compliance (Admin/Operator/Auditor/Viewer)
- Vector memory with hybrid FTS + RRF semantic search (FAISS/Qdrant/ChromaDB + tsvector)
- MCP ecosystem (58+ tools, SSRF protection, encrypted credentials, Kali security toolkit)
- Kubernetes production readiness (Helm, HPA, PDBs, NetworkPolicies)
- SSO/OIDC support (Okta, Azure AD, Auth0, any OIDC)
- Single binary distribution (~80MB, no runtime deps)
- **Unlike PicoClaw**: Full enterprise features (RBAC, encryption, audit, SSO) with more capabilities at the cost of higher resource usage
- **Unlike Ironclaw**: RBAC, SSO, A2A, personality system, 22+ integrations, agent swarms, Agnostic QA bridge — Ironclaw wins on Rust memory safety and raw sandbox depth; SecureYeoman wins on breadth, enterprise auth, and multi-agent orchestration

---

*Updated: 2026-02-21 — reflected Phase 34–35 completions: ToolOutputScanner, Skill Trust Tiers, TUI, Hybrid FTS+RRF, Content-chunked indexing, Proactive Context Compaction, Self-repairing TaskLoop, Agnostic A2A Bridge; updated test counts (6,744+/366 files) and MCP tool count (58+)*
