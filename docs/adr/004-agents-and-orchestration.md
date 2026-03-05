# ADR 004: Agents & Orchestration

## Status

Accepted

## Context

SecureYeoman began as a single-agent system where one personality handled all tasks regardless of complexity. Complex multi-step tasks required the agent to context-switch between research, coding, analysis, and summarization within a single conversation, polluting context and reducing output quality. As the platform matured, requirements emerged for hierarchical delegation, coordinated multi-agent execution, cross-instance collaboration, human oversight of AI-initiated actions, desktop interaction capabilities, and configuration versioning with rollback.

The orchestration system is built on the principle that each layer of complexity is additive and opt-in: simple deployments use a single agent, teams enable focused delegation, swarms provide coordinated pipelines, and cross-instance A2A protocol extends collaboration across the network. Every layer enforces the same security invariants: RBAC inheritance, token budgets, audit trails, and configurable kill switches.

## Decisions

### Sub-Agent Delegation

The delegation system spawns specialized subordinate agents with isolated contexts. Each sub-agent receives a distinct prompt profile optimized for its task type rather than inheriting the parent's personality.

**Default profiles** ship with the system:

| Profile | Purpose |
|---------|---------|
| `researcher` | Information gathering, web search, document analysis |
| `coder` | Code generation, debugging, refactoring |
| `analyst` | Data analysis, comparison, decision support |
| `summarizer` | Content compression, report generation |

Profiles are defined as Markdown files with YAML frontmatter specifying the name, description, maximum token budget, and allowed tools. Custom profiles can be placed in user or workspace-scoped directories.

**Context isolation** is strict: each sub-agent starts with a fresh conversation history, receives the parent's task and optional context as its initial message, and can read shared Brain memories but tags its writes with the delegation ID. On completion, the sub-agent's full context is sealed into a single result message returned to the parent. The full context is not merged back.

**Hierarchy and depth control** form a tree structure visible in the dashboard. Sub-agents can delegate further up to a configurable maximum depth (default: 3). At maximum depth, the delegation tool is unavailable. Sub-agents inherit the parent's RBAC scope and cannot access resources the parent cannot. Token budgets are enforced per sub-agent with a hard minimum floor of 20,000 tokens to prevent premature task termination.

**Three execution types** are supported:

| Type | Behavior | Token Cost |
|------|----------|------------|
| `llm` | Full agentic loop with LLM reasoning and tool calling | Standard |
| `binary` | Spawns a local executable speaking JSON stdin/stdout protocol | Zero |
| `mcp-bridge` | Calls a named MCP tool directly with template-interpolated input | Zero |

Binary execution is gated by an `allowBinaryAgents` security toggle (default: off). The binary path includes timeout enforcement with SIGTERM/SIGKILL escalation and abort signal handling.

**Tool injection** ensures that personality-level creation capabilities (skills, tasks, personalities, sub-agents, workflows, roles, experiments, A2A connections, swarms, dynamic tools) are surfaced as structured tool definitions in the AI's tool list. Each toggle in `creationConfig` gates its corresponding tools; a disabled body receives no creation tools regardless of individual toggles.

**Resource action recording** provides a unified persistence path for all tool executions during the agentic loop. Every recognized tool call produces both a sparkle card (visual feedback in the chat) and a task history entry through a single code path. Action verbs (Created, Updated, Deleted, Triggered, Assigned, Connected, Delegated) are derived from the tool name prefix.

### Agent Swarms

Swarms are coordinated multi-agent execution pipelines built on top of the delegation primitive. They define reusable templates with three orchestration strategies:

| Strategy | Behavior |
|----------|----------|
| `sequential` | Roles execute one at a time; each receives the previous role's result as context |
| `parallel` | All roles execute simultaneously; an optional coordinator synthesizes results |
| `dynamic` | A coordinator profile is delegated to and uses the delegation tool to spawn agents as needed |

Built-in templates include research-and-code (sequential: researcher, coder, reviewer), analyze-and-summarize (sequential: researcher, analyst, summarizer), parallel-research (parallel: two researchers with analyst synthesis), and code-review (sequential: coder, reviewer).

Swarms are gated by the `allowSwarms` security policy toggle and per-personality `creationConfig.allowSwarms` opt-in. Cost-aware scheduling applies intelligent model routing to each swarm role, selecting cost-appropriate models based on task complexity. Pre-execution cost estimation via the cost API returns per-role model decisions and total estimated cost.

### Teams & Crew

The **Team** primitive introduces dynamic task assignment by a coordinator LLM, distinct from swarms' deterministic topology. A coordinator reads member descriptions and assigns each task at runtime by responding with structured JSON (`{"assignTo": [...], "reasoning": "..."}`). Multiple assigned members are dispatched in parallel with results synthesized by a second coordinator call. Invalid coordinator JSON falls back to the first team member.

Teams are stored in `agents.teams` with runs tracked in `agents.team_runs`. Three built-in team templates are seeded on startup. The `secureyeoman crew` CLI (aliased as `team`) provides `list`, `show`, `import`, `export`, `run`, and `runs` subcommands, with YAML import/export for portable team definitions.

**QA team integration** bridges SecureYeoman agents to the external Agnostic QA platform, a 6-agent CrewAI system providing QA management, testing, security/compliance, and performance analysis. Nine MCP tools bridge the connection (health, agent status, queue depths, dashboard metrics, session management, report generation, task submission, and task polling). Container lifecycle management is first-class via the `secureyeoman agnostic` CLI command, with optional auto-start on gateway boot.

**Workflow trigger modes** extend step dependency semantics with `triggerMode: 'any' | 'all'` (default: `'all'`). The `'any'` mode lowers a step's dependency threshold so it executes after its earliest dependency completes rather than waiting for all, enabling OR-trigger patterns in DAG workflows.

**Strict output schema enforcement** adds `outputSchemaMode: 'audit' | 'strict'` per workflow step, allowing mixed enforcement within a single workflow definition.

### A2A Protocol

The Agent-to-Agent protocol enables cross-instance delegation over the network. It extends the existing E2E encrypted communications layer (X25519 key exchange, Ed25519 signing, AES-256-GCM encryption) with delegation-specific message types that mirror the local delegation interface:

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `delegation_offer` | Requester to Provider | Propose a task with profile, budget, and timeout |
| `delegation_accept` / `reject` | Provider to Requester | Accept or reject with reason |
| `delegation_status` | Provider to Requester | Periodic progress updates |
| `delegation_result` | Provider to Requester | Final result with token usage |
| `capability_query` / `response` | Bidirectional | Advertise available profiles, capacity, and trust level |

**Discovery** supports three mechanisms: static peer configuration, mDNS for LAN discovery (`_secureyeoman-a2a._tcp`), and DNS-SD for WAN deployments. **Capability negotiation** queries available profiles, current capacity, supported protocol version, and trust level before delegating. Results include cryptographic proof (signed hash of the sealed conversation).

Remote delegations appear in the same delegation tree as local ones, tagged with `remote: true` and the provider's agent ID. The dashboard displays remote delegations with a network icon. A2A is gated by both the global `allowA2A` security toggle and per-personality `creationConfig.allowA2A` opt-in.

### DAG Workflows

Workflow definitions support directed acyclic graph (DAG) execution with topological sorting of steps. Steps declare dependencies via `dependsOn` arrays and execute in parallel within each dependency tier. The workflow engine supports multiple step types including agent execution, data transformation, resource operations, webhook calls, swarm orchestration, and diagram generation.

### Human-in-the-Loop

AI-initiated mutations are governed by a three-level automation control on each personality's resource policy:

| Level | Behavior |
|-------|----------|
| `supervised_auto` (default) | All AI actions proceed immediately |
| `semi_auto` | Destructive actions (delete operations, role revocation) are queued for approval; creative actions proceed |
| `full_manual` | Every AI-initiated creation or deletion is queued for human approval |

An **emergency stop** toggle immediately blocks all AI-initiated mutations regardless of automation level. Pending approvals are stored in a dedicated table with personality ID, tool name, arguments, and status (pending, approved, rejected). The dashboard exposes a review queue with approve/reject controls and a badge count.

### Self-Repairing Task Loop

A stuck-task detection layer operates as a stateful per-session `TaskLoop` class that identifies two failure modes invisible to the retry manager:

- **Timeout without failure**: the LLM keeps calling slow tools without progress, eventually timing out with no diagnostic information.
- **Tool-call repetition**: the LLM calls the same tool with identical arguments consecutively, indicating a reasoning loop.

When either condition is detected, a recovery prompt is injected as a user turn providing the model with elapsed time, the last tool name, its outcome, and guidance to try a different approach. This enables self-correction rather than blind retry.

### Computer Use

Desktop interaction is exposed through 12 REST endpoints covering mouse control (move, click, double-click, scroll), keyboard input (type, key press, hotkey), screen capture (screenshot, screen listing, window listing), and clipboard operations (read, write).

The security layer provides granular RBAC permissions on capture resources (`capture.screen`, `capture.camera`) with action-level controls (capture, stream, configure, review) and scope constraints (target, duration, quality). A `role_capture_operator` role template enforces duration-limited permissions. Binary execution of capture operations runs within a sandboxed environment with resource limits, filesystem restrictions, network isolation, and process limits.

Desktop interactions feed into a reinforcement learning pipeline that records episodes for skill improvement, with session statistics, skill breakdowns, and JSONL export for training data.

### Versioning

Personality configurations and workflow definitions support full version history with immutable snapshots. Every save operation creates a new version record containing:

- Monotonically increasing version number per entity
- Full JSON serialization of the entity state
- Creator identity and timestamp
- Optional human-readable change description

The current state remains in the original table for query performance; the version history serves as an append-only audit log. Users can tag versions with date-based labels following `YYYY.M.D` convention as named rollback targets.

**Drift detection** compares the live state against the last tagged version and surfaces differences as dashboard badges. **Rollback** reads the target version's snapshot, writes it as the current state, and creates a new version record documenting the rollback. A dependency-free unified diff implementation using the Longest Common Subsequence algorithm enables meaningful comparison between any two version snapshots.

## Consequences

**Positive:**
- Complex tasks are decomposed into focused subtasks handled by specialized agents with isolated contexts, producing higher quality results than a single generalist agent.
- Three execution types (LLM, binary, MCP-bridge) allow zero-token-cost delegation for deterministic tasks.
- Swarms provide reusable orchestration patterns with cost-aware model routing per role.
- Teams add dynamic coordinator-driven task assignment for situations where static topology is insufficient.
- A2A protocol enables collaboration across specialized instances with full E2E encryption and transparent integration into the delegation tree.
- Human-in-the-loop controls give operators granular oversight from full automation to complete manual approval, with emergency stop for crisis situations.
- Self-repairing task loops reduce wasted API calls and user frustration from stuck tasks.
- Configuration versioning with drift detection and rollback provides a safety net for production changes and a full audit trail for compliance.
- Every orchestration layer is opt-in with security policy gating, maintaining the principle that simple deployments stay simple.

**Negative / Trade-offs:**
- Each delegation requires a fresh LLM conversation, increasing total token usage compared to single-agent execution.
- Latency increases with delegation depth due to serial execution in hierarchical chains.
- Parallel swarm delegations count against the concurrency limit simultaneously; large templates may hit the cap.
- Cross-instance A2A delegation adds network latency and partial failure modes (network partition, provider crash).
- Binary sub-agents inherit the process environment and lack sandbox isolation comparable to the code execution sandbox.
- Approved human-in-the-loop actions are not automatically re-executed; operators must re-trigger manually.
- Version history storage grows over time; a future retention policy may be needed for high-churn entities.
- Dynamic team coordination effectiveness depends on the coordinator profile's system prompt quality.
