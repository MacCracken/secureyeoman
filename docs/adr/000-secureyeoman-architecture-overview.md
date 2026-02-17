# ADR 000: SecureYeoman Architecture Overview

## Status

Accepted

## Context

SecureYeoman is an OpenClaw-inspired autonomous agent system designed with security-first principles. This ADR establishes the foundational architecture that all other ADRs build upon.

## Decision

### Core Philosophy

SecureYeoman embodies the **Yeoman Philosophy**, built on three pillars:

```
    DEPENDABILITY          SECURITY              LOYALTY
         |                    |                    |
    Precise execution    Trusted protector    User's interest
    Reliable output      Domain guardian      Privacy first
    Graceful recovery    Threat detection     No data leaks
```

#### Security Maxims

1. **Deny by Default**: All permissions are explicitly granted, never assumed
2. **Defense in Depth**: Multiple security layers, no single point of failure
3. **Least Privilege**: Minimum permissions required for each operation
4. **Fail Secure**: On error, default to the most restrictive state
5. **Audit Everything**: If it happened, there's a log entry

### System Identity

**Agent Persona:**
- **Name**: SecureYeoman
- **Version**: 1.3.1
- **Default Personality**: F.R.I.D.A.Y.
- **Role**: Secure Autonomous Agent
- **Classification**: Enterprise Security Module

**Identity Statement**:
> I am SecureYeoman, a security-hardened autonomous agent. My primary directive is to execute tasks securely while maintaining complete transparency through comprehensive logging. I prioritize security over speed, audit trails over convenience, and user privacy above all else.

**Capabilities:**
- Secure task execution with sandboxing
- Real-time performance metrics collection
- Cryptographically verified audit logging
- Multi-platform integration management
- Anomaly detection and incident response

**Restrictions:**
- Never execute without proper authentication
- Never bypass security protocols
- Never delete or modify audit logs
- Never expose secrets in logs or outputs
- Never connect to unverified endpoints

### Design Goals

| Goal | Description |
|------|-------------|
| **Security** | Never compromise on security for convenience |
| **Transparency** | All operations are logged and auditable |
| **Performance** | Minimal overhead from security/logging layers |
| **Extensibility** | Plugin architecture for custom integrations |
| **Privacy** | Local-first, user data never leaves the system |

### Key Features

- **Enterprise-Grade Security**: RBAC, JWT/API key auth, encryption at rest, sandboxed execution, rate limiting, input validation
- **Task Persistence**: SQLite-backed task history with filtering, pagination, and real-time metrics
- **Comprehensive Task Logging**: Every action logged with cryptographic integrity verification
- **Real-Time Performance Metrics**: Token consumption, task duration, resource usage, success rates
- **Integrated Dashboard**: Metrics graph, task history, security events, personality editor, skills manager, onboarding wizard
- **Audit Trail**: Immutable, cryptographically signed logs with SQLite storage and query API
- **Secret Management**: System keyring integration (macOS Keychain, Linux Secret Service), automatic rotation, expiry tracking
- **Multi-Provider AI**: Anthropic, OpenAI, Google Gemini, Ollama with unified client, retry, cost tracking
- **Soul System**: Editable personality (name, traits, sex, voice, preferred language) and learnable skills that compose into AI system prompts
- **CLI**: `secureyeoman` command with arg parsing, startup banner, graceful shutdown

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SecureYeoman                            │
│                    (Agent System)                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    SecureYeoman                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Soul      │  │   Skills    │  │   Task Engine       │  │
│  │   System    │  │   Manager   │  │   (Body)            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Security Layer                          │    │
│  │  RBAC │ Auth │ Encryption │ Sandboxing │ Audit     │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Dashboard  │  │   Heartbeat │  │   Metrics           │  │
│  │   (Head)    │  │   Monitor   │  │   Collector        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Relationship to Other ADRs

This ADR serves as the foundation. Specific architectural decisions are documented in:

- **ADR 001**: Dashboard Chat Interface
- **ADR 002**: Runtime Model Switching
- **ADR 003**: Sacred Archetypes
- **ADR 004**: MCP Protocol Integration
- **ADR 005**: Team Workspaces
- **ADR 006**: A/B Testing Framework
- **ADR 007**: Skill Marketplace
- **ADR 008**: Coding IDE View
- **ADR 009**: Voice Interface
- **ADR 010**: Personality Model Binding
- **ADR 011**: Dynamic Model Discovery
- **ADR 012**: Heart-Body Hierarchy
- **ADR 013**: Heartbeat Task Scheduling & Knowledge CRUD
- **ADR 014**: Screen Capture Security Architecture
- **ADR 015**: RBAC Capture Permissions
- **ADR 016**: User Consent Capture
- **ADR 017**: Sandboxed Capture Execution
- **ADR 018**: Proactive Heartbeat Enhancements
- **ADR 025**: CLI, Webhook, and Google Chat Integration Completion
- **ADR 026**: MCP Service Package (`@secureyeoman/mcp`)

## Consequences

- All new ADRs should reference ADR 000 for foundational context
- Security decisions should align with the Five Security Maxims
- The Yeoman Philosophy guides all implementation decisions
- Breaking changes to core architecture require ADR revision

---

**Previous**: None (Foundational Document)  
**Next**: [ADR 001: Dashboard Chat Interface](./001-dashboard-chat.md)
