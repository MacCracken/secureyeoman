# ADR 021: Skill Actions Architecture

**Status**: Proposed
**Date**: 2026-02-13

## Context

F.R.I.D.A.Y.'s Soul system currently provides skills that compose into AI system prompts, but they cannot execute real actions. OpenClaw's skill system demonstrates that skills can execute code, make API calls, and perform file operations — transforming the agent from a chatbot into an autonomous assistant.

This ADR establishes the architecture for skill actions while maintaining security-first principles.

## Decision

### Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Skill Action Layer                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Code Action │  │ HTTP Action │  │   Shell Action      │  │
│  │  (sandbox)  │  │  (API call) │  │  (command exec)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │              SkillExecutor Service                    │    │
│  │  - Action validation                                  │    │
│  │  - Permission checks                                  │    │
│  │  - Audit logging                                     │    │
│  │  - Result handling                                   │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Sandbox Manager                          │    │
│  │  - Resource limits                                   │    │
│  │  - Timeout enforcement                               │    │
│  │  - Network restrictions                              │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Skill Action Types

#### 1. Code Action
Execute code in a sandboxed environment:

```typescript
interface CodeAction {
  type: 'code';
  language: 'javascript' | 'python';
  code: string;
  timeoutMs?: number;      // Default: 30000
  memoryLimitMb?: number;  // Default: 256
}
```

#### 2. HTTP Action
Make external API calls:

```typescript
interface HttpAction {
  type: 'http';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retryCount?: number;
}
```

#### 3. Shell Action
Execute shell commands (restricted):

```typescript
interface ShellAction {
  type: 'shell';
  command: string;
  timeoutMs?: number;
  cwd?: string;
  allowedPaths?: string[];  // Restrict to specific paths
}
```

### Action Execution Flow

```
Skill Action Request
        │
        ▼
┌───────────────────┐
│  Validate Action  │ ─── Invalid → Reject
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ Check RBAC       │ ─── Denied → Reject
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ Check Approval   │ ─── Required → Request approval
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Execute in      │
│  Sandbox         │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Audit Log       │
│  (hash only)     │
└────────┬──────────┘
         │
         ▼
     Return Result
```

### Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| **RBAC** | `skills:execute` permission required |
| **Sandboxing** | All code runs in isolated sandbox |
| **Approval** | Actions marked `requireApproval` need user consent |
| **Audit** | Log execution with input/output hashes |
| **Timeout** | Default 30s, max 5min |
| **Network** | Only allowlisted domains for HTTP actions |

### Extended Skill Schema

```typescript
interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tools: Tool[];
  triggerPatterns: string[];
  
  // New: Actions
  actions?: SkillAction[];
  
  // New: Dependencies
  dependencies?: string[];  // Skill IDs
  provides?: string[];       // Capability names
  
  // Security
  requireApproval?: boolean;
  allowedPermissions?: string[];
  
  // Metadata
  enabled: boolean;
  source: 'user' | 'ai_proposed' | 'ai_learned';
  status: 'active' | 'pending_approval' | 'disabled';
}
```

### RBAC Permissions

```typescript
const SKILL_PERMISSIONS = {
  'skills:create': { description: 'Create new skills with actions' },
  'skills:execute': { description: 'Execute skill actions' },
  'skills:approve': { description: 'Approve pending skill actions' },
  'skills:marketplace': { description: 'Browse and install marketplace skills' },
};
```

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Permission denied | Log attempt, return error |
| Timeout | Kill execution, log timeout |
| Sandbox violation | Log violation, disable skill |
| HTTP error | Log error code, return error details |
| Approval required | Return pending status |

## Consequences

### Positive
- **Autonomous**: Skills can now perform real actions
- **Secure**: Sandboxed execution prevents system compromise
- **Auditable**: All actions logged for compliance
- **Flexible**: Multiple action types for different use cases

### Negative
- **Complexity**: More complex than prompt-only skills
- **Risk**: Even sandboxed code can have vulnerabilities
- **Resource**: Execution consumes CPU/memory

### Mitigations
- Strict sandbox limits
- Mandatory approval for high-risk actions
- Network allowlisting for HTTP actions
- Comprehensive audit logging

## Related ADRs

- [ADR 007: Skill Marketplace](./007-skill-marketplace.md)
- [ADR 003: Sacred Archetypes](./003-sacred-archetypes.md)
- [ADR 022: Skill Trigger System](./022-skill-trigger-system.md)
- [ADR 015: RBAC Capture Permissions](./015-rbac-capture-permissions.md)

---

**Previous**: [ADR 020: Push-to-Talk](./020-push-to-talk.md)  
**Next**: [ADR 022: Skill Trigger System](./022-skill-trigger-system.md)
