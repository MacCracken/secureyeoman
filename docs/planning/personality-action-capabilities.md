# Personality Action Capabilities Plan

> Adding autonomous action capabilities to F.R.I.D.A.Y.'s personality system

## Overview

OpenClaw enables agents to take autonomous actions through its Skills system — bundles of instructions + code that extend agent capabilities. F.R.I.D.A.Y. already has a Soul system with Personality and Skills, but lacks the ability for skills to execute real actions beyond composing prompts.

This plan outlines how to add action capabilities while maintaining security-first principles.

---

## Current State

### What's Already Implemented

**Soul System** (`packages/core/src/soul/`):
- ✅ Personality management (name, traits, voice, language)
- ✅ Skills with instructions, tools, trigger patterns
- ✅ Skill approval workflow (pending → active)
- ✅ Learning modes (user_authored, ai_proposed, autonomous)
- ✅ Skill usage tracking

**Skill Schema**:
```typescript
interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;      // System prompt instructions
  tools: Tool[];             // Available tools
  triggerPatterns: string[]; // What activates this skill
  enabled: boolean;
  source: 'user' | 'ai_proposed' | 'ai_learned';
  status: 'active' | 'pending_approval' | 'disabled';
}
```

### What's Missing

| Feature | OpenClaw | Friday | Gap |
|--------|----------|--------|-----|
| **Execute code/actions** | ✅ Skills execute code | ❌ Skills only provide prompts | Major |
| **File operations** | ✅ File read/write in skills | ❌ No file ops | Major |
| **API integrations** | ✅ Skills make external API calls | ❌ No built-in API actions | Major |
| **Automation** | ✅ Skills run on schedule/trigger | ❌ Heartbeat separate | Medium |
| **Skill marketplace** | ✅ Community skills | ⚠️ Schema exists, no UI | Medium |
| **Skill dependencies** | ✅ Skills can depend on other skills | ❌ No dependency tracking | Medium |

---

## Security-First Design Principles

Any action capability must adhere to:

| Principle | Implementation |
|-----------|----------------|
| **Deny by Default** | All actions must be explicitly allowed in skill definition |
| **RBAC** | Skills require `skills:execute` permission |
| **Sandboxing** | Skill actions run in isolated sandbox |
| **Audit** | All skill executions logged with input/output hashes |
| **Consent** | User must approve skill before it can execute actions |
| **Least Privilege** | Skills only get minimum required tool permissions |
| **Fail Secure** | On error, action defaults to no-op |

---

## Proposed Capabilities

### 1. Skill Actions (Core Feature)

Skills gain the ability to execute actions, not just provide prompts:

```typescript
interface SkillAction {
  id: string;
  skillId: string;
  
  // Action definition
  type: 'code' | 'http' | 'shell' | 'function';
  
  // For code actions
  code?: string;
  language?: 'javascript' | 'python';
  
  // For HTTP actions  
  http?: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: string;
  };
  
  // For shell actions
  shell?: {
    command: string;
    timeoutMs?: number;
    cwd?: string;
  };
  
  // Security
  permissions?: string[];  // Required RBAC permissions
  timeoutMs?: number;
  requireApproval?: boolean;  // Always require user approval
  
  // Trigger
  triggers?: {
    onInstall?: boolean;
    onMessage?: string[];  // Message patterns
    onSchedule?: string;   // Cron expression
    onToolUse?: string[];  // When specific tool is used
  };
}
```

### 2. Skill Dependencies

Skills can depend on other skills:

```typescript
interface Skill {
  // ... existing fields
  dependencies?: string[];  // Skill IDs this depends on
  provides?: string[];      // Capabilities this provides to dependents
}
```

### 3. Scheduled Skill Execution

Skills run on schedules (beyond heartbeat):

```typescript
interface ScheduledSkill {
  skillId: string;
  actionId?: string;  // Specific action within skill
  
  schedule: {
    cron?: string;        // Cron expression
    intervalMs?: number;  // Or fixed interval
    timezone?: string;
  };
  
  conditions?: {
    enabled?: boolean;
    activeHours?: { start: string; end: string };
    daysOfWeek?: string[];
  };
  
  notifications?: {
    onSuccess?: boolean;
    onFailure?: boolean;
    webhookUrl?: string;
  };
}
```

### 4. Skill Marketplace Integration

Connect to skill registry:

```typescript
interface MarketplaceListing {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  version: string;
  
  // Security
  permissions: string[];  // Required permissions
  auditInfo: string;     // Security audit result
  
  // Installation
  installScript?: string;
  configSchema?: object;
  remoteUrl?: string;
}
```

---

## Implementation Phases

### Phase 1: Skill Action Framework

**Duration**: 2 weeks

1. **Extend Skill Schema**
   ```typescript
   // Add to SkillSchema
   actions?: SkillAction[];
   dependencies?: string[];
   provides?: string[];
   ```

2. **Create SkillExecutor Service**
   ```typescript
   class SkillExecutor {
     async executeAction(
       skillId: string, 
       actionId: string, 
       context: ExecutionContext
     ): Promise<ActionResult>
   }
   ```

3. **Add RBAC for Skills**
   ```typescript
   const SKILL_PERMISSIONS = {
     'skills:create': { description: 'Create new skills' },
     'skills:execute': { description: 'Execute skill actions' },
     'skills:approve': { description: 'Approve pending skills' },
     'skills:marketplace': { description: 'Browse/install marketplace skills' },
   };
   ```

4. **Sandboxed Execution**
   - Use existing sandbox infrastructure
   - Add skill-specific resource limits
   - Implement action timeout handling

### Phase 2: Trigger System

**Duration**: 1 week

1. **Message Triggers**
   - Parse user messages against `triggerPatterns`
   - Activate matching skills automatically

2. **Tool Use Triggers**
   - When specific tool is called, run configured skill action

3. **Event-based Triggers**
   - On skill install/uninstall
   - On session start/end

### Phase 3: Scheduled Execution

**Duration**: 1 week

1. **Skill Scheduler**
   - Similar to heartbeat system
   - Cron-based scheduling
   - Integration with notification system

2. **Conditions**
   - Active hours
   - Day of week
   - Environment checks

### Phase 4: Marketplace

**Duration**: 2 weeks

1. **Marketplace API Client**
   - Fetch available skills
   - Search/filter
   - Install workflow

2. **Security Review**
   - Static analysis of skill code
   - Permission requirements display
   - Community trust scores

3. **UI Integration**
   - Browse marketplace in dashboard
   - One-click install
   - Auto-update

---

## Configuration Schema

```yaml
skills:
  enabled: true
  
  # Execution
  execution:
    sandbox: true
    timeoutMs: 30000
    maxRetries: 2
    
  # Learning
  learning:
    mode: [user_authored, ai_proposed]  # No autonomous yet
    requireApproval: true
    maxProposedPerDay: 5
    
  # Marketplace
  marketplace:
    enabled: false  # Future
    registryUrl: "https://skills.friday.ai"
    autoUpdate: false
    
  # Scheduling  
  scheduled:
    enabled: true
    maxScheduled: 20
```

---

## RBAC Integration

```typescript
// New role permissions for skills
{
  id: 'role_skill_developer',
  name: 'Skill Developer',
  permissions: [
    { resource: 'skills', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'skills', actions: ['execute'], conditions: [{ field: 'requireApproval', operator: 'eq', value: true }] },
  ],
}

{
  id: 'role_skill_operator',
  name: 'Skill Operator', 
  permissions: [
    { resource: 'skills', actions: ['read', 'execute'] },
    { resource: 'skills', actions: ['approve'] },
  ],
  inheritFrom: ['role_operator'],
}
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Skill injection** | Medium | Critical | Sandbox all execution; verify skill signatures |
| **Permission escalation** | Low | High | RBAC enforced; skills limited to declared permissions |
| **Malicious marketplace skill** | Medium | High | Security review required; sandbox limits; user approval |
| **Resource exhaustion** | Medium | Medium | Timeout limits; rate limiting; quota enforcement |
| **Data exfiltration** | Low | Critical | Audit all actions; network restrictions |

---

## Reference: OpenClaw Skills

OpenClaw skills can:
- Execute arbitrary code in sandbox
- Read/write files
- Make HTTP requests
- Run shell commands
- Access environment variables
- Use agent memory

**Security lesson**: OpenClaw had 230+ malicious skills discovered — we need mandatory security review before public listing.

---

## Related Documentation

- [ADR 003: Sacred Archetypes](./adr/003-sacred-archetypes.md)
- [ADR 007: Skill Marketplace](./adr/007-skill-marketplace.md)
- [ADR 013: Heartbeat Task Scheduling](./adr/013-heartbeat-task-scheduling-knowledge-crud.md)
- [ADR 018: Proactive Heartbeat](./adr/018-proactive-heartbeat-enhancements.md)
- [Security Model](./security/security-model.md)

---

## Next Steps

1. **Review this plan** with security stakeholders
2. **Create ADRs** for each major feature:
   - ADR 021: Skill Actions Architecture
   - ADR 022: Skill Trigger System  
   - ADR 023: Scheduled Skill Execution
   - ADR 024: Skill Marketplace (or enhance 007)
3. **Start Phase 1** — Skill action framework with sandboxed execution
