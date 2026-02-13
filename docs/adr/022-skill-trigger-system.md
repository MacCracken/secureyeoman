# ADR 022: Skill Trigger System

**Status**: Proposed
**Date**: 2026-02-13

## Context

Skills should not just be passive instructions — they should activate automatically based on user actions, messages, tool usage, or system events. This ADR defines the trigger system that activates skills based on contextual conditions.

Building on ADR 021 (Skill Actions), this enables autonomous skill behavior.

## Decision

### Trigger Types

#### 1. Message Trigger
Activate when user message matches pattern:

```typescript
interface MessageTrigger {
  type: 'message';
  patterns: string[];        // Regex patterns to match
  matchMode: 'exact' | 'contains' | 'regex' | 'startsWith';
  caseSensitive?: boolean;
}
```

**Example:**
```yaml
trigger:
  type: message
  patterns:
    - "schedule meeting"
    - "remind me to .*"
  matchMode: contains
```

#### 2. Tool Use Trigger
Activate when specific tool is used:

```typescript
interface ToolUseTrigger {
  type: 'tool_use';
  toolNames: string[];       // e.g., ["filesystem.read", "bash.execute"]
  before?: boolean;           // Run BEFORE tool (pre-processing)
  after?: boolean;           // Run AFTER tool (post-processing)
}
```

**Example:**
```yaml
trigger:
  type: tool_use
  toolNames: ["bash.execute"]
  after: true  # Run after bash executes to verify safety
```

#### 3. Event Trigger
Activate on system events:

```typescript
type EventType = 
  | 'session_start'
  | 'session_end'
  | 'skill_installed'
  | 'skill_uninstalled'
  | 'personality_changed'
  | 'error_occurred'
  | 'heartbeat_check';

interface EventTrigger {
  type: 'event';
  events: EventType[];
}
```

#### 4. Condition Trigger
Activate based on system conditions:

```typescript
interface ConditionTrigger {
  type: 'condition';
  conditions: {
    field: 'time' | 'day' | 'memory_usage' | 'task_count';
    operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'between';
    value: unknown;
  }[];
  logical: 'AND' | 'OR';
}
```

### Trigger Configuration

```typescript
interface SkillTrigger {
  // What triggers
  type: 'message' | 'tool_use' | 'event' | 'condition';
  
  // Trigger-specific config
  message?: MessageTrigger;
  toolUse?: ToolUseTrigger;
  event?: EventTrigger;
  condition?: ConditionTrigger;
  
  // When to run
  timing: 'before' | 'after' | 'instead';  // Default: after
  
  // Action to execute
  actionId?: string;         // Specific action in the skill
  actionType?: 'code' | 'http' | 'shell';
  
  // Filtering
  enabled: boolean;
  priority?: number;          // Higher = runs first (default: 0)
  cooldownMs?: number;      // Min time between triggers
  
  // Context
  contextTemplate?: string;  // Data to pass to skill
}
```

### Trigger Execution Flow

```
User Message / Tool Use / Event
            │
            ▼
┌─────────────────────────────────┐
│  Trigger Matcher                │
│  - Match patterns              │
│  - Check conditions            │
│  - Verify cooldown            │
└────────────┬────────────────────┘
             │
             ▼ (matched)
┌─────────────────────────────────┐
│  Check RBAC                    │
│  - skills:execute              │
└────────────┬────────────────────┘
             │
             ▼ (allowed)
┌─────────────────────────────────┐
│  Check Approval                │
│  - requireApproval flag        │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Execute Action               │
│  - Run skill action           │
│  - Pass context data          │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Handle Result                │
│  - Append to response         │
│  - Or modify tool result      │
│  - Or prevent action         │
└─────────────────────────────────┘
```

### Context Data

When a trigger fires, it receives context:

```typescript
interface TriggerContext {
  // For message triggers
  message?: {
    text: string;
    userId: string;
    timestamp: number;
  };
  
  // For tool use triggers
  tool?: {
    name: string;
    input: unknown;
    output?: unknown;
    success: boolean;
  };
  
  // For event triggers
  event?: {
    type: EventType;
    data: unknown;
  };
  
  // Common
  sessionId: string;
  personalityId: string;
}
```

### Action Responses

Triggers can modify behavior:

| Timing | Description | Use Case |
|--------|-------------|----------|
| `before` | Run before action | Validate input, add context |
| `after` | Run after action | Post-process, notify |
| `instead` | Replace action | Block, redirect |

### Example: Meeting Scheduler Skill

```yaml
name: meeting-scheduler
description: Automatically handles meeting scheduling

triggers:
  - type: message
    message:
      patterns:
        - "schedule meeting"
        - "set up a call"
        - "book .* meeting"
      matchMode: contains
    actionId: parse-meeting
    timing: after
    priority: 10

  - type: tool_use
    toolUse:
      toolNames: ["calendar.create"]
      after: true
    actionId: notify-user
    contextTemplate: "Meeting created: {{result.summary}}"

actions:
  - id: parse-meeting
    type: code
    language: javascript
    code: |
      // Extract meeting details from message
      const context = trigger.message.text;
      // ... parsing logic
      return { action: 'create_event', data: {...} };

  - id: notify-user
    type: http
    method: POST
    url: "{{notifications.webhook}}"
    body: "{{result}}"
```

## Consequences

### Positive
- **Proactive**: Skills activate automatically
- **Contextual**: Rich context data available
- **Flexible**: Multiple trigger types cover most cases
- **Non-blocking**: Cooldown prevents spam

### Negative
- **Complexity**: More complex than passive skills
- **Race conditions**: Multiple triggers firing simultaneously
- **Performance**: Trigger matching adds latency

### Mitigations
- Priority system for ordering
- Cooldown periods
- Async execution for non-critical triggers

## Related ADRs

- [ADR 021: Skill Actions Architecture](./021-skill-actions-architecture.md)
- [ADR 023: Scheduled Skill Execution](./023-scheduled-skill-execution.md)
- [ADR 013: Heartbeat Task Scheduling](./013-heartbeat-task-scheduling-knowledge-crud.md)

---

**Previous**: [ADR 021: Skill Actions Architecture](./021-skill-actions-architecture.md)  
**Next**: [ADR 023: Scheduled Skill Execution](./023-scheduled-skill-execution.md)
