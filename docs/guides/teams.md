# Teams — Dynamic Auto-Manager Agent Teams

**Phase 83** | ADR 163

A **Team** is a dynamic multi-agent coordinator: instead of a pre-wired delegation graph (like Swarms), a coordinator LLM reads team member descriptions and decides who to assign each task to at runtime.

---

## Concepts

| Concept | Swarm | Team |
|---------|-------|------|
| Topology | Pre-wired (roles + strategy) | Dynamic (coordinator decides) |
| Assignment | Deterministic per role | LLM-assigned per run |
| Use case | Reproducible pipelines | Open-ended tasks |
| Parallelism | Strategy-controlled | Automatic when multiple assigned |

---

## Builtin Teams

Three teams are seeded on startup:

| Name | Members | Coordinator |
|------|---------|-------------|
| `Full-Stack Development Crew` | researcher, coder, reviewer, spec-engineer | researcher |
| `Research Team` | researcher, analyst | researcher |
| `Security Audit Team` | analyst, reviewer, spec-engineer | analyst |

---

## CLI Usage

```bash
# List all teams
secureyeoman crew list

# Show a team and its recent runs
secureyeoman crew show <id>

# Run a team on a task (waits for result)
secureyeoman crew run <id> "Analyze the security posture of our API gateway"

# Import a team from YAML
secureyeoman crew import my-team.yaml

# Export a team to YAML
secureyeoman crew export <id>
secureyeoman crew export <id> --out team.yaml

# List recent runs (all teams or one team)
secureyeoman crew runs
secureyeoman crew runs <teamId>
```

---

## YAML Format

```yaml
name: "Full-Stack Development Crew"
description: "A crew for end-to-end feature development"
members:
  - role: "Backend Engineer"
    profileName: coder
    description: "Implements APIs and database logic"
  - role: "Reviewer"
    profileName: reviewer
    description: "Reviews code for quality and security"
  - role: "Spec Engineer"
    profileName: spec-engineer
    description: "Writes technical specifications"
coordinatorProfileName: researcher  # optional; uses default model if omitted
```

Import with:
```bash
secureyeoman crew import my-team.yaml
```

---

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/agents/teams` | List teams |
| POST | `/api/v1/agents/teams` | Create team |
| GET | `/api/v1/agents/teams/:id` | Get team |
| PUT | `/api/v1/agents/teams/:id` | Update team |
| DELETE | `/api/v1/agents/teams/:id` | Delete team |
| POST | `/api/v1/agents/teams/:id/run` | Start a team run (202) |
| GET | `/api/v1/agents/teams/runs/:runId` | Get run status |

### Start a run

```http
POST /api/v1/agents/teams/team-123/run
Content-Type: application/json

{
  "task": "Audit the authentication module for security vulnerabilities",
  "context": "Focus on JWT handling and session management",
  "tokenBudget": 50000
}
```

Response (202 Accepted):
```json
{
  "run": {
    "id": "run-abc123",
    "status": "pending",
    "teamId": "team-123",
    "task": "Audit the authentication module..."
  }
}
```

Poll for completion:
```http
GET /api/v1/agents/teams/runs/run-abc123
```

---

## How the Coordinator Works

1. The coordinator receives a prompt listing all team members with their roles and descriptions.
2. It responds with `{"assignTo": ["profileName1", ...], "reasoning": "..."}`.
3. The assigned profiles are validated against team members; invalid names fall back to the first member.
4. Delegations are dispatched in parallel when multiple members are assigned.
5. If multiple results are returned, a synthesis call combines them into a single response.

---

## Workflow `triggerMode: 'any'`

Workflow steps can now use `triggerMode: 'any'` to run after any one of their dependencies completes (OR-trigger), instead of waiting for all (default AND-trigger):

```json
{
  "id": "process",
  "type": "agent",
  "dependsOn": ["source-a", "source-b"],
  "triggerMode": "any",
  "config": { "profile": "analyst", "taskTemplate": "Process first available result" }
}
```

If **all** upstream deps fail or are skipped, the `any`-step is also skipped.

---

## Strict Output Schema Enforcement

Steps can opt into strict schema enforcement via `outputSchemaMode: 'strict'` in their `config`:

```json
{
  "id": "classify",
  "type": "agent",
  "config": {
    "profile": "classifier",
    "taskTemplate": "Classify the input",
    "outputSchema": { "type": "object", "required": ["category", "confidence"] },
    "outputSchemaMode": "strict"
  }
}
```

In `strict` mode the step **fails** (rather than just logging a warning) when the output doesn't match the schema. This propagates through `onError` as normal — `onError: 'continue'` will still allow the workflow to proceed.

The default (`audit`) retains the existing behaviour: log a warning + emit an audit event, but continue execution.
