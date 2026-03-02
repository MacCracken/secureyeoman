# ADR 015: RBAC Permissions for Capture Operations

## Status

Proposed

## Context

The existing RBAC system (`/packages/core/src/security/rbac.ts`) manages permissions for `tasks`, `connections`, `metrics`, `logs`, and `soul` resources. Screen capture introduces new high-risk operations that require fine-grained access control beyond the current coarse-grained resource model.

Different users need different levels of capture access:
- **Administrators**: Full capture capabilities for system management
- **Operators**: Limited capture for troubleshooting (time-limited, specific targets)
- **Auditors**: View-only access to captured data for compliance review
- **Viewers**: No capture access (deny-by-default)

Additionally, capture operations have varying risk profiles:
- One-time screenshot vs continuous stream
- Full screen vs specific window
- Encrypted storage vs read-only no-storage

## Decision

Extend RBAC with **capture-specific resources and actions** supporting **conditional permissions** and **role inheritance**.

### New Resource Types

```typescript
type CaptureResource = 
  | 'capture.screen'      // Screen recording/capture
  | 'capture.camera'      // Camera/mic access  
  | 'capture.clipboard'   // Clipboard access
  | 'capture.keystrokes'; // Keystroke logging (highly restricted)
```

### New Action Types

```typescript
type CaptureAction = 
  | 'capture'     // Initiate capture
  | 'stream'      // Stream live feed
  | 'configure'   // Change capture settings
  | 'review';     // Review captured data
```

### Permission Conditions

Support conditional permissions with operators:
- `eq`, `neq` — equality checks
- `in`, `nin` — array membership
- `gt`, `gte`, `lt`, `lte` — numeric comparisons

Example condition: `{ field: 'duration', operator: 'lte', value: 60 }` limits capture to 60 seconds.

### Updated Default Roles

#### role_operator (enhanced)
```typescript
{
  id: 'role_operator',
  permissions: [
    // Existing permissions...
    { 
      resource: 'capture.screen', 
      actions: ['capture', 'review'],
      conditions: [{ field: 'duration', operator: 'lte', value: 300 }]
    },
    { 
      resource: 'capture.camera', 
      actions: ['capture'],
      conditions: [{ field: 'duration', operator: 'lte', value: 60 }]
    }
  ]
}
```

#### role_auditor (enhanced)
```typescript
{
  id: 'role_auditor',
  permissions: [
    // Existing permissions...
    { resource: 'capture.*', actions: ['review'] },  // View any capture
    { resource: 'audit', actions: ['read', 'verify', 'export'] }
  ]
}
```

### New Role: role_capture_operator

Specialized role for users who frequently need capture capabilities:

```typescript
{
  id: 'role_capture_operator',
  name: 'Capture Operator',
  description: 'Can perform screen capture with extended time limits',
  permissions: [
    { 
      resource: 'capture.screen', 
      actions: ['capture', 'stream', 'review'],
      conditions: [{ field: 'duration', operator: 'lte', value: 1800 }]  // 30 min
    },
    { 
      resource: 'capture.camera', 
      actions: ['capture', 'stream'],
      conditions: [{ field: 'duration', operator: 'lte', value: 300 }]
    },
    { 
      resource: 'capture.clipboard', 
      actions: ['capture'] 
    }
  ],
  inheritFrom: ['role_operator']  // Inherits all operator permissions
}
```

### Permission Middleware

Create reusable middleware for capture endpoints:

```typescript
// Enforces RBAC before any capture operation
export function requireCapturePermission(
  resource: CaptureResource,
  action: CaptureAction
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { userId, roleId } = req.session;
    const context = extractContext(req);  // duration, target, etc.
    
    const rbac = getRBAC();
    const result = rbac.checkPermission(roleId, { resource, action, context }, userId);
    
    if (!result.granted) {
      await auditLogger.logPermissionDenied(userId, resource, action, result.reason);
      throw new PermissionDeniedError(resource, action, result.reason);
    }
    
    next();
  };
}

// Usage:
router.post('/capture/screen', 
  requireCapturePermission('capture.screen', 'capture'),
  captureHandler
);
```

### Caching Strategy

Cache permission checks with composite keys:
- Format: `{roleId}:{resource}:{action}:{contextHash}`
- TTL: 5 minutes for capture permissions
- Max size: 1000 entries (LRU eviction)
- Cache invalidation on role changes

## Consequences

- **Performance**: Permission checks add ~1-2ms latency with caching
- **Flexibility**: Conditions enable complex policies (time-of-day, location-based)
- **Audit burden**: Every denied permission must be logged
- **Role explosion risk**: Too many specialized roles become unmanageable
- **Migration needed**: Existing roles need review for capture permissions

### Positive

- Granular access control aligned with security principles
- Conditions enable context-aware permissions
- Middleware pattern keeps handlers clean
- Caching maintains performance at scale

### Negative

- Complex permission conditions are harder to debug
- Role inheritance can create unexpected permission combinations
- Context extraction from requests adds boilerplate

## References

- `/packages/core/src/security/rbac.ts`
- `/docs/planning/screen-capture/NEXT_STEP_01_RBAC_Permissions.md`
