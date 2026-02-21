# Functionality Audit: SecureYeoman vs Competitors

> Comparative analysis of SecureYeoman against OpenClaw, Agent Zero, PicoClaw, and Personal AI Agents

---

## Executive Summary

| Aspect | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Personal AI (Market) |
|--------|--------------|----------|------------|----------|---------------------|
| **Focus** | Enterprise-grade secure AI agent | Consumer/local-first personal AI | Developer automation framework | Ultra-lightweight embedded AI | Managed SaaS solutions |
| **Deployment** | Self-hosted, server-centric | Local-first, desktop/server | Docker-based VM | $10 hardware, embedded | Cloud-hosted |
| **Language** | TypeScript | TypeScript | Python | Go | Various |
| **RAM Usage** | ~1GB+ | >1GB | >100MB | **<10MB** | Cloud-based |
| **Startup Time** | ~30s+ | >500s | >30s | **<1s** | N/A |
| **Security** | **Strong** - RBAC, encryption, audit | Basic | Basic (Docker isolation) | Basic (sandbox) | Variable |
| **Multi-channel** | 22+ platforms | 15+ platforms | CLI/Web only | 5 platforms | Platform-specific |
| **Multi-agent** | Sub-agents, A2A protocol | Workspace/agent routing | Hierarchical agents | Sub-agents (spawn) | Limited |
| **Memory** | Vector (FAISS/Qdrant), consolidation | Markdown/YAML file-based | Persistent memory | File-based | Cloud storage |
| **Customization** | Hooks, extensions, skills | Skills, plugins | Dynamic tool creation | Skills | Limited |

---

## Detailed Feature Comparison

### 1. Core Architecture

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw |
|---------|--------------|----------|------------|----------|
| **Agent Type** | Server-first, API-driven | Gateway-based, message-driven | Docker VM with Linux | Single binary, embedded |
| **Language** | TypeScript | TypeScript/JS | Python | Go |
| **Database** | PostgreSQL + SQLite | File-based (Markdown) | File-based | File-based |
| **AI Providers** | 10+ (Anthropic, OpenAI, Gemini, Ollama, LM Studio, LocalAI, OpenCode Zen, DeepSeek, Mistral, **x.ai Grok**) | Multiple | Multiple | OpenRouter, Zhipu, Groq, Anthropic, OpenAI, Gemini, DeepSeek |
| **MCP Support** | Full MCP server + client (34+ tools, 7 resources, 4 prompts) | Limited | No | ❌ |
| **Memory Footprint** | ~1GB+ | >1GB | >100MB | **<10MB** |
| **Startup Time** | ~30s+ | >500s | >30s | **<1s** |
| **Enterprise Ready** | ✅ Production-hardened (Single binary, K8s) | ❌ Developer-focused | ❌ Experimental | ❌ Embedded/IoT focus |

### 2. Security & Compliance

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw |
|---------|--------------|----------|------------|----------|
| **RBAC** | ✅ Full (Admin/Operator/Auditor/Viewer) | ❌ | ❌ | ❌ |
| **Encryption at Rest** | ✅ AES-256-GCM | ❌ | ❌ | ❌ |
| **Audit Chain** | ✅ HMAC-SHA256 | ❌ | ❌ | ❌ |
| **Input Validation** | ✅ Prompt injection defense | ❌ | ❌ | ❌ |
| **Rate Limiting** | ✅ Per-user, per-IP, global | Basic | ❌ | ❌ |
| **Sandboxing** | ✅ Landlock (Linux), sandbox-exec (macOS) | ❌ | Docker-only | ✅ Workspace restriction |
| **API Keys** | ✅ With rate limiting | Basic | ❌ | ✅ Config-based |
| **mTLS** | ✅ | ❌ | ❌ | ❌ |

### 3. Messaging & Integrations

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw |
|---------|--------------|----------|------------|----------|
| **Telegram** | ✅ Stable | ✅ | ❌ | ✅ |
| **Discord** | ✅ Stable | ✅ | ❌ | ✅ |
| **Slack** | ✅ Stable | ✅ | ❌ | ❌ |
| **WhatsApp** | ✅ Stable | ✅ | ❌ | ❌ |
| **Signal** | ✅ Stable | ✅ | ❌ | ❌ |
| **Google Chat** | ✅ Stable | ✅ | ❌ | ❌ |
| **Google Gmail** | ✅ Stable | ✅ | ❌ | ❌ |
| **Google Calendar** | ✅ Stable | ✅ | ❌ | ❌ |
| **MS Teams** | ✅ Stable | ❌ | ❌ | ❌ |
| **iMessage** | ✅ Beta | ✅ | ❌ | ❌ |
| **Email (SMTP/IMAP)** | ✅ Stable | ✅ | ❌ | ❌ |
| **GitHub** | ✅ Stable | ✅ | ❌ | ❌ |
| **GitLab** | ✅ Stable | ✅ | ❌ | ❌ |
| **Jira** | ✅ Stable | ✅ | ❌ | ❌ |
| **Notion** | ✅ Stable | ✅ | ❌ | ❌ |
| **AWS** | ✅ Stable | ✅ | ❌ | ❌ |
| **Azure DevOps** | ✅ Stable | ❌ | ❌ | ❌ |
| **OAuth2** | ✅ First-class (Google) | ❌ | ❌ | ❌ |
| **SSO/OIDC** | ✅ (Okta, Azure AD, Auth0, any OIDC) | ❌ | ✅ (some) | ❌ |
| **Generic Webhook** | ✅ | ✅ | ❌ | ❌ |

### 4. Tools & Automation

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw |
|---------|--------------|----------|------------|----------|
| **Browser Automation** | ✅ Playwright | ✅ Built-in | ✅ | ❌ |
| **Web Scraping** | ✅ Advanced (MCP) | ✅ | ❌ | ❌ |
| **Web Search** | ✅ Multi-provider | ✅ | ❌ | ✅ (Brave, DuckDuckGo) |
| **Shell Execution** | ✅ Sandboxed | ✅ | ✅ | ✅ (restricted) |
| **File Operations** | ✅ Sandboxed | ✅ | ✅ | ✅ (workspace-restricted) |
| **Calendar** | ✅ Google Calendar | ✅ | ❌ | ❌ |
| **Code Execution** | ✅ Sandboxed (Python, Node.js, shell) | ✅ | ✅ | ❌ |
| **Custom Skills** | ✅ Lifecycle hooks (38 hook points) | ✅ 5,700+ community | ✅ Dynamic | ✅ Skills |
| **MCP Tools** | ✅ 34+ tools | ❌ | ❌ | ❌ |
| **Cron/Scheduling** | ✅ | ❌ | ❌ | ✅ |
| **Heartbeat Tasks** | ✅ | ❌ | ✅ | ✅ |
| **Sub-agent Spawn** | ✅ | ✅ | ✅ | ✅ |
| **Agent Swarms** | ✅ (sequential, parallel, dynamic) | ❌ | ✅ | ❌ |
| **Dynamic Tool Creation** | ✅ (Agent Zero-style) | ❌ | ✅ | ❌ |
| **Binary Agents** | ✅ (JSON stdin/stdout) | ❌ | ❌ | ❌ |
| **MCP Bridge Agents** | ✅ (Mustache template) | ❌ | ❌ | ❌ |

### 5. Memory & Knowledge

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw |
|---------|--------------|----------|------------|----------|
| **Vector Memory** | ✅ FAISS, Qdrant | ❌ | ❌ | ❌ |
| **ChromaDB** | ✅ | ❌ | ❌ | ❌ |
| **Semantic Search** | ✅ | ❌ | ❌ | ❌ |
| **Memory Consolidation** | ✅ LLM-driven | ✅ File-based | ✅ | ❌ |
| **History Compression** | ✅ Progressive | ✅ | ❌ | ❌ |
| **Importance Scoring** | ✅ | ❌ | ❌ | ❌ |
| **Workspace Memory** | ✅ | ✅ | ✅ | ✅ (MEMORY.md) |

### 6. Multi-Agent & Collaboration

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw |
|---------|--------------|----------|------------|----------|
| **Sub-Agents** | ✅ With budget/depth | ✅ Workspaces | ✅ Hierarchical | ✅ Spawn |
| **A2A Protocol** | ✅ | ❌ | ❌ | ❌ |
| **Agent Swarms** | ✅ | ❌ | ✅ | ❌ |
| **Delegation Controls** | ✅ | ❌ | ❌ | ❌ |

### 7. Dashboard & UX

| Feature | SecureYeoman | OpenClaw | Agent Zero |
|---------|--------------|----------|------------|
| **Web Dashboard** | ✅ React SPA | ✅ Web UI | ✅ Web |
| **IDE Integration** | ✅ Monaco Editor | ❌ | ❌ |
| **WebGL Graph Visualization** | ✅ Sigma.js + Graphology | ❌ | ❌ |
| **Rich Chat Rendering** | ✅ Markdown, Prism code, Mermaid, KaTeX, GitHub alerts | ✅ | ❌ |
| **Voice (STT/TTS)** | ✅ (Push-to-talk, per-personality voice) | ✅ | ❌ |
| **Image Generation** | ✅ DALL-E | ✅ | ❌ |
| **Mobile Support** | ✅ (via messaging) | ✅ (via messaging) | ❌ |
| **Storybook** | ✅ | ❌ | ❌ |
| **ReactFlow Graph** | ✅ (System flow, live edges) | ❌ | ❌ |

### 8. Enterprise Features

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw |
|---------|--------------|----------|------------|----------|
| **Kubernetes** | ✅ Helm charts (HPA, PDB, NetworkPolicies) | ❌ | ❌ | ❌ |
| **Prometheus** | ✅ Metrics + Grafana dashboards | ❌ | ❌ | ❌ |
| **Workspace/Team** | ✅ | ❌ | ✅ | ❌ |
| **SSO/OIDC** | ✅ (Okta, Azure AD, Auth0, any OIDC via openid-client v6) | ❌ | ✅ (some) | ❌ |
| **Onboarding** | ✅ (Wizard at http://localhost:18789) | ❌ | ✅ | ✅ (onboard CLI) |
| **Single Binary** | ✅ (Bun compile, ~80MB, Linux x64/arm64, macOS arm64) | ❌ | ❌ | ✅ |
| **Lite Binary** | ✅ (SQLite, edge/embedded) | ❌ | ❌ | ✅ ($10 hardware) |
| **Docker** | ✅ (~80MB binary-based) | ✅ | ✅ | ❌ |
| **CLI** | ✅ (21 commands, shell completions, --json output) | ✅ | ✅ | ✅ |

### 9. Testing & Quality

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw |
|---------|--------------|----------|------------|----------|
| **Test Count** | 6,312+ | ~Limited (community-driven) | Minimal | Minimal |
| **Test Coverage** | 84% lines / 85% funcs / 71% branches | Not publicly tracked | Not publicly tracked | Not publicly tracked |
| **Test Files** | 346 | Unknown | Unknown | Unknown |
| **CI/CD Pipeline** | ✅ (lint/typecheck/test/build/security audit/docker-push/helm-lint) | ✅ | Basic | Minimal |
| **Security Tests** | ✅ Dedicated security + chaos test suites | ❌ (recent CVEs: CVE-2026-25253 RCE, CVE-2026-26327) | ❌ | ❌ |
| **Storybook** | ✅ (component development) | ❌ | ❌ | ❌ |

**Notes:**
- **SecureYeoman**: Full TypeScript strict mode, 6,312+ tests across 346 files with 84% line coverage
- **OpenClaw**: Rapid growth (185K+ stars), but significant security concerns — multiple CVEs in 2026, including critical RCE vulnerability (CVE-2026-25253, CVSS 8.8), auth bypass, and supply chain poisoning in skills marketplace
- **Agent Zero**: Minimal test infrastructure, experimental/prototype status
- **PicoClaw**: Minimal test infrastructure, Go-based lightweight focus

---

## Gap Analysis: Where SecureYeoman Leads

### ✅ Unique to SecureYeoman
1. **Enterprise Security** - RBAC, encryption, audit chain, mTLS, sandboxing (Landlock)
2. **Vector Memory** - FAISS, Qdrant, ChromaDB, semantic search, consolidation
3. **MCP Ecosystem** - Full MCP server + client (34+ tools), SSRF protection, encrypted credentials
4. **Kubernetes Ready** - Production deployment with HPA, PDBs, NetworkPolicies, ExternalSecret CRD
5. **A2A Protocol** - Agent-to-agent communication with E2E encryption, peer discovery (mDNS/DNS-SD)
6. **IDE Integration** - Monaco editor with AI chat sidebar
7. **Comprehensive Audit** - Security events, HMAC-SHA256 verification
8. **Multi-voice TTS** - Per-personality voice selection with browser-native synthesis
9. **Haptic Feedback** - Pattern-based triggers
10. **WebGL Visualization** - Sigma.js + Graphology with pluggable layouts (ForceAtlas2, Dagre)
11. **Rich Chat Rendering** - Markdown, Prism syntax highlighting, Mermaid diagrams, KaTeX math, GitHub alerts
12. **Agent Swarms** - Sequential, parallel, dynamic strategies with templates
13. **Dynamic Tool Creation** - Agent Zero-style, gated by security policy
14. **Extensible Sub-agent Types** - llm, binary, mcp-bridge agents
15. **Usage Tracking** - PostgreSQL-backed with persistence
16. **OAuth2 First-Class** - Google services with automatic token refresh
17. **Email (SMTP/IMAP)** - IMAP receive + SMTP send with provider presets
18. **SSO/OIDC** - Okta, Azure AD, Auth0, any standards-compliant OIDC via openid-client v6
19. **CLI Improvements** - 21 commands, shell completions, rich output, plugin management
20. **Single Binary** - ~80MB no-runtime-deps for Linux/macOS
21. **Lite Binary** - SQLite tier for edge/embedded deployment
22. **Community Skills Sync** - Bundled + remote repo sync capability

---

## Gap Analysis: Opportunities to Improve

### ❌ Missing vs OpenClaw
1. **Community Skills** - 5,700+ community skills vs SecureYeoman hooks (mitigated by Marketplace + community sync)

### ❌ Missing vs PicoClaw
1. **Ultra-low Memory Footprint** - <10MB vs 1GB+ (optimization opportunity via lite binary)
2. **Sub-second Startup** - <1s vs 30s+ (lite binary helps)
3. **$10 Hardware Deployment** - Embedded device support (lite binary available)
4. **Go-based Runtime** - Potential future language option for core

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
| **Embedded/IoT AI** | Challenger - Lite binary available, PicoClaw leads on cost |
| **Consumer Personal AI** | Differentiated - Local-first with enterprise features |
| **Managed SaaS** | Not positioned - Self-hosted only |

**Key Differentiator**: SecureYeoman is the **only** enterprise-grade, self-hosted AI agent with:
- Full RBAC and security compliance (Admin/Operator/Auditor/Viewer)
- Vector memory with semantic search (FAISS/Qdrant/ChromaDB)
- MCP ecosystem (34+ tools, SSRF protection, encrypted credentials)
- Kubernetes production readiness (Helm, HPA, PDBs, NetworkPolicies)
- SSO/OIDC support (Okta, Azure AD, Auth0, any OIDC)
- Single binary distribution (~80MB, no runtime deps)
- **Unlike PicoClaw**: Full enterprise features (RBAC, encryption, audit, SSO) with more capabilities at the cost of higher resource usage

---

*Updated: 2026-02-20*
