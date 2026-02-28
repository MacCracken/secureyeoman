# Prompt Engineering Quartet Swarm

The `prompt-engineering-quartet` is a builtin swarm template that runs four specialist agents in sequence to produce a fully engineered AI prompt with formal acceptance criteria and constraints.

## The Pipeline

```
Task ──► intent-engineer ──► context-engineer ──► prompt-crafter ──► spec-engineer ──► Deliverable
```

| Stage | Agent | Output |
|---|---|---|
| 1 | **Intent Engineer** | Clarified goal with resolved dimensions (audience, format, scope, constraints) and surfaced implicit sub-goals |
| 2 | **Context Engineer** | Context window architecture — what to retrieve, compress, and include — with token budget breakdown |
| 3 | **Prompt Crafter** | Diagnosis of weaknesses + fully rewritten prompt with technique selection rationale |
| 4 | **Spec Engineer** | Formal contract: self-contained problem statement, enumerated acceptance criteria, tiered constraints, decomposition map |

Each agent receives the previous agent's output as additional context — the chain accumulates understanding as it progresses.

## When to Use It

Use `prompt-engineering-quartet` when you need to:

- Turn a vague prompt idea into a production-ready, verifiable prompt
- Audit and harden an existing prompt end-to-end
- Produce a prompt that will be reused across many AI calls (the spec provides a quality benchmark)
- Train junior prompt engineers — the four-stage output is a complete worked example

Do **not** use it for:
- Simple one-off prompts where a single Prompt Craft invocation is sufficient
- Tasks where the intent is already crystal clear and fully specified

## Invoking the Swarm

### Via the `create_swarm` MCP tool (in a personality conversation)

```
create_swarm(
  template: "prompt-engineering-quartet",
  task: "Engineer a prompt for extracting structured JSON from legal contracts",
  context: "The AI will process PDFs from a legal firm. Output must be deterministic JSON. The model is GPT-4o.",
  tokenBudget: 200000
)
```

### Via the REST API

```bash
curl -X POST http://localhost:18789/api/v1/agents/swarms \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "prompt-engineering-quartet",
    "task": "Engineer a prompt for extracting structured JSON from legal contracts",
    "context": "The AI will process PDFs from a legal firm. Output must be deterministic JSON. The model is GPT-4o.",
    "tokenBudget": 200000
  }'
```

### Via the Dashboard

1. Navigate to **Agents → Swarms**
2. Click **New Swarm Run**
3. Select **prompt-engineering-quartet** from the template list
4. Enter your task and optional context
5. Click **Run**

## Reading the Results

The swarm returns a `SwarmRun` with four `SwarmMember` entries — one per agent. Each member's `result` field contains that stage's full output:

```json
{
  "id": "run-...",
  "status": "completed",
  "result": "...(spec-engineer's final spec)...",
  "members": [
    { "role": "intent-engineer",   "result": "### Interpreted Goal\n..." },
    { "role": "context-engineer",  "result": "### Context Audit\n..." },
    { "role": "prompt-crafter",    "result": "### Diagnosis\n..." },
    { "role": "spec-engineer",     "result": "### Problem Statement\n..." }
  ]
}
```

The top-level `result` is the spec-engineer's final output. Inspect individual members to trace the chain of reasoning.

## Token Budget Guidance

The four agents allocate their budgets internally:

| Agent | Default Budget |
|---|---|
| intent-engineer | 40,000 |
| context-engineer | 50,000 |
| prompt-crafter | 50,000 |
| spec-engineer | 60,000 |

When specifying `tokenBudget` for the swarm run, the manager splits the budget across agents proportionally. For most tasks, **200,000 tokens** is sufficient. For very complex prompts or long context windows, use **400,000**.

## Prerequisites

Swarms must be enabled at both the global and personality level:

1. **Global**: Settings → Security → Sub-Agents → Enable Swarms
2. **Personality**: Personality Editor → Creation Settings → Allow Swarms

See the [Sub-Agent Delegation guide](./sub-agent-delegation.md) for setup details.

## Agent Profiles

The four profiles used by this template are all **reasoning-only** — they have no filesystem, git, or web tool access. They operate purely on provided context plus memory/knowledge base lookups. This is intentional: prompt engineering is a reasoning task, not a data-gathering task.

If your task requires researching the problem domain first, run a `research-and-code` swarm (or a simple `delegate_task` to the `researcher` profile) before invoking the quartet.

## Example Output

**Task**: *"Engineer a prompt for a customer support triage agent that classifies inbound tickets by urgency and routes them to the correct team."*

---

**Intent Engineer output** (excerpt):
> ### Interpreted Goal
> Design a classification + routing prompt for a support triage AI that reads inbound tickets and outputs: urgency level (P1/P2/P3/P4), team assignment (Engineering/Billing/Product/General), and a one-sentence reason.
>
> ### Resolved Dimensions
> | Dimension | Value | How Resolved |
> |-----------|-------|--------------|
> | Goal | Classify urgency + route to team | stated |
> | Audience | Support triage system (not human) | inferred from "agent" |
> | Format | Structured JSON output | inferred from machine-to-machine routing use case |
> | Scope | Inbound tickets only — no reply drafting | assumed, flagged |

---

**Prompt Crafter output** (excerpt):
> ### Diagnosis
> - **Weaknesses found**: No output format specified; urgency labels undefined; no examples of P1 vs P2 tickets
> - **Technique recommended**: Few-shot (3–5 labeled examples) + explicit JSON schema seeding
>
> ### Rewritten Prompt
> ```
> You are a support ticket triage agent. Classify the ticket and respond ONLY with valid JSON matching this schema:
> {"urgency": "P1"|"P2"|"P3"|"P4", "team": "Engineering"|"Billing"|"Product"|"General", "reason": string}
>
> Urgency levels:
> P1 — system down, data loss, security breach (respond in <1h)
> P2 — major feature broken, affecting multiple users (respond in <4h)
> P3 — minor issue, workaround available (respond in <24h)
> P4 — question or feedback (respond in <72h)
> ...
> ```

---

**Spec Engineer output** (excerpt):
> ### Acceptance Criteria
> - [ ] AC1 — Output is valid JSON parseable without error
> - [ ] AC2 — `urgency` field is exactly one of: P1, P2, P3, P4
> - [ ] AC3 — `team` field is exactly one of: Engineering, Billing, Product, General
> - [ ] AC4 — `reason` is ≤ 25 words
> - [ ] AC5 — P1 tickets are never classified as P3 or P4 (regression test required)
> - [ ] AC6 — Response contains no additional text outside the JSON object
