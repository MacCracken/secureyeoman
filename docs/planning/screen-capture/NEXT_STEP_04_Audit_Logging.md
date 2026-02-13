# NEXT_STEP: Audit Logging Integration

**Status:** Not Started  
**Priority:** Critical  
**Assigned:** TBD  
**Depends On:** NEXT_STEP_01 (RBAC), NEXT_STEP_02 (Consent)  
**Blocks:** NEXT_STEP_05 (Sandboxing)

---

**Related ADR:** [ADR 014: Screen Capture Security Architecture](../../adr/014-screen-capture-security-architecture.md)

---

## Objective

Integrate comprehensive audit logging for all screen capture activities, ensuring every request, approval, capture, and access is cryptographically logged with integrity verification.

---

## Background

Friday has an existing audit system. Screen capture requires enhanced audit capabilities:
- Log every capture request with full context
- Cryptographic chain of custody for captured data
- Tamper-evident audit trail
- Compliance reporting capabilities

---

## Tasks

### 1. Define Capture Audit Events

```typescript
// In /packages/core/src/audit/capture-events.ts
export interface CaptureAuditEvent {
  id: string;                    // UUID
  timestamp: number;             // Unix timestamp
  eventType: CaptureEventType;
  sessionId: string;
  userId: string;
  roleId: string;
  consentId: string;
  scope: CaptureScope;           // What was requested
  result: CaptureResult;         // Success/failure
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
  };
  hash: string;                  // SHA-256 of event data
  previousHash: string;          // For chain integrity
  signature: string;             // Cryptographic signature
}

export type CaptureEventType =
  | 'capture.requested'          // User requests capture
  | 'capture.approved'           // Consent granted
  | 'capture.denied'             // Consent denied
  | 'capture.started'            // Capture begins
  | 'capture.completed'          // Capture successful
  | 'capture.failed'             // Capture error
  | 'capture.stopped'            // User stopped early
  | 'capture.expired'            // Time limit reached
  | 'capture.accessed'           // Someone viewed the capture
  | 'capture.deleted'            // Capture deleted
  | 'capture.exported'           // Data exported
  | 'consent.revoked';           // Active consent revoked
```

### 2. Extend Audit Logger

```typescript
// /packages/core/src/audit/capture-logger.ts
export class CaptureAuditLogger {
  private baseLogger: AuditLogger;
  private chain: AuditChain;
  
  async logCaptureEvent(event: Omit<CaptureAuditEvent, 'id' | 'timestamp' | 'hash' | 'previousHash' | 'signature'>): Promise<CaptureAuditEvent> {
    const fullEvent: CaptureAuditEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...event,
      previousHash: await this.chain.getLastHash(),
      hash: '',      // Computed below
      signature: ''  // Computed below
    };
    
    // Compute hash of event data
    fullEvent.hash = await this.computeHash(fullEvent);
    
    // Sign the hash
    fullEvent.signature = await this.signEvent(fullEvent);
    
    // Add to chain
    await this.chain.append(fullEvent);
    
    // Persist to storage
    await this.persistEvent(fullEvent);
    
    // Real-time alerts for security team
    if (this.isHighRiskEvent(fullEvent)) {
      await this.alertSecurityTeam(fullEvent);
    }
    
    return fullEvent;
  }
  
  private async computeHash(event: CaptureAuditEvent): Promise<string> {
    const data = JSON.stringify({
      timestamp: event.timestamp,
      eventType: event.eventType,
      userId: event.userId,
      consentId: event.consentId,
      scope: event.scope,
      result: event.result,
      previousHash: event.previousHash
    });
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Buffer.from(hashBuffer).toString('hex');
  }
  
  private isHighRiskEvent(event: CaptureAuditEvent): boolean {
    // Alert on:
    // - Failed captures (possible attack)
    // - Large scope requests
    // - Multiple rapid requests
    // - Access by non-owner
    if (event.eventType === 'capture.failed') return true;
    if (event.scope?.duration?.maxSeconds > 300) return true;
    
    // Check rate (would need tracking)
    return false;
  }
}
```

### 3. Implement Audit Chain Integrity

```typescript
// /packages/core/src/audit/chain.ts
export class AuditChain {
  private db: Database;
  private lastHash: string;
  
  constructor(db: Database) {
    this.db = db;
    this.lastHash = '0'.repeat(64); // Genesis hash
  }
  
  async append(event: CaptureAuditEvent): Promise<void> {
    await this.db.run(
      `INSERT INTO audit_chain (
        event_id, timestamp, event_type, hash, previous_hash, signature
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [event.id, event.timestamp, event.eventType, event.hash, event.previousHash, event.signature]
    );
    
    this.lastHash = event.hash;
  }
  
  async getLastHash(): Promise<string> {
    return this.lastHash;
  }
  
  async verifyChain(): Promise<ChainVerificationResult> {
    const events = await this.db.all(
      'SELECT * FROM audit_chain ORDER BY timestamp ASC'
    );
    
    let previousHash = '0'.repeat(64);
    const errors: string[] = [];
    
    for (const event of events) {
      // Verify previous hash links correctly
      if (event.previous_hash !== previousHash) {
        errors.push(`Chain broken at ${event.event_id}: expected ${previousHash}, got ${event.previous_hash}`);
      }
      
      // Verify signature
      const isValid = await this.verifySignature(event);
      if (!isValid) {
        errors.push(`Invalid signature at ${event.event_id}`);
      }
      
      previousHash = event.hash;
    }
    
    return {
      valid: errors.length === 0,
      totalEvents: events.length,
      errors
    };
  }
}
```

### 4. Add Data Provenance Tracking

```typescript
// Track every access to captured data
export interface DataProvenance {
  captureId: string;
  createdAt: number;
  createdBy: string;
  consentId: string;
  scope: CaptureScope;
  
  // Chain of custody
  custodyChain: Array<{
    timestamp: number;
    action: 'created' | 'viewed' | 'copied' | 'exported' | 'deleted';
    actor: string;
    location?: string;
  }>;
  
  // Integrity verification
  contentHash: string;
  verifyIntegrity(): Promise<boolean>;
}

export async function trackDataAccess(
  captureId: string,
  action: 'viewed' | 'copied' | 'exported',
  actor: string
): Promise<void> {
  await auditLogger.logCaptureEvent({
    eventType: 'capture.accessed',
    userId: actor,
    consentId: captureId,
    result: { success: true, action },
    // ... other fields
  });
  
  // Update provenance record
  await provenanceStore.append(captureId, {
    timestamp: Date.now(),
    action,
    actor
  });
}
```

### 5. Create Compliance Reports

```typescript
// /packages/core/src/audit/compliance.ts
export class ComplianceReporter {
  async generateCaptureReport(options: ReportOptions): Promise<ComplianceReport> {
    const events = await this.fetchEvents(options);
    
    return {
      period: { start: options.startDate, end: options.endDate },
      summary: {
        totalRequests: events.filter(e => e.eventType === 'capture.requested').length,
        totalApproved: events.filter(e => e.eventType === 'capture.approved').length,
        totalDenied: events.filter(e => e.eventType === 'capture.denied').length,
        totalCompleted: events.filter(e => e.eventType === 'capture.completed').length,
        totalFailed: events.filter(e => e.eventType === 'capture.failed').length
      },
      byUser: this.aggregateByUser(events),
      byResource: this.aggregateByResource(events),
      chainIntegrity: await this.auditChain.verifyChain(),
      anomalies: this.detectAnomalies(events)
    };
  }
  
  private detectAnomalies(events: CaptureAuditEvent[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    
    // Detect unusual patterns
    const byUser = this.groupByUser(events);
    for (const [userId, userEvents] of Object.entries(byUser)) {
      // High frequency requests
      const requestRate = this.calculateRequestRate(userEvents);
      if (requestRate > 10) { // > 10 per hour
        anomalies.push({
          type: 'high_frequency',
          userId,
          severity: 'warning',
          details: `${requestRate} capture requests per hour`
        });
      }
      
      // After-hours access
      const afterHours = userEvents.filter(e => this.isAfterHours(e.timestamp));
      if (afterHours.length > 0) {
        anomalies.push({
          type: 'after_hours',
          userId,
          severity: 'info',
          details: `${afterHours.length} captures outside business hours`
        });
      }
    }
    
    return anomalies;
  }
}
```

### 6. Build Audit Dashboard

```typescript
// Dashboard audit viewer
export function AuditDashboard() {
  const [events, setEvents] = useState<CaptureAuditEvent[]>([]);
  const [filters, setFilters] = useState<AuditFilters>({});
  
  useEffect(() => {
    fetchAuditEvents(filters).then(setEvents);
  }, [filters]);
  
  return (
    <div className="audit-dashboard">
      <h2>Capture Audit Trail</h2>
      
      <div className="filters">
        <input type="date" onChange={e => setFilters({...filters, startDate: e.target.value})} />
        <select onChange={e => setFilters({...filters, eventType: e.target.value})}>
          <option value="">All Events</option>
          <option value="capture.requested">Requested</option>
          <option value="capture.approved">Approved</option>
          <option value="capture.completed">Completed</option>
          <option value="capture.failed">Failed</option>
        </select>
      </div>
      
      <table className="audit-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>User</th>
            <th>Resource</th>
            <th>Status</th>
            <th>Hash</th>
          </tr>
        </thead>
        <tbody>
          {events.map(event => (
            <tr key={event.id} className={event.eventType}>
              <td>{formatTimestamp(event.timestamp)}</td>
              <td>{event.eventType}</td>
              <td>{event.userId}</td>
              <td>{event.scope?.resource}</td>
              <td>{event.result.success ? '✓' : '✗'}</td>
              <td><code>{event.hash.slice(0, 16)}...</code></td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <div className="integrity-check">
        <button onClick={() => verifyChain()}>Verify Chain Integrity</button>
      </div>
    </div>
  );
}
```

---

## Deliverables

- [ ] `/packages/core/src/audit/capture-events.ts` — Event type definitions
- [ ] `/packages/core/src/audit/capture-logger.ts` — Capture audit logger
- [ ] `/packages/core/src/audit/chain.ts` — Blockchain-style integrity chain
- [ ] `/packages/core/src/audit/compliance.ts` — Compliance reporting
- [ ] `/apps/dashboard/src/components/AuditDashboard.tsx` — Audit UI
- [ ] Database migrations for audit tables
- [ ] Unit tests for chain integrity
- [ ] Integration tests for compliance reports

---

## Security Considerations

1. **Tamper evidence** — Cryptographic chain makes tampering detectable
2. **Non-repudiation** — Signatures prevent denial of actions
3. **Retention policy** — Auto-archive after retention period
4. **Access control** — Only auditors can view audit logs
5. **Real-time alerts** — Immediate notification of suspicious activity
6. **Compliance** — Meet GDPR, SOC2, HIPAA requirements

---

## Success Criteria

- [ ] Every capture event logged with full context
- [ ] Chain integrity verifiable
- [ ] Signatures validate correctly
- [ ] Compliance reports generate accurately
- [ ] Anomaly detection identifies suspicious patterns
- [ ] Dashboard displays audit trail
- [ ] Retention policy enforced
- [ ] 100% test coverage of audit logic

