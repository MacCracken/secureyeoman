# F.R.I.D.A.Y. — Open Items

> Tracking open and deferred work items. For completed work, see [CHANGELOG.md](CHANGELOG.md).

**Project Status**: Phases 1-5 complete. 963 tests across 59 test files. All core features implemented.

---

## Deferred Dashboard Features

- [ ] Storybook for component development
- [ ] Date range picker for TaskHistory
- [ ] Export functionality for TaskHistory
- [ ] User profile dropdown
- [ ] Notification bell
- [ ] Search bar
- [ ] Test connection button for integrations
- [ ] Security settings page (RBAC defaults, rate limit config)
- [ ] Notification settings page
- [ ] Log retention settings page
- [ ] Message queue for offline WebSocket
- [ ] User preferences state management
- [ ] Node detail expansion in MetricsGraph
- [ ] Event acknowledgment and investigation workflow in SecurityEvents

## Deferred Security Features

- [ ] Retention policy enforcement for audit logs
- [ ] Encrypted config file support (config loader consuming SecretStore)
- [ ] seccomp-bpf filter creation (requires native bindings)
- [ ] Namespace isolation (PID, network, mount)

## Deferred Integration Features

- [ ] Plugin loader with dynamic import (currently manual registration)
- [ ] Zod-validated per-plugin config schema
- [ ] Media handling (images, files, voice) with size limits
- [ ] Reply threading and context preservation
- [ ] Telegram inline keyboards, photo/document/voice attachments
- [ ] Discord thread support for multi-turn conversations
- [ ] Slack interactive messages (blocks, modals)
- [ ] WhatsApp integration (P4-006)
- [ ] Calendar integration (P4-008)
- [ ] GitHub PR review automation via AI
- [ ] GitHub code search and file browsing

## Deferred Production Features

- [ ] Release notes generation from conventional commits
- [ ] Remember me toggle on login
- [ ] Password reset flow
- [ ] 2FA support

---

## Future Enhancements

### v1.1 (Post-MVP)

- [ ] MCP protocol support (Model Context Protocol)
- [ ] Skill marketplace — browse and install community skills
- [ ] Custom dashboards — user-configurable layouts
- [ ] Outbound webhooks for events

### v1.2

- [ ] Team workspaces — multi-user collaboration
- [ ] Audit report generator — compliance report export
- [ ] Cost optimization — token usage recommendations
- [ ] A/B testing — model comparison experiments

### v2.0

- [ ] Distributed deployment — Kubernetes-native
- [ ] ML-based anomaly detection — advanced threat detection
- [ ] Voice interface — speech-to-text interaction
- [ ] Mobile app — native iOS/Android dashboard

---

## Research Areas

- Sandbox: seccomp vs eBPF, gVisor, WASM isolation
- Encryption: libsodium vs WebCrypto, HSM integration
- Visualization: WebGL for large graphs, layout algorithms (Dagre, ELK)
- Real-time: Redis pub/sub, CRDT for collaborative editing

---

*See [CHANGELOG.md](CHANGELOG.md) for completed work history.*
*See [docs/development/roadmap.md](docs/development/roadmap.md) for the development roadmap.*

*Last updated: February 2026*
