# ADR 037: Agent-to-Agent (A2A) Protocol

## Status

Accepted (2026-02-16)

## Context

Phase 6.3 established sub-agent delegation within a single FRIDAY instance — the primary agent spawns subordinate agents locally. However, in multi-instance deployments (e.g., specialized FRIDAY instances per team or function), there is no mechanism for one FRIDAY to delegate tasks to another over the network.

FRIDAY already has E2E encrypted inter-agent communication (Phase 2.5, `comms/` module) using X25519 key exchange, Ed25519 signing, and AES-256-GCM encryption. This provides the transport security foundation needed for cross-instance delegation.

## Decision

### Protocol Design

Extend the existing comms layer with delegation-specific message types that mirror the local SubAgentManager interface:

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `delegation_offer` | Requester → Provider | Propose a task with profile, budget, and timeout |
| `delegation_accept` | Provider → Requester | Accept the task, return delegationId |
| `delegation_reject` | Provider → Requester | Reject with reason (busy, no matching profile, budget too low) |
| `delegation_status` | Provider → Requester | Periodic status update (running, progress) |
| `delegation_result` | Provider → Requester | Final result with token usage and sealed conversation |
| `delegation_cancel` | Requester → Provider | Cancel an active delegation |
| `capability_query` | Requester → Provider | Request available profiles and capacity |
| `capability_response` | Provider → Requester | Advertise profiles, token budgets, current load |

### Discovery

Three discovery mechanisms, configurable per deployment:

1. **Static peers** — Existing comms peer registry (manual configuration)
2. **mDNS** — Automatic LAN discovery using `_friday-a2a._tcp` service type
3. **DNS-SD** — WAN discovery via DNS SRV/TXT records for cross-network deployments

### Capability Negotiation

Before delegating, the requester queries the provider's capabilities:
- Available agent profiles (name, description, max budget)
- Current capacity (active delegations, remaining concurrent slots)
- Supported protocol version
- Trust level (peer, trusted, verified)

### Trust Model

- All A2A messages are E2E encrypted using the existing comms crypto layer
- Delegation requests include the requester's signed capability assertion
- Providers can configure allowlists/denylists for which peers may delegate
- Token budgets are enforced by both requester and provider independently
- Results include a cryptographic proof (signed hash of sealed conversation)

### Integration with SubAgentManager

The A2A protocol extends `SubAgentManager` with a `RemoteDelegationTransport`:
- When delegating, the manager first checks local profiles; if no match or if the task specifies a remote target, it uses A2A
- Remote delegations appear in the same delegation tree as local ones, tagged with `remote: true` and the provider's agent ID
- The dashboard shows remote delegations with a network icon

## Consequences

### Positive
- Specialized FRIDAY instances can collaborate on complex tasks
- Leverages existing E2E encryption — no new security infrastructure needed
- Transparent to the delegation tree — local and remote delegations unified
- Discovery mechanisms scale from dev (mDNS) to production (DNS-SD)

### Negative
- Network latency adds overhead compared to local delegation
- Partial failure modes (network partition, provider crash) require robust error handling
- Trust negotiation adds complexity to the delegation flow
- Protocol versioning needed as the system evolves

### Risks
- Man-in-the-middle on discovery (mDNS spoofing) — mitigated by requiring signed capability responses
- Resource exhaustion from external delegation requests — mitigated by per-peer rate limits and capacity checks
- Protocol drift between FRIDAY versions — mitigated by version negotiation in capability exchange

## Implementation Notes

**Implemented**: 2026-02-16

- A2A message types (delegation_offer, delegation_accept, delegation_reject, delegation_status, delegation_result, delegation_cancel, capability_query, capability_response) implemented in the comms layer
- Three discovery mechanisms (static peers, mDNS via `_friday-a2a._tcp`, DNS-SD) are configurable per deployment
- Capability negotiation protocol advertises available profiles, token budgets, current load, and protocol version
- Trust model uses existing E2E encryption with signed capability assertions and configurable peer allowlists/denylists
- Remote delegation transport extends SubAgentManager; remote delegations appear in the same delegation tree tagged with `remote: true`
- REST API endpoints under `/api/v1/a2a/` for peer management, discovery, delegation, and messaging
- Dashboard shows remote delegations with a network icon in the sub-agent execution tree
