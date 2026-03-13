# Agent Swarms

Swarms let a single task fan out across multiple sub-agents running concurrently. Each agent in the swarm handles a specific role, and the results are aggregated into a final response. This guide covers creating swarm templates, running swarms, and understanding the built-in presets.

---

## Concepts

- **Template** — a named composition of roles, each mapped to an agent profile
- **Role** — a named slot in the template (e.g. `researcher`, `coder`, `reviewer`)
- **Profile** — an agent configuration (system prompt, skills, model) stored in `soul.agent_profiles`
- **Run** — an active execution of a swarm template against a specific task
- **Member** — one agent instance within a run, assigned to a role

Swarms require `allowSubAgents: true` and `allowSwarms: true` to be permitted — both controlled in **Settings → Security → Security Policy**.

---

## Built-in Templates

Five templates are pre-installed and cannot be edited or deleted.

### `research-and-code`

Three agents in sequence: Researcher → Coder → Reviewer.

| Role | Profile | What it does |
|------|---------|-------------|
| researcher | researcher | Gathers relevant information and context |
| coder | coder | Implements the solution based on research |
| reviewer | reviewer | Audits implementation for quality and correctness |

Best for: feature implementation, bug analysis, refactoring tasks.

### `analyze-and-summarize`

Three agents: Researcher → Analyst → Summarizer.

| Role | Profile | What it does |
|------|---------|-------------|
| researcher | researcher | Gathers raw data and sources |
| analyst | analyst | Interprets and analyzes the data |
| summarizer | summarizer | Produces a concise, clear summary |

Best for: research reports, document digestion, competitive analysis.

### `parallel-research`

Two researchers running in parallel, results merged.

| Role | Profile | What it does |
|------|---------|-------------|
| researcher-a | researcher | Research primary angle |
| researcher-b | researcher | Research secondary angle |
| synthesizer | summarizer | Merges both perspectives |

Best for: balanced analysis, "pros vs. cons", multi-source comparison.

### `code-review`

Two agents: Coder → Reviewer.

| Role | Profile | What it does |
|------|---------|-------------|
| coder | coder | Implements the requested code |
| reviewer | reviewer | Reviews for quality and correctness |

Best for: quick implementation + review cycles.

### `prompt-engineering-quartet`

Four agents focused on iterative prompt refinement (see the dedicated [Prompt Engineering Quartet guide](prompt-engineering-quartet-swarm.md)).

---

## Creating a Custom Template

### Dashboard

1. Go to **Agents → Swarm**
2. Click **New Template**
3. Fill in:
   - **Name** — URL-safe identifier (e.g. `my-analysis-swarm`)
   - **Description** — what the swarm is for
   - **Roles** — add one or more roles, each with a role name and agent profile assignment
   - **Token Budget** (optional) — max tokens for the entire swarm run
4. Click **Create Template**

Custom templates appear below the built-in presets. They can be edited or deleted; built-in templates cannot.

### API

```bash
curl -X POST https://your-instance/api/v1/agents/swarms/templates \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "security-audit",
    "description": "Assess code security then suggest fixes",
    "members": [
      { "role": "auditor",  "profileName": "security-expert" },
      { "role": "remediation", "profileName": "coder" }
    ],
    "tokenBudget": 50000
  }'
```

---

## Editing a Custom Template

### Dashboard

Click the **pencil** icon on any non-builtin template card to open the edit form. All fields are pre-populated.

### API

```bash
curl -X PATCH https://your-instance/api/v1/agents/swarms/templates/<id> \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "description": "Updated description", "tokenBudget": 75000 }'
```

Returns `403` if the template is built-in.

---

## Running a Swarm

### Dashboard

1. Select a template in **Agents → Swarm**
2. Enter the task prompt
3. Click **Run** — the swarm starts and members appear as live cards
4. Click **Cancel** to abort a running swarm

### API

```bash
# Start a run
curl -X POST https://your-instance/api/v1/agents/swarms \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "<template-id>",
    "task": "Analyze the security of our auth flow and suggest improvements",
    "personalityId": "optional-personality-id"
  }'

# Check run status
curl -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/agents/swarms/<run-id>

# Cancel a running swarm
curl -X POST -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/agents/swarms/<run-id>/cancel
```

### MCP Tool

The AI can start a swarm mid-conversation:

```
Ask: "Run the research-and-code swarm to implement a Redis cache layer"
→ The AI calls the delegate_task tool with swarmTemplateId: "research-and-code"
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/agents/swarms/templates` | List templates (supports `limit`, `offset`) |
| `POST` | `/api/v1/agents/swarms/templates` | Create custom template |
| `GET` | `/api/v1/agents/swarms/templates/:id` | Get template detail |
| `PATCH` | `/api/v1/agents/swarms/templates/:id` | Update custom template |
| `DELETE` | `/api/v1/agents/swarms/templates/:id` | Delete custom template (403 for builtins) |
| `GET` | `/api/v1/agents/swarms` | List recent swarm runs |
| `POST` | `/api/v1/agents/swarms` | Start a new swarm run |
| `GET` | `/api/v1/agents/swarms/:id` | Get run status + member results |
| `POST` | `/api/v1/agents/swarms/:id/cancel` | Cancel a running swarm |

---

## Agent Profiles

Swarm roles are mapped to **agent profiles** — lightweight agent configs stored separately from full personalities. Built-in profiles include: `researcher`, `coder`, `reviewer`, `analyst`, `summarizer`.

Manage profiles in **Agents → Sub-Agents → Profiles**, or via API:

```bash
# List profiles
curl -H "Authorization: Bearer <jwt>" https://your-instance/api/v1/agents/profiles

# Create a custom profile
curl -X POST https://your-instance/api/v1/agents/profiles \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "security-expert",
    "description": "Expert in application security, OWASP, and threat modeling",
    "systemPrompt": "You are a security expert. Focus on identifying vulnerabilities...",
    "skills": []
  }'
```

---

## Policy & Security

Swarms are gated by two security policy toggles:

| Policy | Effect |
|--------|--------|
| `allowSubAgents` | Master switch — must be `true` for any delegation or swarm |
| `allowSwarms` | Specifically controls swarm execution — set to `false` to allow delegation but not swarms |

Configure in **Settings → Security → Security Policy**, or via `PATCH /api/v1/security/policy`.

Token budgets are enforced at the run level. If the total tokens consumed by all swarm members exceeds `tokenBudget`, pending members are cancelled.

---

## Troubleshooting

### Swarm run stuck in `pending`

Check that `allowSubAgents: true` in the security policy. Also verify the AI model is configured and the agent profiles exist.

### Profile not found

The `profileName` in a template must match an existing agent profile name exactly (case-sensitive). List available profiles at `GET /api/v1/agents/profiles`.

### Token budget exceeded

Increase the `tokenBudget` on the template, or break the task into smaller subtasks. The first members to run consume tokens first; later members may be cancelled if the budget is exhausted.
