# ADR 016: User Consent and Approval Flow for Capture

## Status

Proposed

## Context

RBAC and platform permissions provide authorization checks, but they don't capture **user intent** at the moment of capture. A user might have the technical permission to capture screens but should still explicitly approve each capture session, understanding:
- What will be captured
- How long it will last
- Why it's needed
- Who will see it

OpenClaw uses device pairing with per-node execution approval, which is coarse-grained. Friday needs a more user-centric model with:
- Per-capture approval (not per-device)
- Clear visibility into capture scope
- Ability to revoke consent mid-capture
- Audit trail of consent decisions

## Decision

Implement a **consent layer** between authorization and execution that requires explicit user approval for every capture session with cryptographic verification.

### Consent Data Model

```typescript
interface CaptureConsent {
  id: string;                    // UUID v4
  userId: string;                // Who is requesting
  requestedBy: string;           // Actor making request (may differ from userId)
  sessionId: string;             // Associated session
  
  // Timing
  requestedAt: number;           // When requested (Unix ms)
  expiresAt: number;             // Auto-expire timestamp
  grantedAt?: number;            // When approved
  grantedBy?: string;            // Who approved (may be self)
  deniedAt?: number;
  denialReason?: string;
  revokedAt?: number;
  
  // Scope
  scope: {
    resource: 'screen' | 'camera' | 'microphone';
    target?: string;             // Specific window/app
    duration: number;            // Max seconds
    quality: string;             // Resolution
    purpose: string;             // Why capture is needed
  };
  
  // State
  status: 'pending' | 'granted' | 'denied' | 'expired' | 'revoked';
  
  // Cryptographic integrity
  signature?: string;            // RSASSA-PKCS1-v1_5 signature
}
```

### Consent Flow

```
Request Capture
      ↓
Generate Consent Object
      ↓
Sign with Private Key ────────────┐
      ↓                           │
Store as 'pending'                │
      ↓                           │
Send Real-time Notification       │
      ↓                           │
User Reviews Scope & Purpose      │
      ↓                           │
User Grants/Denies                │
      ↓                           │
Update Consent Status             │
      ↓                           │
Re-sign Updated Object ◄──────────┘
      ↓
Audit Log Entry
      ↓
Proceed if Granted / Abort if Denied
```

### Approval Timeout

- **Default**: 30 seconds
- **Maximum**: 5 minutes (configurable)
- **Behavior**: Auto-deny after timeout
- **Retry**: New consent request required (not automatic)

### Visual Indicators

**Pending Approval**: Toast notification in dashboard with:
- Requester identity
- Capture scope (screen, duration, quality)
- Purpose statement
- Expiration countdown
- Allow/Deny buttons

**Active Capture**: Persistent banner showing:
- Recording indicator (pulsing red dot)
- Time remaining
- Scope summary
- Stop button (revokes consent)

### Revocation

Users can revoke consent at any time:
1. Click "Stop Capture" in dashboard
2. Consent status changes to `revoked`
3. Capture process receives SIGTERM
4. Sandboxed process terminates within 5 seconds
5. Audit log entry: `capture.stopped` with reason `consent_revoked`

### Cryptographic Signatures

All consent decisions are cryptographically signed:

```typescript
async function signConsent(consent: CaptureConsent): Promise<string> {
  const data = JSON.stringify({
    id: consent.id,
    userId: consent.userId,
    scope: consent.scope,
    status: consent.status,
    timestamp: consent.grantedAt || consent.deniedAt || consent.requestedAt
  });
  
  return await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(data)
  ).then(sig => Buffer.from(sig).toString('base64'));
}
```

This provides **non-repudiation**: users cannot claim they didn't approve a capture.

### Configuration

```typescript
interface ConsentConfig {
  defaultTimeoutMs: number;          // 30000
  maxTimeoutMs: number;              // 300000
  requireExplicitGrant: boolean;     // true (cannot be disabled)
  autoDenyOnTimeout: boolean;        // true
  showPurpose: boolean;              // true
  allowRevoke: boolean;              // true
  visualIndicator: boolean;          // true
  audioAlert: boolean;               // true
  requireReapprovalAfterMs: number;  // 300000 (5 min idle)
}
```

## Consequences

- **User experience friction**: Additional click for every capture
- **Session timeout complexity**: Idle detection and re-approval
- **Signature overhead**: ~2ms per consent operation
- **Storage**: Consent records retained for audit (configurable retention)

### Positive

- Explicit user control over privacy
- Tamper-proof consent records
- Clear audit trail for compliance
- Revocation capability respects user autonomy
- Meets GDPR "lawful basis" requirements

### Negative

- Interrupts workflow for frequent capture users
- Timeout edge cases (user away from keyboard)
- Signature verification adds complexity
- Must handle race conditions (revoke during capture)

## References

- `/docs/planning/screen-capture/NEXT_STEP_02_User_Consent_Layer.md`
- GDPR Article 7: Conditions for consent
