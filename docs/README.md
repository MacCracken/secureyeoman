# SecureYeoman Documentation

## Quick Start

- [Getting Started](guides/getting-started/getting-started.md)
- [CLI Reference](guides/getting-started/cli-reference.md)
- [Configuration](configuration.md)
- [Troubleshooting](troubleshooting.md)

## Architecture & Decisions

- [ADR Index](adr/) — 39 architecture decision records (001–043)
  - [001–012](adr/) — Foundation (system, security, AI, agents, brain, training, dashboard, MCP, integrations, soul, marketplace, operations)
  - [013–043](adr/) — Feature-specific (DLP, HA, supply chain, chaos, federated learning, simulation, edge, agent binary, GPU routing, sandbox hardening, etc.)

## Guides

### [Getting Started](guides/getting-started/)
Setup, CLI reference, first steps.

### [Security](guides/security/)
SSO/SAML, DLP, confidential computing, sandbox profiles, rate limiting, secrets, TLS, multi-tenancy, guardrails, governance, constitutional AI.

### [AI & LLM](guides/ai-and-llm/)
AI providers, inference optimization, training/fine-tuning, pre-training, continual learning, federated learning, knowledge/memory, agent eval, agent replay.

### [Integrations](guides/integrations/)
Service integrations, BullShift trading, Gmail/Twitter, GitHub, code forges, CI/CD.

### [Platform Features](guides/platform-features/)
Personalities, skills marketplace, workflows, swarms, conversations, notifications, editor, dashboard, teams, simulation, risk register.

### [Enterprise](guides/enterprise/)
Licensing, chaos engineering, supply chain, policy-as-code, IaC, HA, backup/DR, federation, A2A delegation, observability, Twingate.

### [Deployment](guides/deployment/)
Kubernetes, API gateway mode, Docker MCP tools, native clients, edge/IoT, audio quality.

### [Tools](guides/tools/)
Custom MCP tools, MCP context optimization, network tools.

## Reference

- [API Specification](openapi.yaml)
- [API Documentation](api/)
- [Security Model](guides/security/security-model.md)
- [Features Overview](features.md)
- [White Paper](white-paper.md)
- [Marketing Strategy](marketing-strategy.md)
- [Deployment Guide](deployment.md)

## Development

- [Roadmap](development/roadmap.md)
- [Contributing & Dev Reference](development/contributing.md)
- [Architecture Overview](development/architecture.md)
- [Functional Audit](development/functional-audit.md)
- [Dependency Watch](development/dependency-watch.md)
