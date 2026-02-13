# NEXT_STEP: User Consent Layer

**Status:** In Progress  
**Priority:** Critical  
**Assigned:** TBD  
**Depends On:** NEXT_STEP_01 (RBAC Permissions)  
**Blocks:** NEXT_STEP_04 (Audit Logging)

---

**Related ADRs:** 
- [ADR 014: Screen Capture Security Architecture](../../adr/014-screen-capture-security-architecture.md)
- [ADR 016: User Consent and Approval Flow](../../adr/016-user-consent-capture.md)

---

## Objective

Build a user consent system that requires explicit approval for every screen capture session, with configurable timeouts, clear UI indicators, and cryptographic verification of consent.

---

## Background

OpenClaw uses device pairing with per-node execution approval. Friday needs a more granular consent model that:
- Requires user approval for each capture action
- Shows clear visual indicators when capturing is active
- Allows configurable approval timeouts
- Provides audit trail of all consent decisions

---

## Tasks

### 1. Design Consent Data Model

```typescript
// In /packages/core/src/body/consent.ts
export interface CaptureConsent {
  id: string;                    // UUID
  userId: string;                // Who is requesting
  sessionId: string;             // Associated session
  requestedAt: number;           // Timestamp
  expiresAt: number;             // Auto-expire timestamp
  grantedAt?: number;            // When approved
  grantedBy?: string;            // Who approved
  deniedAt?: number;             // When denied
  denialReason?: string;         // Why denied
  scope: CaptureScope;           // What can be captured
  status: 'pending' | 'granted' | 'denied' | 'expired' | 'revoked';
  signature?: string;            // Cryptographic signature
}

export interface CaptureScope {
  resource: 'screen' | 'camera' | 'microphone' | 'clipboard';
  target?: string;               // Specific window/app (optional)
  duration: number;              // Max seconds
  quality: 'low' | 'medium' | 'high';
  purpose: string;               // Why capture is needed
}
```

### 2. Implement Consent Manager

```typescript
// /packages/core/src/body/consent-manager.ts
export class ConsentManager {
  private pending = new Map<string, CaptureConsent>();
  private readonly defaultTimeout = 30000; // 30 seconds
  
  async requestConsent(
    userId: string,
    scope: CaptureScope,
    timeoutMs?: number
  ): Promise<CaptureConsent> {
    const consent: CaptureConsent = {
      id: crypto.randomUUID(),
      userId,
      sessionId: this.getCurrentSession(),
      requestedAt: Date.now(),
      expiresAt: Date.now() + (timeoutMs ?? this.defaultTimeout),
      scope,
      status: 'pending'
    };
    
    // Sign consent request for integrity
    consent.signature = await this.signConsent(consent);
    
    this.pending.set(consent.id, consent);
    
    // Trigger UI notification
    await this.notifyUser(consent);
    
    return consent;
  }
  
  async grantConsent(consentId: string, grantedBy: string): Promise<void> {
    const consent = this.pending.get(consentId);
    if (!consent || consent.status !== 'pending') {
      throw new Error('Consent not found or already processed');
    }
    
    if (Date.now() > consent.expiresAt) {
      consent.status = 'expired';
      throw new Error('Consent request expired');
    }
    
    consent.grantedAt = Date.now();
    consent.grantedBy = grantedBy;
    consent.status = 'granted';
    
    // Update signature
    consent.signature = await this.signConsent(consent);
    
    this.pending.delete(consentId);
    
    // Audit log
    await this.auditConsentDecision(consent);
  }
  
  async denyConsent(consentId: string, reason: string): Promise<void> {
    // Similar to grantConsent but with denied status
  }
  
  async revokeConsent(consentId: string): Promise<void> {
    // Allow revoking an active consent
  }
}
```

### 3. Create UI Components

```typescript
// Dashboard consent notification component
export function ConsentNotification({ consent }: { consent: CaptureConsent }) {
  return (
    <div className="consent-notification" role="alert">
      <h3>Screen Capture Request</h3>
      <p>User <strong>{consent.userId}</strong> requests to capture your screen</p>
      <ul>
        <li>Purpose: {consent.scope.purpose}</li>
        <li>Duration: {consent.scope.duration} seconds</li>
        <li>Quality: {consent.scope.quality}</li>
        <li>Expires in: <Countdown endTime={consent.expiresAt} /></li>
      </ul>
      <div className="consent-actions">
        <button onClick={() => grant(consent.id)} className="btn-primary">
          Allow
        </button>
        <button onClick={() => deny(consent.id)} className="btn-secondary">
          Deny
        </button>
      </div>
    </div>
  );
}

// Active capture indicator
export function CaptureIndicator({ consent }: { consent: CaptureConsent }) {
  return (
    <div className="capture-indicator" aria-live="polite">
      <span className="recording-dot" />
      Screen capture active ({consent.scope.purpose})
      <button onClick={() => revoke(consent.id)}>Stop</button>
    </div>
  );
}
```

### 4. Implement WebSocket Events

```typescript
// Server events
interface ConsentEvents {
  'consent:requested': CaptureConsent;
  'consent:granted': { consentId: string; grantedBy: string };
  'consent:denied': { consentId: string; reason: string };
  'consent:expired': { consentId: string };
  'consent:revoked': { consentId: string };
}

// Client handlers
socket.on('consent:requested', (consent) => {
  showNotification(consent);
  playAlertSound();
});
```

### 5. Add Cryptographic Signatures

```typescript
async function signConsent(consent: CaptureConsent): Promise<string> {
  const data = JSON.stringify({
    id: consent.id,
    userId: consent.userId,
    requestedAt: consent.requestedAt,
    scope: consent.scope
  });
  
  return await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(data)
  ).then(sig => Buffer.from(sig).toString('base64'));
}

async function verifyConsent(consent: CaptureConsent): Promise<boolean> {
  // Verify signature against public key
}
```

### 6. Configuration Options

```typescript
// In Friday config
export interface ConsentConfig {
  defaultTimeoutMs: number;      // 30000
  maxTimeoutMs: number;          // 300000 (5 min)
  requireExplicitGrant: boolean; // true
  autoDenyOnTimeout: boolean;    // true
  showPurpose: boolean;          // true
  allowRevoke: boolean;          // true
  visualIndicator: boolean;      // true
  audioAlert: boolean;           // true
}
```

---

## Deliverables

- [x] `/packages/core/src/body/consent.ts` — Consent types and interfaces
- [x] `/packages/core/src/body/consent-manager.ts` — Consent manager class
- [ ] `/apps/dashboard/src/components/ConsentNotification.tsx` — UI notification (deferred to UI phase)
- [ ] `/apps/dashboard/src/components/CaptureIndicator.tsx` — Active capture indicator (deferred to UI phase)
- [ ] WebSocket event handlers in server (deferred to integration phase)
- [x] Unit tests for consent flow (35 tests passing)
- [ ] Integration tests for timeout handling (partial - unit tests cover timeout)

---

## Security Considerations

1. **Non-repudiation** — Cryptographic signatures prevent tampering
2. **Timeout enforcement** — Auto-expire pending consents
3. **Revocation** — Users can revoke consent mid-capture
4. **Clear purpose** — Must display why capture is requested
5. **Visual indicator** — Always show when capture is active
6. **Audit trail** — Log all consent events with signatures

---

## Success Criteria

- [ ] Consent request displays within 500ms
- [ ] Auto-expires after configured timeout
- [ ] Visual indicator shown during active capture
- [ ] Cryptographic signatures verify integrity
- [ ] All consent events logged to audit trail
- [ ] Revocation stops capture immediately
- [ ] 100% test coverage of consent flow

