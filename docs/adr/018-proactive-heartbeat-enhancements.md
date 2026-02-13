# ADR 018: Proactive Heartbeat Enhancements

## Status
Proposed

## Context

Our current heartbeat system (ADR 013) provides excellent deterministic monitoring with per-task scheduling. However, comparing with OpenClaw's approach reveals opportunities to make FRIDAY more **proactive** — not just monitoring, but automatically taking action when conditions are met.

Current limitations:
1. Checks only record status; they don't trigger automated responses
2. No integration with external systems (webhooks, notifications)
3. Scheduling is purely time-based; no conditional logic (active hours, day-of-week)
4. No LLM-driven analysis for complex decision-making
5. No escalation path from check results to automated remediation

## Decision

We will enhance the heartbeat system with **proactive capabilities** while maintaining FRIDAY's deterministic, cost-efficient foundation:

### 1. Action Triggers
Add configurable actions that execute when check conditions are met:

```typescript
interface HeartbeatActionTrigger {
  condition: 'always' | 'on_warning' | 'on_error' | 'on_ok';
  action: 'webhook' | 'notify' | 'remember' | 'execute' | 'llm_analyze';
  config: Record<string, unknown>;
}
```

### 2. Webhook Integration
Enable external system notifications:

```typescript
interface WebhookActionConfig {
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  timeoutMs?: number;
  retryCount?: number;
}
```

### 3. Conditional Scheduling
Support time-based scheduling constraints:

```typescript
interface HeartbeatSchedule {
  daysOfWeek?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
  activeHours?: {
    start: string;  // "HH:mm" format
    end: string;
    timezone?: string;
  };
}
```

### 4. LLM-Driven Checks
Add a new check type that uses LLM for complex analysis:

```typescript
type: 'llm_analysis'
config: {
  prompt: string;           // Analysis prompt
  model?: string;          // Optional: use cheaper model
  maxTokens?: number;
  expectedOutput: 'boolean' | 'categorize' | 'extract';
  onResult: HeartbeatActionTrigger[];
}
```

### 5. Cost-Conscious Design
Following OpenClaw's pattern, LLM checks should:
- Use the cheapest available model by default (configurable)
- Include timeout and token limits
- Be optional (deterministic checks remain the default)

## Consequences

### Positive
- FRIDAY becomes truly proactive — detects issues AND acts on them
- Better integration with external monitoring systems (PagerDuty, Slack, etc.)
- More flexible scheduling reduces unnecessary check execution
- LLM checks enable complex pattern detection without code changes
- Maintains deterministic foundation while adding optional intelligence

### Negative
- Increased complexity in heartbeat configuration
- LLM checks incur costs (mitigated by cheap model defaults)
- Webhooks introduce external dependencies and potential latency
- More testing surface area

### Migration Path
Existing configurations remain valid. New features are opt-in via additional config fields.

## Implementation Phases

### Phase 1: Action Triggers & Webhooks
- Add `actions` array to `HeartbeatCheckSchema`
- Implement webhook action handler
- Add notification action (via integration manager)

### Phase 2: Conditional Scheduling
- Add `schedule` field to checks
- Implement day-of-week and active hours logic
- Add timezone support

### Phase 3: LLM-Driven Checks
- Add `llm_analysis` check type
- Implement cheap model defaults
- Add result parsing (boolean/categorize/extract)

## Examples

### Proactive Health Check with Webhook
```yaml
heartbeat:
  checks:
    - name: disk_space
      type: system_health
      enabled: true
      intervalMs: 300000
      actions:
        - condition: on_warning
          action: webhook
          config:
            url: "${WEBHOOK_URL}/alerts"
            method: POST
            headers:
              Authorization: "Bearer ${ALERT_TOKEN}"
        - condition: on_error
          action: notify
          config:
            channel: email
            recipients: ["admin@example.com"]
```

### Conditional Schedule
```yaml
heartbeat:
  checks:
    - name: business_hours_check
      type: integration_health
      enabled: true
      intervalMs: 60000
      schedule:
        daysOfWeek: [mon, tue, wed, thu, fri]
        activeHours:
          start: "09:00"
          end: "17:00"
          timezone: "America/New_York"
```

### LLM Analysis Check
```yaml
heartbeat:
  checks:
    - name: log_pattern_analysis
      type: llm_analysis
      enabled: true
      intervalMs: 600000
      config:
        model: "openai/gpt-5-nano"  # Cheap model
        prompt: "Analyze recent logs for security anomalies. Return true if suspicious activity detected."
        expectedOutput: boolean
        maxTokens: 100
      actions:
        - condition: on_error  # LLM returns true
          action: remember
          config:
            importance: 0.8
            category: security_alert
```

## References
- ADR 013: Heartbeat Task Scheduling & Knowledge CRUD
- ADR 012: Heart-Body Hierarchy
- OpenClaw heartbeat documentation and patterns
- https://github.com/openclaw/openclaw
