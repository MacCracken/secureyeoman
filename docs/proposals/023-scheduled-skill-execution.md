# ADR 023: Scheduled Skill Execution

**Status**: Proposed
**Date**: 2026-02-13

## Context

Skills should be able to run on schedules — not just react to user input. This is similar to heartbeat (ADR 013/018) but specifically for skill actions that need periodic execution.

Building on ADRs 021 and 022, this ADR defines scheduled skill execution.

## Decision

### Overview

```
Heartbeat System          Skill Scheduler
       │                        │
       ▼                        ▼
┌─────────────┐          ┌─────────────┐
│ Health      │          │ Skill       │
│ Checks      │          │ Actions     │
└─────────────┘          └─────────────┘
       │                        │
       └────────┬───────────────┘
                ▼
         Unified Scheduling
         (Shared infrastructure)
```

### Schedule Types

#### 1. Cron Schedule
```typescript
interface CronSchedule {
  type: 'cron';
  expression: string;        // Standard cron: "0 9 * * 1-5"
  timezone?: string;        // Default: UTC
}
```

#### 2. Interval Schedule
```typescript
interface IntervalSchedule {
  type: 'interval';
  intervalMs: number;       // e.g., 3600000 = 1 hour
  startAt?: number;         // Unix timestamp
}
```

#### 3. One-time Schedule
```typescript
interface OneTimeSchedule {
  type: 'once';
  timestamp: number;        // Unix ms
}
```

### Condition Filters

```typescript
interface ScheduleConditions {
  // Time-based
  activeHours?: {
    start: string;  // "09:00"
    end: string;    // "17:00"
    timezone?: string;
  };
  
  daysOfWeek?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
  
  // Environment
  environment?: string[];   // e.g., ["production", "development"]
  
  // Context
  sessionActive?: boolean;
  
  // Custom
  customCondition?: string;  // Expression evaluation
}
```

### Scheduled Skill Definition

```typescript
interface ScheduledSkill {
  id: string;
  skillId: string;
  actionId?: string;         // Specific action in the skill
  
  // Schedule
  schedule: CronSchedule | IntervalSchedule | OneTimeSchedule;
  
  // Conditions
  conditions?: ScheduleConditions;
  
  // Execution
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
  
  // Notifications
  notifications?: {
    onSuccess?: NotificationConfig;
    onFailure?: NotificationConfig;
    onSkip?: NotificationConfig;
  };
  
  // State
  enabled: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
  
  // Metadata
  createdAt: number;
  updatedAt: number;
}

interface NotificationConfig {
  type: 'webhook' | 'log' | 'memory';
  config: Record<string, unknown>;
}
```

### Scheduler Service

```typescript
class SkillScheduler {
  // Add scheduled skill
  schedule(scheduledSkill: ScheduledSkill): void;
  
  // Remove
  unschedule(skillId: string): void;
  
  // Pause/Resume
  pause(skillId: string): void;
  resume(skillId: string): void;
  
  // Manual trigger
  triggerNow(skillId: string): Promise<ExecutionResult>;
  
  // Status
  getScheduledSkills(): ScheduledSkill[];
  getNextRun(skillId: string): number | null;
}
```

### Execution Flow

```
Schedule Time Reached
        │
        ▼
┌─────────────────────────────────┐
│  Check Conditions              │
│  - Day of week                │
│  - Active hours               │
│  - Environment               │
└────────────┬────────────────────┘
             │ (pass)
             ▼
┌─────────────────────────────────┐
│  Check RBAC                    │
│  - skills:execute             │
└────────────┬────────────────────┘
             │ (allowed)
             ▼
┌─────────────────────────────────┐
│  Execute Skill Action          │
│  (via SkillExecutor)          │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Handle Result                 │
│  - Log success/failure        │
│  - Send notifications         │
│  - Update schedule            │
└─────────────────────────────────┘
```

### Integration with Heartbeat

The skill scheduler reuses heartbeat infrastructure:

| Component | Heartbeat | Skill Scheduler |
|-----------|-----------|-----------------|
| Scheduler | `HeartbeatManager` | `SkillScheduler` |
| Check | `HeartbeatCheck` | `ScheduledSkill` |
| Action | `HeartbeatAction` | `SkillAction` |
| Conditions | ADR 018 | This ADR |

This means:
- Shared timing engine
- Consistent state management
- Unified observability

### Configuration

```yaml
skills:
  scheduled:
    enabled: true
    maxScheduled: 20           # Per personality
    defaultTimeoutMs: 30000
    defaultRetryCount: 2
    
  notifications:
    defaultChannel: "memory"    # Where to send results
```

### API Endpoints

```typescript
// List scheduled skills
GET /api/v1/skills/scheduled

// Create scheduled skill
POST /api/v1/skills/scheduled

// Get specific scheduled skill
GET /api/v1/skills/scheduled/:id

// Update scheduled skill
PUT /api/v1/skills/scheduled/:id

// Delete scheduled skill
DELETE /api/v1/skills/scheduled/:id

// Trigger immediately
POST /api/v1/skills/scheduled/:id/trigger

// Pause/Resume
POST /api/v1/skills/scheduled/:id/pause
POST /api/v1/skills/scheduled/:id/resume
```

## Consequences

### Positive
- **Automation**: Skills run without user input
- **Reuse**: Shares heartbeat infrastructure
- **Flexible**: Multiple schedule types and conditions
- **Reliable**: Built-in retry and notification

### Negative
- **Overlapping**: May conflict with manual skill use
- **Resource**: Continuous scheduling consumes resources
- **Complexity**: More configuration options

### Mitigations
- Limit max scheduled skills
- Cooldown between runs
- Clear notification on failures

## Related ADRs

- [ADR 021: Skill Actions Architecture](./021-skill-actions-architecture.md)
- [ADR 022: Skill Trigger System](./022-skill-trigger-system.md)
- [ADR 018: Proactive Heartbeat](./018-proactive-heartbeat-enhancements.md)
- [ADR 013: Heartbeat Task Scheduling](./013-heartbeat-task-scheduling-knowledge-crud.md)

---

**Previous**: [ADR 022: Skill Trigger System](./022-skill-trigger-system.md)  
**Next**: [ADR 024: Dashboard Navigation Restructuring](./024-dashboard-settings-restructuring.md)
