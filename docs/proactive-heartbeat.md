# Proactive Heartbeat Guide

> Making FRIDAY truly autonomous: From monitoring to action

## Overview

FRIDAY's heartbeat system has evolved from a passive monitoring tool into a **proactive automation engine**. While traditional heartbeats only report status, FRIDAY's enhanced heartbeat can:

- **Detect issues** and automatically trigger remediation
- **Notify external systems** via webhooks (PagerDuty, Slack, custom APIs)
- **Record important events** as memories for later reference
- **Respect scheduling constraints** (business hours, specific days)
- **Perform intelligent analysis** using LLMs for complex patterns

This guide covers everything you need to make FRIDAY take action without waiting for your command.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Concepts](#core-concepts)
3. [Action Types](#action-types)
4. [Conditional Scheduling](#conditional-scheduling)
5. [Integration Patterns](#integration-patterns)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Simple Webhook Alert

Add this to your `secureyeoman.yaml`:

```yaml
heartbeat:
  enabled: true
  intervalMs: 60000
  checks:
    - name: system_health
      type: system_health
      enabled: true
      intervalMs: 300000  # Every 5 minutes
      actions:
        - condition: on_error
          action: webhook
          config:
            url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
            method: POST
```

That's it! FRIDAY will POST to your webhook whenever the system health check fails.

### Business Hours Only

Run checks only during work hours:

```yaml
heartbeat:
  checks:
    - name: business_monitor
      type: system_health
      schedule:
        daysOfWeek: [mon, tue, wed, thu, fri]
        activeHours:
          start: "09:00"
          end: "17:00"
          timezone: "America/New_York"
```

---

## Core Concepts

### Check → Result → Action Flow

```
┌─────────┐    ┌─────────┐    ┌─────────┐
│  Check  │ → │ Result  │ → │ Action  │
│  Runs   │    │ Status  │    │Triggers │
└─────────┘    └─────────┘    └─────────┘
```

1. **Check executes**: System health, memory status, log analysis, etc.
2. **Result determined**: `ok`, `warning`, or `error`
3. **Actions evaluated**: Each action's `condition` is tested against the result
4. **Actions execute**: Matching actions run in order

### Condition Types

| Condition | Triggers When |
|-----------|---------------|
| `always` | Every time the check runs |
| `on_ok` | Check returns healthy status |
| `on_warning` | Check returns warning status |
| `on_error` | Check returns error status |

### Action Precedence

1. **Global default actions** (from `heartbeat.defaultActions`) run first
2. **Check-specific actions** (from `check.actions`) run second
3. Actions within each group run in array order
4. If one action fails, others still attempt to run

---

## Action Types

### 1. Webhook

Send HTTP requests to external services. Perfect for:
- PagerDuty incident creation
- Slack/Discord notifications
- Custom API integrations
- Zapier/Make.com triggers

**Configuration:**

```yaml
actions:
  - condition: on_error
    action: webhook
    config:
      url: "${WEBHOOK_URL}/incidents"
      method: POST
      headers:
        Authorization: "Bearer ${API_TOKEN}"
        Content-Type: "application/json"
      timeoutMs: 30000
      retryCount: 3
      retryDelayMs: 1000
```

**Payload sent to webhook:**

```json
{
  "check": {
    "name": "system_health",
    "type": "system_health"
  },
  "result": {
    "status": "error",
    "message": "High memory usage: 850/900MB",
    "data": { "heapUsedMb": 850, "heapTotalMb": 900 },
    "timestamp": 1704067200000
  },
  "source": "friday-heartbeat"
}
```

**Environment variables:** Use `${VAR_NAME}` syntax for secrets:

```yaml
url: "${SLACK_WEBHOOK_URL}"
headers:
  Authorization: "Bearer ${SLACK_BOT_TOKEN}"
```

**Retry behavior:**
- Retries use exponential backoff (delay × attempt number)
- Failed webhooks are logged but don't stop other actions
- Set `retryCount: 0` to disable retries

### 2. Notify

Send notifications through integrated channels:

```yaml
actions:
  - condition: on_warning
    action: notify
    config:
      channel: slack
      recipients: ["#alerts", "@admin"]
      messageTemplate: "⚠️ {{check.name}}: {{result.status}} - {{result.message}}"
```

**Available channels:**
- `console` - Logs to stdout (always available)
- `slack` - Requires Slack integration
- `discord` - Requires Discord integration
- `telegram` - Requires Telegram integration
- `email` - Requires email configuration

**Message template placeholders:**
- `{{check.name}}` - Check name
- `{{check.type}}` - Check type
- `{{result.status}}` - Result status (ok/warning/error)
- `{{result.message}}` - Result message

### 3. Remember

Record events in FRIDAY's memory for later reference:

```yaml
actions:
  - condition: on_error
    action: remember
    config:
      importance: 0.8
      category: critical_alert
      memoryType: episodic
```

**Use cases:**
- Track recurring issues over time
- Build a history of system incidents
- Enable FRIDAY to reference past problems in conversations

**Memory retrieval:**
```bash
# Query for critical alerts
curl http://localhost:18789/api/v1/brain/query?category=critical_alert&importance=0.7
```

### 4. Execute

⚠️ **Security Warning:** Command execution requires careful review. Currently placeholder only.

Run system commands (requires security approval):

```yaml
actions:
  - condition: on_error
    action: execute
    config:
      command: "systemctl"
      args: ["restart", "friday"]
      timeoutMs: 60000
      captureOutput: true
```

**Future implementation will include:**
- Sandboxed execution
- Permission system
- Audit logging
- Rate limiting

### 5. LLM Analyze

Use AI to analyze check results and make intelligent decisions:

```yaml
heartbeat:
  checks:
    - name: log_analysis
      type: log_anomalies
      enabled: true
      intervalMs: 600000
      actions:
        - condition: always
          action: llm_analyze
          config:
            prompt: "Analyze these error logs and determine if this is a security incident. Respond with only 'true' or 'false'."
            model: "openai/gpt-5-nano"  # Use cheap model
            maxTokens: 50
            expectedOutput: boolean
```

**Cost-conscious defaults:**
- Uses cheapest available model by default
- Low token limits (500 default)
- Low temperature (0.3) for deterministic responses

**Expected outputs:**
- `boolean` - Returns true/false for conditional logic
- `categorize` - Returns a category label
- `extract` - Extracts structured data
- `summary` - Returns text summary

---

## Conditional Scheduling

### Day of Week Scheduling

Run checks only on specific days:

```yaml
heartbeat:
  checks:
    - name: weekend_maintenance
      type: memory_status
      schedule:
        daysOfWeek: [sat, sun]
      intervalMs: 3600000  # Hourly on weekends
```

### Active Hours

Limit checks to specific times:

```yaml
heartbeat:
  checks:
    - name: business_hours_monitor
      type: system_health
      schedule:
        activeHours:
          start: "09:00"
          end: "17:00"
          timezone: "America/New_York"
      intervalMs: 60000  # Every minute during business hours
```

**Overnight ranges** (spans midnight):

```yaml
schedule:
  activeHours:
    start: "22:00"
    end: "06:00"  # Runs from 10 PM to 6 AM
```

### Combined Scheduling

Days + hours together:

```yaml
heartbeat:
  checks:
    - name: weekday_business_hours
      type: integration_health
      schedule:
        daysOfWeek: [mon, tue, wed, thu, fri]
        activeHours:
          start: "09:00"
          end: "17:00"
          timezone: "Europe/London"
```

---

## Integration Patterns

### Pattern 1: Escalating Alerts

Different channels for different severity:

```yaml
heartbeat:
  checks:
    - name: system_monitor
      type: system_health
      actions:
        # Warning: Log to console
        - condition: on_warning
          action: notify
          config:
            channel: console
        # Error: Send to Slack
        - condition: on_error
          action: notify
          config:
            channel: slack
            recipients: ["#warnings"]
        # Critical: Page on-call
        - condition: on_error
          action: webhook
          config:
            url: "${PAGERDUTY_URL}"
```

### Pattern 2: External Monitoring

Send all results to external system:

```yaml
heartbeat:
  defaultActions:
    - condition: always
      action: webhook
      config:
        url: "${DATADOG_URL}/metrics"
        method: POST
  checks:
    - name: health
      type: system_health
    - name: memory
      type: memory_status
    - name: logs
      type: log_anomalies
```

### Pattern 3: Smart Remediation

Use LLM to decide on actions:

```yaml
heartbeat:
  checks:
    - name: smart_monitor
      type: log_anomalies
      actions:
        - condition: on_error
          action: llm_analyze
          config:
            prompt: |
              Analyze this error. If it's a known transient issue (network timeout, rate limit),
              respond with "ignore". If it requires intervention, respond with "alert".
            expectedOutput: categorize
```

### Pattern 4: Business Hours Only

Reduce noise outside work hours:

```yaml
heartbeat:
  checks:
    - name: production_monitor
      type: system_health
      intervalMs: 60000
      schedule:
        daysOfWeek: [mon, tue, wed, thu, fri]
        activeHours:
          start: "08:00"
          end: "18:00"
      actions:
        - condition: on_error
          action: webhook
          config:
            url: "${SLACK_WEBHOOK}"
```

---

## Best Practices

### 1. Start Simple

Begin with console notifications, then add webhooks:

```yaml
# Phase 1: Test with console
actions:
  - condition: on_error
    action: notify
    config:
      channel: console

# Phase 2: Add Slack once verified
actions:
  - condition: on_error
    action: notify
    config:
      channel: slack
      recipients: ["#alerts"]
```

### 2. Use Per-Check Intervals

Different checks need different frequencies:

```yaml
heartbeat:
  intervalMs: 60000  # Global: 1 minute
  checks:
    - name: memory
      type: memory_status
      intervalMs: 300000  # Every 5 minutes (expensive)
    - name: health
      type: system_health
      intervalMs: 60000   # Every minute (cheap)
```

### 3. Respect Rate Limits

Add delays between retries:

```yaml
actions:
  - condition: on_error
    action: webhook
    config:
      url: "${API_URL}"
      retryCount: 3
      retryDelayMs: 5000  # 5 second delays
```

### 4. Use Global Defaults for Common Actions

Avoid repeating the same action config:

```yaml
heartbeat:
  defaultActions:
    - condition: on_error
      action: webhook
      config:
        url: "${DEFAULT_WEBHOOK}"
  checks:
    - name: check1
      type: system_health
      # Uses default action
    - name: check2
      type: memory_status
      # Uses default action
      actions:
        - condition: on_warning
          action: notify  # Plus check-specific action
```

### 5. Use Cheap Models for LLM Analysis

Always specify a cheap model:

```yaml
actions:
  - condition: always
    action: llm_analyze
    config:
      model: "openai/gpt-5-nano"  # Cheapest option
      maxTokens: 100
```

### 6. Set Appropriate Timeouts

Don't block heartbeat for slow webhooks:

```yaml
actions:
  - condition: on_error
    action: webhook
    config:
      timeoutMs: 5000  # 5 seconds max
```

---

## Troubleshooting

### Actions Not Firing

**Check condition matching:**
```bash
# View recent heartbeat results
curl http://localhost:18789/api/v1/brain/heartbeat/status
```

**Verify condition logic:**
- Check returns `error` but action triggers on `on_warning`?
- Check runs outside schedule constraints?

**Check schedule:**
```yaml
# Add temporary console action to debug
actions:
  - condition: always
    action: notify
    config:
      channel: console
```

### Webhook Failures

**Check logs:**
```bash
tail -f ~/.secureyeoman/logs/app.log | grep "webhook"
```

**Test manually:**
```bash
curl -X POST "${WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

**Increase retries:**
```yaml
config:
  retryCount: 5
  retryDelayMs: 2000
```

### Scheduling Not Working

**Check timezone:**
Times are currently UTC-based. For local timezones, convert or wait for timezone support.

**Debug schedule:**
```yaml
# Temporarily remove schedule to verify check works
# Then add back with console notification
```

### High Memory Usage

Too many actions or long-running webhooks can impact performance:

```yaml
# Limit concurrent actions with timeouts
actions:
  - condition: on_error
    action: webhook
    config:
      timeoutMs: 3000  # Short timeout
      retryCount: 1    # Fewer retries
```

---

## API Endpoints

### Get Heartbeat Status

```bash
GET /api/v1/brain/heartbeat/status
```

Returns current status, last beat, and all configured checks with their schedules and actions.

### Trigger Manual Beat

```bash
POST /api/v1/brain/heartbeat/beat
```

Manually trigger a heartbeat cycle (respects scheduling constraints).

### Update Check Configuration

```bash
PUT /api/v1/brain/heartbeat/tasks/:name
{
  "intervalMs": 60000,
  "enabled": true,
  "config": { ... }
}
```

---

## Migration from OpenClaw

If you're coming from OpenClaw, here's the mapping:

| OpenClaw | FRIDAY |
|----------|--------|
| `HEARTBEAT.md` file | Individual checks with `config.prompt` |
| `HEARTBEAT_OK` response | Check returns `ok` status |
| `every: "30m"` | `intervalMs: 1800000` |
| `activeHours` | Same (in `schedule.activeHours`) |
| External actions | Use `webhook` or `notify` actions |
| Cron jobs | Use conditional scheduling or external cron calling API |

**Example migration:**

```yaml
# OpenClaw style (in HEARTBEAT.md)
# - Check disk space every 30m
# - Alert if >90% full

# FRIDAY style (in secureyeoman.yaml)
heartbeat:
  checks:
    - name: disk_space
      type: system_health
      intervalMs: 1800000
      actions:
        - condition: on_warning
          action: webhook
          config:
            url: "${ALERT_WEBHOOK}"
```

---

## Dashboard Integration

The dashboard provides a visual interface for managing proactive heartbeat tasks. This section covers the UI improvements planned for ADR 018 support.

### Current Limitations

The existing `HeartbeatTasksSection` component (PersonalityEditor.tsx:588-710) only supports:
- Basic task listing (name, type, interval)
- Enable/disable toggle
- Simple interval editing (minutes only)
- Viewing last run timestamp

### Phase 1: Core Action Management (High Priority)

#### Enhanced Task Card

**Current:**
```
[Name] [Type] every 5m | last: 2m ago [Toggle] [Edit]
```

**Improved:**
```
┌─────────────────────────────────────────────────────┐
│ [Name] [Type]                              [Toggle] │
│ 📅 Every 5m | ⏰ Business hours only | 📊 3 actions │
│ Last run: 2m ago | Next run: in 3m                  │
│ [Expand] [Edit Actions] [Edit Schedule] [Delete]    │
└─────────────────────────────────────────────────────┘
```

#### Action Configuration Modal

Create new component: `HeartbeatActionEditor.tsx`

**Features:**
- Condition selector (always/on_ok/on_warning/on_error)
- Action type selector (webhook/notify/remember/execute/llm_analyze)
- Dynamic form based on action type:
  - **Webhook:** URL, Method (GET/POST/PUT), Headers (key-value), Timeout, Retries
  - **Notify:** Channel dropdown (console/slack/discord/telegram/email), Recipients, Message template
  - **Remember:** Importance slider (0.0-1.0), Category input, Memory type (episodic/semantic)
  - **LLM Analyze:** Model selector, Prompt textarea, Max tokens, Expected output

### Phase 2: Conditional Scheduling (High Priority)

#### Schedule Configuration

Create new component: `HeartbeatScheduleEditor.tsx`

**Features:**
- Day selector (Mon-Sun checkboxes)
- Active hours picker (start/end time with timezone)
- Visual schedule preview ("Runs: Mon-Fri, 9:00 AM - 5:00 PM EST")

Display format:
```
📅 Every 5m | 🗓️ Mon-Fri | ⏰ 9:00-17:00 EST
```

### Phase 3: Global Default Actions (Medium Priority)

Add a "Default Actions" section that applies to all heartbeat checks:

**Files to modify:**
- `PersonalityEditor.tsx` - Add section before task list

### Phase 4: Enhanced Task Details (Medium Priority)

Each task card should expand to show:
- Full configuration
- Associated actions (with icons for each type)
- Schedule details
- Recent history (last 5 runs)

---

## Summary

FRIDAY's proactive heartbeat transforms monitoring into automation. By configuring actions that respond to check results, you can:

- **Reduce response time** with automatic alerts
- **Integrate with existing tools** via webhooks
- **Build institutional knowledge** with memory recording
- **Save costs** with intelligent scheduling
- **Make smart decisions** with LLM analysis

Start with simple notifications, then layer on complexity as needed. The goal is proactive automation that helps FRIDAY help you.

---

**Next Steps:**
- Review the [Configuration Reference](configuration.md#heartbeat) for all options
- Check [ADR 018](adr/018-proactive-heartbeat-enhancements.md) for technical design details
- Explore [Integration Guide](integrations.md) for connecting external services
