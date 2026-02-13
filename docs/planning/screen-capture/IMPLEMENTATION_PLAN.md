# Screen Capture Implementation Plan

**Status:** Planning Phase  
**Priority:** High (Security-Critical Feature)  
**Started:** 2026-02-13

---

## Overview

This plan outlines the secure implementation of screen capture capabilities in F.R.I.D.A.Y., drawing lessons from [OpenClaw](https://github.com/openclaw/openclaw)'s architecture while maintaining Friday's security-first design principles.

### Context

- **OpenClaw** implements screen capture via Node system with WebSocket connections, `screen.record` and `canvas.snapshot` commands
- **Friday** currently has screen capture marked as TODO in `/packages/core/src/body/types.ts:11`
- Friday's security model: RBAC, sandboxing, audit logging, deny-by-default

---

## Architecture Decision Records (ADRs)

Key architectural decisions are documented as ADRs:

- **[ADR 014: Screen Capture Security Architecture](../../adr/014-screen-capture-security-architecture.md)** — Multi-layer security model overview
- **[ADR 015: RBAC Permissions for Capture](../../adr/015-rbac-capture-permissions.md)** — Permission system design
- **[ADR 016: User Consent and Approval Flow](../../adr/016-user-consent-capture.md)** — Consent layer architecture
- **[ADR 017: Sandboxed Execution](../../adr/017-sandboxed-capture-execution.md)** — Sandboxing approach

---

## NEXT_STEP Files

Each implementation phase has its own dedicated task file:

1. **[NEXT_STEP_01_RBAC_Permissions.md](./NEXT_STEP_01_RBAC_Permissions.md)** — Define RBAC permissions for screen capture actions
2. **[NEXT_STEP_02_User_Consent_Layer.md](./NEXT_STEP_02_User_Consent_Layer.md)** — Build user consent and approval system
3. **[NEXT_STEP_03_Scope_Limiting.md](./NEXT_STEP_03_Scope_Limiting.md)** — Implement scope controls (target window, duration, quality)
4. **[NEXT_STEP_04_Audit_Logging.md](./NEXT_STEP_04_Audit_Logging.md)** — Integrate with Friday's audit system
5. **[NEXT_STEP_05_Sandboxing.md](./NEXT_STEP_05_Sandboxing.md)** — Sandboxed execution for capture processes
6. **[NEXT_STEP_06_Platform_TCC.md](./NEXT_STEP_06_Platform_TCC.md)** — Platform-specific permission handling (macOS TCC, etc.)

---

## Key Design Decisions

### Security Model

```
User Request → RBAC Check → Consent Prompt → Scope Validation → 
    Audit Log → Sandboxed Execution → Result Sanitization → Return
```

### Comparison: OpenClaw vs Friday

| Aspect | OpenClaw | Friday (Proposed) |
|--------|----------|-------------------|
| **Permissions** | Device pairing + per-node approval | RBAC roles + explicit permissions |
| **Consent** | Pairing required | Per-action consent with timeout |
| **Scope** | App must be foregrounded | Configurable: window, duration, quality |
| **Audit** | Node logs | Cryptographic audit trail |
| **Sandbox** | Docker for non-main | Linux namespaces + seccomp + Landlock |

### Critical Security Requirements

1. **Deny-by-default** — No screen capture without explicit permission
2. **User notification** — Visual indicator when capture is active
3. **Time limits** — Auto-expire capture sessions (configurable, default 60s)
4. **Audit everything** — Every capture request, approval, and result logged
5. **Encrypted at rest** — Captured data encrypted with AES-256-GCM
6. **Scope isolation** — Capture process runs in minimal sandbox

---

## Success Criteria

- [ ] RBAC permissions defined for `capture.screen`, `capture.camera`, `capture.microphone`
- [ ] Consent system with configurable approval timeout (default 30s)
- [ ] Scope limiting: target application/window, max duration, quality settings
- [ ] Full audit trail for all capture events with integrity verification
- [ ] Sandboxed capture process isolated from main system
- [ ] Platform-specific permission integration (macOS TCC, Windows, Linux)
- [ ] Documentation for security administrators
- [ ] Security testing guide with penetration test scenarios

---

## Related Files

- `/packages/core/src/body/types.ts` — Body module types (TODO at line 11)
- `/packages/core/src/security/rbac.ts` — RBAC implementation
- `/packages/core/src/sandbox/` — Sandboxing system
- `/packages/core/src/security/audit/` — Audit logging
- `/docs/guides/security-testing.md` — Security testing guide

---

## Notes

- This is a **security-critical feature** requiring thorough review
- All code must pass security audit before merge to main
- Consider GDPR/privacy implications for screen capture data

