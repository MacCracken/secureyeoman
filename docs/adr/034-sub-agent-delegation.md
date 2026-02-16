# ADR 034: Sub-Agent Delegation System

## Status

Proposed

## Context

FRIDAY operates as a single-agent system — one personality handles all tasks regardless of complexity. When faced with multi-step tasks requiring different expertise (research, coding, analysis), the single agent must context-switch, polluting its conversation context and reducing focus.

Agent Zero's hierarchical multi-agent delegation demonstrates that spawning specialized subordinate agents with isolated contexts dramatically improves complex task handling.

## Decision

### Specialized Agent Profiles

Sub-agents receive distinct prompt profiles rather than inheriting the parent's Soul. Each profile is an optimized persona for a task type:

**Default profiles** (shipped with FRIDAY):

| Profile | Purpose | Prompt Focus |
|---------|---------|-------------|
| `researcher` | Information gathering, web search, document analysis | Thoroughness, source attribution, structured findings |
| `coder` | Code generation, debugging, refactoring | Precision, existing patterns, test coverage |
| `analyst` | Data analysis, comparison, decision support | Objectivity, quantitative reasoning, tradeoff analysis |
| `summarizer` | Content compression, report generation | Brevity, key point extraction, audience awareness |

**Profile definition format** (Markdown with YAML frontmatter):

```markdown
---
name: researcher
description: Information gathering and analysis specialist
maxTokenBudget: 50000
allowedTools:
  - memory_load
  - memory_save
  - search
  - document_query
  - web_fetch
---

# Researcher Agent

You are a focused research specialist. Your task is to gather, verify, and structure information for your superior agent.

## Behavior
- Be thorough but concise in your findings
- Always cite sources
- Structure output as actionable findings
...
```

**Custom profiles**: Users create profiles in `~/.secureyeoman/profiles/` or workspace-scoped `profiles/` directories.

### SubAgentManager

```typescript
interface SubAgentManager {
  delegate(params: DelegationParams): Promise<DelegationResult>;
  listActive(): SubAgentInfo[];
  cancel(delegationId: string): Promise<void>;
  getResult(delegationId: string): Promise<DelegationResult | null>;
}

interface DelegationParams {
  profile: string;              // profile name (researcher, coder, etc.)
  task: string;                 // natural language task description
  context?: string;             // optional context from parent
  maxTokenBudget?: number;      // override profile default
  maxDepth?: number;            // override global max depth
  timeout?: number;             // ms, default 300000 (5 min)
}

interface DelegationResult {
  delegationId: string;
  profile: string;
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  result: string;               // sub-agent's final response
  tokenUsage: { prompt: number; completion: number; cost: number };
  duration: number;
  subDelegations?: DelegationResult[];  // nested delegations
}
```

### Context Isolation

Each sub-agent operates in complete isolation:

1. **Own conversation context**: Fresh message history, no access to parent's conversation
2. **Task injection**: The parent's delegation task and optional context are injected as the initial user message
3. **Brain access**: Sub-agents can read shared Brain memories but writes are scoped (tagged with `delegationId`)
4. **Sealing on completion**: When a sub-agent completes, its conversation context is sealed — summarized into a single result message returned to the parent. The full context is not merged back

### Hierarchy and Depth Control

- **Max depth**: Configurable (default: 3). Sub-agents can delegate further up to this limit
- **Depth tracking**: Each agent carries a `depth` counter. At max depth, the `delegate_task` tool is unavailable
- **Tree structure**: Each delegation tracks its parent and children, forming a tree visible in the dashboard

### RBAC Inheritance

- Sub-agents inherit the **parent's RBAC scope** — they cannot access resources or APIs the parent cannot
- Token budgets are enforced per sub-agent and deducted from the parent's allocation
- If a sub-agent exceeds its budget, it is forced to return its current best result

### MCP Tools

Three new MCP tools for the primary agent:

```
delegate_task(profile, task, context?, maxTokens?)
  → Spawns a sub-agent, blocks until completion, returns result

list_sub_agents()
  → Returns active and completed delegations with status

get_delegation_result(delegationId)
  → Retrieves result of a completed delegation
```

### Configuration

```yaml
agents:
  delegation:
    enabled: true
    maxDepth: 3
    defaultTimeout: 300000       # 5 minutes
    maxConcurrent: 5             # max simultaneous sub-agents
    tokenBudget:
      default: 50000             # per sub-agent default
      max: 200000                # hard cap per sub-agent
    profiles:
      directory: ~/.secureyeoman/profiles
    context:
      sealOnComplete: true       # summarize and seal sub-agent context
      brainWriteScope: delegated # 'delegated' (tagged) or 'shared' (full access)
```

## Consequences

### Positive
- Complex tasks decomposed into focused subtasks with specialized agents
- Context isolation prevents conversation pollution from subtask details
- Token budgets prevent runaway costs from deep delegation chains
- Specialized profiles produce higher quality results than a generalist agent
- RBAC inheritance maintains security invariants across the hierarchy

### Negative
- Each delegation requires a fresh LLM conversation — higher total token usage than single-agent
- Latency increases with delegation depth (serial execution)
- Profile quality directly impacts sub-agent effectiveness — poor prompts produce poor results
- Coordination overhead for tasks requiring tight coupling between subtasks

### Risks
- Infinite delegation loops — mitigated by max depth and token budgets
- Sub-agent hallucination not caught by parent — mitigated by requiring structured results
