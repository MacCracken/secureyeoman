# NEXT_STEP: RBAC Permissions for Screen Capture

**Status:** In Progress  
**Priority:** High  
**Assigned:** TBD  
**Depends On:** None  
**Blocks:** NEXT_STEP_02, NEXT_STEP_04

---

**Related ADR:** [ADR 015: RBAC Permissions for Capture](../../adr/015-rbac-capture-permissions.md)

---

## Objective

Define and implement RBAC permissions for screen capture capabilities, enabling fine-grained access control aligned with Friday's deny-by-default security model.

---

## Background

Friday's RBAC system (`/packages/core/src/security/rbac.ts:78`) currently supports resources like `tasks`, `connections`, `metrics`, `logs`, `soul`, and `audit`. Screen capture requires new resource types and actions.

Current default roles:
- `role_admin` — Full access (`*:*`)
- `role_operator` — Task/connection management
- `role_auditor` — Read-only logs/audit
- `role_viewer` — Read-only metrics/tasks

---

## Tasks

### 1. Define Resource Types

Create new resource categories:

```typescript
// In /packages/core/src/body/types.ts
export type CaptureResource = 
  | 'capture.screen'      // Screen capture
  | 'capture.camera'      // Camera/mic access
  | 'capture.clipboard'   // Clipboard access
  | 'capture.keystrokes'; // Keystroke logging (highly restricted)

export type CaptureAction = 
  | 'capture'     // Initiate capture
  | 'stream'      // Stream live feed
  | 'configure'   // Change capture settings
  | 'review';     // Review captured data
```

### 2. Update Default Roles

Add permissions to existing roles:

```typescript
// role_admin: already has *:* (no change needed)

// role_operator - add capture permissions
{
  resource: 'capture.screen',
  actions: ['capture', 'stream', 'configure', 'review'],
  conditions: [{ field: 'duration', operator: 'lte', value: 60 }]
}

// role_auditor - add review permission only
{
  resource: 'capture.screen',
  actions: ['review']
}

// role_viewer - no capture permissions (deny by default)
```

### 3. Create New Specialized Roles

```typescript
// Screen capture specialist
{
  id: 'role_capture_operator',
  name: 'Capture Operator',
  description: 'Can perform screen capture with time limits',
  permissions: [
    { resource: 'capture.screen', actions: ['capture'], 
      conditions: [{ field: 'duration', operator: 'lte', value: 300 }] },
    { resource: 'capture.camera', actions: ['capture'],
      conditions: [{ field: 'duration', operator: 'lte', value: 60 }] }
  ]
}

// Security auditor with capture review
{
  id: 'role_security_auditor',
  name: 'Security Auditor',
  description: 'Can review captured data and audit logs',
  permissions: [
    { resource: 'capture.*', actions: ['review'] },
    { resource: 'audit', actions: ['read', 'verify'] }
  ]
}
```

### 4. Implement Permission Middleware

```typescript
// In /packages/core/src/body/capture.ts
import { getRBAC, PermissionDeniedError } from '../security/rbac.js';

export function requireCapturePermission(
  resource: string,
  action: string,
  context?: Record<string, unknown>
) {
  return async (userId: string, roleId: string) => {
    const rbac = getRBAC();
    const result = rbac.checkPermission(roleId, { resource, action, context }, userId);
    
    if (!result.granted) {
      throw new PermissionDeniedError(resource, action, result.reason);
    }
    
    return result;
  };
}
```

### 5. Add Permission Caching

- Cache results in RBAC's existing cache system (`rbac.ts:80`)
- Cache key: `capture:${userId}:${resource}:${action}:${contextHash}`
- TTL: 5 minutes for capture permissions

### 6. Write Tests

```typescript
// In /packages/core/src/security/__tests__/rbac.capture.test.ts
describe('RBAC Capture Permissions', () => {
  it('should deny capture.screen:capture to viewer role', () => {
    // Test implementation
  });
  
  it('should allow capture with conditions', () => {
    // Test duration limits
  });
  
  it('should enforce resource isolation', () => {
    // Test that capture.screen doesn't grant capture.camera
  });
});
```

---

## Deliverables

- [x] Updated `/packages/core/src/body/types.ts` with CaptureResource and CaptureAction types
- [x] Updated default roles in `/packages/core/src/security/rbac.ts:20-64`
- [x] New role definitions for capture specialists
- [x] Permission middleware in `/packages/core/src/body/capture-permissions.ts`
- [x] Unit tests with 100% coverage of new permission paths
- [x] Documentation update in `/docs/security/security-model.md`

---

## Security Considerations

1. **Deny by default** — All capture actions require explicit permission
2. **Time limits** — Use conditions to enforce max capture duration per role
3. **Audit all checks** — Every permission check must be logged
4. **No wildcards** — Avoid `capture.*` except for admin/auditor roles
5. **Context awareness** — Support time-of-day, location-based conditions

---

## Success Criteria

- [ ] RBAC grants/denies capture permissions correctly
- [ ] Condition-based restrictions work (duration, scope)
- [ ] Cache hit/miss metrics logged
- [ ] All permission denials logged with context
- [ ] Tests pass with 100% coverage

