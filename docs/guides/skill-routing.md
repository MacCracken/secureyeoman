# Skill Routing Quality Guide

This guide explains how to author skills that activate reliably and precisely, using the Phase 44 routing quality fields.

---

## The Problem: Ambiguous Activation Boundaries

Before Phase 44, skills were matched only by `triggerPatterns` regex. A skill with no trigger patterns fell back to name-keyword matching. There was no way to express *when a skill should not activate*, leading to false positives and missed activations (~73% routing accuracy).

---

## Routing Fields

### `triggerPatterns` (original)

Regex patterns matched against the user's message. The first match wins.

```json
"triggerPatterns": ["review.*code|code.*review", "\\bpr\\b|pull.?request"]
```

Use for **hard syntactic signals** (specific keywords the user almost always uses).

### `useWhen` (Phase 44)

A plain-language description of when this skill should activate. Injected into the skill catalog in the system prompt so the model understands context.

```json
"useWhen": "user asks to review a PR, diff, file, or function for correctness or security"
```

Best practices:
- Be specific about the *trigger object* (a PR, a diff, a file)
- Use "user asks to" rather than "when code is present"
- Max 500 chars

### `doNotUseWhen` (Phase 44)

Anti-conditions. Prevents false positives from related-but-different requests.

```json
"doNotUseWhen": "writing new code from scratch, debugging a runtime error, or answering general programming questions"
```

Best practices:
- List the most common false-positive scenarios
- Mirror the language of `useWhen` (symmetric framing)
- Max 500 chars

### `useWhen` vs `triggerPatterns`

| | `triggerPatterns` | `useWhen` |
|---|---|---|
| Matching | Regex against user text | Semantic — model interprets |
| Precision | High for known phrases | High for nuanced intent |
| Recall | Low for novel phrasings | High |
| Combine? | Yes — use both | Yes — they complement |

For most skills: use `triggerPatterns` for known keyword signals + `useWhen`/`doNotUseWhen` for semantic context.

---

## `routing` Mode

### `fuzzy` (default)

The model uses judgment to decide whether to activate the skill. Good for most skills.

### `explicit`

Appends a deterministic sentence to the catalog entry:

> "To perform [Skill Name] tasks, use the [Skill Name] skill."

Use for **SOPs, compliance workflows, and incident response** where the model must not deviate to its own judgment. This mirrors OpenAI's Shell Tips pattern.

```json
"routing": "explicit"
```

---

## `successCriteria`

Injected after the skill's full instructions block. Tells the model when the skill is complete, preventing it from over-generating or stopping too early.

```json
"successCriteria": "A PR summary has been generated with: overall quality rating, list of critical issues, list of suggestions, and at least one positive observation."
```

Best practices:
- State concrete output requirements (not vague "user is satisfied")
- Max 300 chars
- Use checklist-style phrasing

---

## `mcpToolsAllowed`

When non-empty, only the listed MCP tool names are available while this skill is active (prompt-level restriction).

```json
"mcpToolsAllowed": ["read_file", "list_directory", "web_search"]
```

Use cases:
- Security-sensitive skills that should not have shell access
- Skills that should only read, not write
- Focused skills where other tools would be distracting

Note: this is a prompt-level hint, not a server-level enforcement. The MCP server still gates access by its own permissions.

---

## `linkedWorkflowId`

Links this skill to a workflow. When the skill activates, the model is informed that a specific workflow should be triggered.

```json
"linkedWorkflowId": "wf_incident_response_001"
```

The catalog entry will include: "Triggers workflow: wf_incident_response_001."

---

## `{{output_dir}}` Template Variable

Use `{{output_dir}}` in your skill instructions to reference a standardized output location. It expands at runtime to:

```
outputs/{skill-slug}/{iso-date}/
```

Example:
```
Save your analysis to {{output_dir}}report.md
```

Becomes:
```
Save your analysis to outputs/code-reviewer/2026-02-24/report.md
```

This creates a consistent, date-scoped output structure across all skill runs.

---

## `invokedCount` and Routing Precision

`invokedCount` tracks how often the router selects this skill (i.e., how often the skill's instructions are expanded into the system prompt). `usageCount` tracks how often the user explicitly used the skill.

**Routing precision** = `usageCount / invokedCount × 100%`

- **100%**: every time the skill was activated, it was the right call
- **<70%**: the skill may be activating on false positives — tighten `triggerPatterns` or add `doNotUseWhen`
- **Displayed in Skills Manager** when `invokedCount > 0`

---

## Credential Hygiene

Never put literal credentials in skill instructions. The API will warn you:

```json
{ "skill": {...}, "warnings": ["Bearer token detected — use a $VAR_NAME reference instead"] }
```

Instead of:
```
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
```

Use:
```
Authorization: Bearer $AUTH_TOKEN
```

Set `$AUTH_TOKEN` via the Secrets Manager (Settings → Security → Secrets). The skill instructions reference the variable name; the actual value is injected at runtime by the secrets system.

---

## Full Example

```json
{
  "name": "Code Reviewer",
  "description": "Reviews code for correctness, security, performance, and maintainability.",
  "useWhen": "user asks to review a PR, diff, file, or function",
  "doNotUseWhen": "writing new code from scratch, debugging a runtime error, or answering general programming questions",
  "successCriteria": "Review complete with: summary, critical issues, suggestions, and at least one positive observation.",
  "routing": "fuzzy",
  "mcpToolsAllowed": ["read_file", "list_directory"],
  "triggerPatterns": ["review.*code|code.*review", "\\bpr\\b|pull.?request", "\\bdiff\\b"],
  "instructions": "You are an expert code reviewer...\n\nSave findings to {{output_dir}}review.md"
}
```
