# F.R.I.D.A.Y. — Open Items

> Tracking open work items as of `2026.2.16`.

---

## Dashboard

- [ ] Storybook for component development
- [x] Test connection button for integrations (backend endpoint + dashboard UI)
- [x] Node detail expansion in MetricsGraph
- [x] HTML prompt injection protection (DOMPurify sanitization)

## Integrations

- [ ] Telegram inline keyboards, photo/document/voice attachments
- [ ] Discord thread support for multi-turn conversations
- [ ] Slack interactive messages (blocks, modals)
- [ ] WhatsApp integration
- [x] Calendar integration (Google Calendar — Phase 7)
- [x] Notion integration (Phase 7)
- [x] GitLab integration (Phase 7)
- [ ] GitHub PR review automation via AI
- [ ] GitHub code search and file browsing
- [ ] Outbound webhooks for events

## WebMCP (Phase 8)

- [x] Web scraping tools (markdown, HTML, batch, structured extraction)
- [x] Web search tools (DuckDuckGo, SerpAPI, Tavily backends)
- [x] SSRF protection (private IP blocking, URL allowlist, redirect validation)
- [x] Health monitoring for external MCP servers
- [x] Encrypted credential management for MCP servers
- [x] Dashboard: feature toggles, health indicators, credential UI
- [x] Browser automation (Playwright integration — 6 tools implemented with BrowserPool)
- [ ] Web scraper configuration panel in dashboard
- [ ] Browser automation session manager (dashboard UI for managing active pages)
- [ ] Extraction history and results viewer
- [ ] Pre-built one-click MCP server integrations

## AI Providers

- [x] DeepSeek provider (deepseek-chat, deepseek-coder, deepseek-reasoner)
- [ ] Mistral provider

## Adaptive Learning (Phase 7.1)

- [x] Feedback collection system (thumbs-up/thumbs-down on chat messages)
- [x] User preference profile (stored as 'preference' memories in Brain)
- [x] Conversation pattern analysis (response length, code usage)
- [x] Preference injection into system prompt
- [ ] Explicit correction UI (inline text correction)
- [ ] Preference visualization dashboard

## Future

- [ ] Distributed deployment (Kubernetes)
- [ ] ML-based anomaly detection
- [ ] Mobile app (native iOS/Android)

---

## Research Areas

- Sandbox: seccomp vs eBPF, gVisor, WASM isolation
- Encryption: libsodium vs WebCrypto, HSM integration
- Visualization: WebGL for large graphs, layout algorithms (Dagre, ELK)
- Real-time: Redis pub/sub, CRDT for collaborative editing

---

*See [CHANGELOG.md](CHANGELOG.md) for release history.*
*See [docs/development/roadmap.md](docs/development/roadmap.md) for the development roadmap.*
