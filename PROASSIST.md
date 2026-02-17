# Phase 7.2: Proactive Assistance — Implementation Plan

## Executive Summary

Enable FRIDAY to anticipate user needs and take initiative based on learned patterns, scheduled events, and contextual triggers. Transform FRIDAY from a reactive assistant to a proactive partner that suggests and acts without being explicitly asked.

**Complexity**: Medium | **Priority**: Medium | **Estimated Duration**: 3-4 weeks

---

## Goals

1. **Trigger System**: Rule-based and ML-driven triggers that fire based on conditions
2. **Suggestion Queue**: Dashboard UI for reviewing and acting on proactive suggestions
3. **Built-in Scenarios**: Common proactive patterns (daily standups, weekly summaries, follow-ups)
4. **Approval Flows**: Configurable auto-approve, suggest-first, or manual-only modes
5. **Multi-Channel**: Deliver proactive messages across all connected integrations

## Non-Goals

- Real-time streaming suggestions (polling acceptable)
- Complex workflow automation (use webhooks instead)
- ML model training (use pattern matching + Brain)
- Cross-instance proactive coordination (future A2A work)

---

## Core Concepts

### Trigger Types

| Type | Description | Example |
|------|-------------|---------|
| `schedule` | Time-based (cron-like) | "Every Monday 9am" |
| `event` | System event-based | "After task completion" |
| `pattern` | Learned behavioral | "User usually asks for X at Y time" |
| `webhook` | External HTTP trigger | "GitHub PR opened" |
| `llm` | AI-driven analysis | "Detect anomaly in logs" |

### Trigger Condition

```typescript
interface ProactiveTrigger {
  id: string;
  name: string;
  enabled: boolean;
  type: 'schedule' | 'event' | 'pattern' | 'webhook' | 'llm';
  condition: TriggerCondition;
  action: ProactiveAction;
  approvalMode: 'auto' | 'suggest' | 'manual';
  cooldownMs?: number;
  limitPerDay?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Trigger Condition

```typescript
type TriggerCondition = 
  | ScheduleCondition
  | EventCondition  
  | PatternCondition
  | WebhookCondition
  | LLMAnalysisCondition;

interface ScheduleCondition {
  type: 'schedule';
  cron?: string;              // Standard cron (minute hour day month weekday)
  intervalMs?: number;       // Alternative: every N milliseconds
  timezone?: string;         // Default: system TZ
  startDate?: string;        // ISO date
  endDate?: string;
}

interface EventCondition {
  type: 'event';
  event: ProactiveEvent;
  filter?: Record<string, unknown>;
}

type ProactiveEvent = 
  | 'task_completed'
  | 'task_failed'
  | 'memory_saved'
  | 'integration_connected'
  | 'integration_disconnected'
  | 'security_alert'
  | 'heartbeat_warning'
  | 'heartbeat_error'
  | 'user_online'
  | 'custom';
```

### Action Types

```typescript
interface ProactiveAction {
  type: 'message' | 'webhook' | 'remind' | 'execute' | 'learn';
  config: MessageActionConfig | WebhookActionConfig | RemindActionConfig | ExecuteActionConfig | LearnActionConfig;
  targetChannels?: string[];  // Which integrations to send to
}

interface MessageActionConfig {
  type: 'message';
  template: string;           // Template with {{variables}}
  variables?: Record<string, string>;
  includeContext?: boolean;  // Include relevant memories/tasks
}

interface WebhookActionConfig {
  type: 'webhook';
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: string;              // JSON template
}

interface RemindActionConfig {
  type: 'remind';
  message: string;
  remindAt: string;          // ISO or "in 30 minutes"
  snoozeAvailable?: boolean;
}

interface ExecuteActionConfig {
  type: 'execute';
  task: string;               // Task description for agent
  waitForCompletion?: boolean;
  timeoutMs?: number;
}

interface LearnActionConfig {
  type: 'learn';
  pattern: string;            // What to remember
  importance?: number;        // 0-1
  category?: string;
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ProactiveManager                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Trigger    │  │   Rule      │  │  Suggestion          │  │
│  │  Registry   │  │   Engine    │  │  Queue               │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Trigger Executors                           │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │Schedule  │ │  Event    │ │ Pattern  │ │    LLM     │  │  │
│  │  │ Executor │ │ Listener  │ │ Matcher  │ │  Analyzer  │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Action Handlers                              │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │ Message   │ │  Webhook │ │  Remind  │ │  Execute   │  │  │
│  │  │  Handler  │ │  Handler │ │  Handler │ │  Handler   │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Core Components

#### ProactiveManager

```typescript
class ProactiveManager {
  private triggers: Map<string, ProactiveTrigger>;
  private suggestionQueue: Suggestion[];
  private executorPool: ExecutorPool;
  
  async registerTrigger(trigger: ProactiveTrigger): Promise<void>
  async unregisterTrigger(id: string): Promise<void>
  async enableTrigger(id: string): Promise<void>
  async disableTrigger(id: string): Promise<void>
  async listTriggers(): Promise<ProactiveTrigger[]>
  
  async evaluateTrigger(triggerId: string, context: TriggerContext): Promise<TriggerResult>
  async queueSuggestion(suggestion: Suggestion): Promise<void>
  async getSuggestions(filter?: SuggestionFilter): Promise<Suggestion[]>
  async approveSuggestion(id: string, modifiedAction?: ProactiveAction): Promise<void>
  async dismissSuggestion(id: string, reason?: string): Promise<void>
  
  async executeAction(action: ProactiveAction, context: ActionContext): Promise<ActionResult>
}
```

#### Suggestion Queue

```typescript
interface Suggestion {
  id: string;
  triggerId: string;
  triggerName: string;
  action: ProactiveAction;
  context: Record<string, unknown>;  // What triggered it
  confidence: number;                  // 0-1
  suggestedAt: Date;
  status: 'pending' | 'approved' | 'dismissed' | 'executed' | 'expired';
  expiresAt: Date;
  executedAt?: Date;
}
```

---

## Pattern Learning

Integrate with existing Brain system to learn user patterns:

```typescript
interface PatternLearner {
  recordInteraction(event: PatternEvent): Promise<void>;
  detectPatterns(lookbackDays: number): Promise<LearnedPattern[]>;
  matchPattern(context: TriggerContext): Promise<PatternMatch | null>;
}

interface LearnedPattern {
  id: string;
  name: string;
  description: string;
  frequency: number;
  confidence: number;
  conditions: Record<string, unknown>[];
  suggestedTrigger?: Partial<ProactiveTrigger>;
}
```

### Pattern Types to Learn

1. **Temporal Patterns**: "User asks for weather every morning"
2. **Contextual Patterns**: "User mentions 'standup' on Mondays"
3. **Sequential Patterns**: "After X, user usually asks for Y"
4. **Response Patterns**: "User prefers brief responses at EOD"

---

## Built-in Scenarios

### 1. Daily Standup Reminder

```typescript
const dailyStandupTrigger: ProactiveTrigger = {
  id: 'builtin-daily-standup',
  name: 'Daily Standup Reminder',
  enabled: false,
  type: 'schedule',
  condition: {
    type: 'schedule',
    cron: '0 9 * * 1-5',  // 9am weekdays
    timezone: 'user-pref',
  },
  action: {
    type: 'message',
    template: 'Good morning! Ready for your daily standup? \n\nWhat did you accomplish yesterday?\nWhat are you working on today?\nAny blockers?',
    includeContext: true,
  },
  approvalMode: 'suggest',
  cooldownMs: 86400000,  // Once per day
};
```

### 2. Weekly Summary

```typescript
const weeklySummaryTrigger: ProactiveTrigger = {
  id: 'builtin-weekly-summary',
  name: 'Weekly Summary',
  enabled: false,
  type: 'schedule',
  condition: {
    type: 'schedule',
    cron: '0 17 * * 5',  // Friday 5pm
  },
  action: {
    type: 'message',
    template: 'Weekly Summary:\n\n📊 Tasks: {{completedTasks}} completed\n🧠 Memories: {{newMemories}} new\n💬 Messages: {{messages}} exchanged\n⏱️ Active time: {{activeTime}}',
  },
  approvalMode: 'auto',
};
```

### 3. Follow-up Reminder

```typescript
const followUpTrigger: ProactiveTrigger = {
  id: 'builtin-follow-up',
  name: 'Contextual Follow-up',
  enabled: false,
  type: 'pattern',
  condition: {
    type: 'pattern',
    patternType: 'pending-intent',
    maxAgeMs: 86400000 * 3,  // 3 days
  },
  action: {
    type: 'remind',
    message: 'You mentioned "{{topic}}" earlier. Would you like to follow up?',
    snoozeAvailable: true,
  },
  approvalMode: 'suggest',
  limitPerDay: 3,
};
```

### 4. Integration Health Alert

```typescript
const integrationAlertTrigger: ProactiveTrigger = {
  id: 'builtin-integration-alert',
  name: 'Integration Disconnection Alert',
  enabled: true,
  type: 'event',
  condition: {
    type: 'event',
    event: 'integration_disconnected',
    filter: { durationMinutes: { $gt: 30 } },
  },
  action: {
    type: 'message',
    template: '⚠️ {{integrationName}} has been disconnected for {{duration}}. Should I try to reconnect?',
  },
  approvalMode: 'auto',
};
```

### 5. Security Alert Digest

```typescript
const securityDigestTrigger: ProactiveTrigger = {
  id: 'builtin-security-digest',
  name: 'Security Alert Digest',
  enabled: true,
  type: 'schedule',
  condition: {
    type: 'schedule',
    cron: '0 8 * * *',  // Daily 8am
  },
  action: {
    type: 'message',
    template: 'Security Digest:\n\n🔒 {{securityAlerts}} new alerts\n⚠️ {{warnings}} warnings\n📝 {{info}} informational',
  },
  approvalMode: 'auto',
};
```

---

## REST API

### Triggers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/proactive/triggers` | List all triggers |
| `POST` | `/api/v1/proactive/triggers` | Create trigger |
| `GET` | `/api/v1/proactive/triggers/:id` | Get trigger |
| `PATCH` | `/api/v1/proactive/triggers/:id` | Update trigger |
| `DELETE` | `/api/v1/proactive/triggers/:id` | Delete trigger |
| `POST` | `/api/v1/proactive/triggers/:id/enable` | Enable trigger |
| `POST` | `/api/v1/proactive/triggers/:id/disable` | Disable trigger |
| `POST` | `/api/v1/proactive/triggers/:id/test` | Test trigger |
| `GET` | `/api/v1/proactive/triggers/builtin` | List built-in triggers |
| `POST` | `/api/v1/proactive/triggers/builtin/:id/enable` | Enable built-in trigger |

### Suggestions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/proactive/suggestions` | List suggestions |
| `GET` | `/api/v1/proactive/suggestions/:id` | Get suggestion |
| `POST` | `/api/v1/proactive/suggestions/:id/approve` | Approve and execute |
| `POST` | `/api/v1/proactive/suggestions/:id/dismiss` | Dismiss suggestion |
| `POST` | `/api/v1/proactive/suggestions/:id/modify` | Approve with modifications |
| `DELETE` | `/api/v1/proactive/suggestions/expired` | Clear expired suggestions |

### Patterns

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/proactive/patterns` | List learned patterns |
| `GET` | `/api/v1/proactive/patterns/:id` | Get pattern details |
| `DELETE` | `/api/v1/proactive/patterns/:id` | Delete pattern |
| `POST` | `/api/v1/proactive/patterns/:id/convert` | Convert to trigger |

---

## Dashboard UI

### Proactive Overview Page

- **Stats Cards**: Active triggers, suggestions today, patterns learned, actions executed
- **Quick Enable**: Toggle cards for built-in triggers
- **Recent Activity**: Timeline of recent trigger firings and actions

### Trigger Manager

- **Trigger List**: Table with name, type, status, last fired, cooldown
- **Trigger Editor**: Form with condition builder, action config, approval mode
- **Test Button**: Fire trigger immediately with mock context
- **Import/Export**: JSON format for sharing triggers

### Suggestion Queue

- **Queue Panel**: List of pending suggestions with trigger source, action preview, confidence
- **Action Buttons**: Approve, Dismiss, Modify (opens editor)
- **History Tab**: Executed/dismissed suggestions with timestamps
- **Settings**: Auto-dismiss after X hours, max queue size

### Pattern Explorer

- **Pattern List**: Cards showing pattern name, frequency, confidence
- **Pattern Detail**: View conditions, suggested trigger, convert button
- **Learning Toggle**: Enable/disable pattern learning

### Trigger Condition Builder

```typescript
// Visual builder output
interface ConditionBuilderState {
  type: ProactiveTrigger['type'];
  config: TriggerCondition;
}
```

| Type | Builder UI |
|------|------------|
| Schedule | Cron expression input with human-readable preview |
| Event | Dropdown + JSON filter editor |
| Pattern | Pattern selector + context preview |
| Webhook | URL input + headers + test button |
| LLM | Prompt editor + expected output type |

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)

- [ ] `ProactiveManager` class with trigger registry
- [ ] SQLite schema: `proactive_triggers`, `proactive_suggestions`, `proactive_patterns`
- [ ] Basic schedule executor (cron parsing)
- [ ] Event listener integration (hook into existing events)
- [ ] REST API for CRUD operations

### Phase 2: Action Handlers (Week 1-2)

- [ ] Message action handler (use IntegrationManager)
- [ ] Webhook action handler
- [ ] Remind action handler (store in Brain)
- [ ] Execute action handler (spawn sub-agent)
- [ ] Learn action handler (store pattern in Brain)

### Phase 3: Built-in Triggers (Week 2)

- [ ] Implement 5 built-in triggers
- [ ] Built-in trigger registry and enable/disable
- [ ] Cooldown and limit enforcement

### Phase 4: Pattern Learning (Week 2-3)

- [ ] Pattern event recording in conversations
- [ ] Pattern detection job (daily)
- [ ] Pattern-to-trigger conversion
- [ ] Pattern API endpoints

### Phase 5: Dashboard UI (Week 3)

- [ ] Proactive overview page
- [ ] Trigger manager (list, create, edit, delete)
- [ ] Suggestion queue with approve/dismiss
- [ ] Pattern explorer
- [ ] Test trigger functionality

### Phase 6: LLM Analysis (Week 3-4)

- [ ] LLM analysis trigger type
- [ ] Result parsing (boolean/categorize/extract)
- [ ] Action triggers based on LLM results
- [ ] Cost controls (max tokens, cheap model default)

### Phase 7: Polish (Week 4)

- [ ] Webhook trigger type
- [ ] Notification preferences
- [ ] Documentation and examples
- [ ] Tests and error handling

---

## Configuration

```yaml
proactive:
  enabled: true
  maxQueueSize: 50
  autoDismissAfterMs: 86400000  # 24 hours
  defaultApprovalMode: suggest
  
  limits:
    maxTriggers: 100
    maxPatterns: 50
    actionsPerDay: 1000
    llmAnalysisPerDay: 100
  
  learning:
    enabled: true
    minConfidence: 0.7
    lookbackDays: 14
  
  builtins:
    dailyStandup: false
    weeklySummary: false
    followUp: false
```

---

## Hook Integration

Add new hook points:

```typescript
type ProactiveHook = 
  | 'proactive_trigger_fired'
  | 'proactive_action_executed'
  | 'proactive_suggestion_approved'
  | 'proactive_suggestion_dismissed'
  | 'proactive_pattern_detected';
```

---

## Migration Path

1. Existing heartbeat triggers remain unchanged (separate system)
2. Proactive triggers are additive - new `proactive` config section
3. Built-in triggers disabled by default (opt-in)
4. Existing suggestion queue (if any) migrated

---

## Metrics

| Metric | Target |
|--------|--------|
| Trigger execution success rate | >95% |
| Suggestion approval rate | >50% |
| Pattern detection accuracy | >70% |
| False positive rate | <10% |
| Avg suggestion-to-action time (auto) | <1s |
| Avg suggestion-to-action time (manual) | <30s |

---

## Dependencies

- **Brain**: For storing patterns, reminders, context
- **IntegrationManager**: For multi-channel message delivery
- **SubAgentManager**: For execute action
- **EventEmitter**: For event-based triggers
- **Scheduler**: For cron-based triggers (reuse heartbeat scheduler)

---

## Future Enhancements

- A2A coordination: Proactive messages to other FRIDAY instances
- Workflow templates: Pre-built multi-step automation
- ML-based trigger optimization
- Community trigger marketplace
