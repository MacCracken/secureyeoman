# F.R.I.D.A.Y. — Open Items

> Tracking open work items as of `2026.2.16`.

---

## Dashboard

- [ ] Storybook for component development
- [ ] Test connection button for integrations (requires backend endpoint)
- [x] Node detail expansion in MetricsGraph
- [x] HTML prompt injection protection (DOMPurify sanitization)

## Integrations

- [ ] Telegram inline keyboards, photo/document/voice attachments
- [ ] Discord thread support for multi-turn conversations
- [ ] Slack interactive messages (blocks, modals)
- [ ] WhatsApp integration
- [ ] Calendar integration
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
- [ ] Browser automation (Playwright/Puppeteer integration — placeholders registered)
- [ ] Web scraper configuration panel in dashboard
- [ ] Browser automation session manager
- [ ] Extraction history and results viewer
- [ ] Pre-built one-click MCP server integrations

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
