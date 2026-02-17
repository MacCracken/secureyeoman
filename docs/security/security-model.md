# Security Model

> Comprehensive security architecture and threat model for F.R.I.D.A.Y.

## Table of Contents

1. [Security Philosophy](#security-philosophy)
2. [Threat Model](#threat-model)
3. [Security Architecture](#security-architecture)
4. [Defense in Depth](#defense-in-depth)
5. [Security Controls](#security-controls)
6. [Audit and Compliance](#audit-and-compliance)
7. [Incident Response](#incident-response)

---

## Security Philosophy

F.R.I.D.A.Y. follows these security principles:

### 1. Security First
- Security is not an afterthought—it's a core design principle
- Every feature is evaluated for security implications
- Security features are enabled by default, not opt-in

### 2. Defense in Depth
- Multiple security layers prevent single points of failure
- If one control fails, others provide backup protection
- Security controls are redundant where critical

### 3. Least Privilege
- Users and processes get only minimum required permissions
- Privileges are granted temporarily and revoked when not needed
- Access is regularly reviewed and audited

### 4. Fail Secure
- On error or uncertainty, default to the most restrictive state
- Security controls fail closed, not open
- Emergency procedures maintain security posture

### 5. Transparency and Verification
- All security-relevant actions are logged and auditable
- Cryptographic verification ensures log integrity
- Security policies are documented and reviewable

---

## Threat Model

### Threat Actors

| Actor | Capability | Motivation | Impact |
|-------|------------|------------|--------|
| **External Attackers** | High | Data theft, disruption | High |
| **Insider Threats** | Medium | Sabotage, data access | High |
| **Malicious AI Input** | High | Jailbreak, injection | Medium |
| **Supply Chain** | High | Backdoor, compromise | Critical |

### Attack Vectors

#### 1. Authentication & Authorization
- JWT token theft or manipulation
- API key leakage
- RBAC bypass attempts
- Privilege escalation

#### 2. Input Validation
- Prompt injection attacks
- Code injection via input
- Command injection in sandbox
- File system path traversal

#### 3. Data Protection
- Encryption key extraction
- Sensitive data exposure in logs
- Memory scraping attacks
- Database compromise

#### 4. Network Security
- Man-in-the-middle attacks
- DNS poisoning
- API endpoint abuse
- WebSocket hijacking

#### 5. System Integrity
- Sandbox escape attempts
- Audit log tampering
- Configuration modification
- Supply chain attacks

#### 6. Web Tools (Scraping & Search)
- **SSRF (Server-Side Request Forgery)**: Blocked IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x), blocked hostnames (localhost, metadata.google.internal), `file://` protocol blocked, only `http:`/`https:` allowed
- **URL Allowlist**: When `MCP_ALLOWED_URLS` is set, only requests to listed domains (and subdomains) are permitted
- **Redirect Attacks**: Max 3 redirect hops, each hop re-validated against SSRF rules
- **Output Safety**: 500KB output cap per tool call with truncation marker to prevent memory exhaustion
- **Rate Limiting**: Web-specific rate limiter (default 10 req/min) independent of per-tool rate limiter
- **Cloud Metadata**: `169.254.169.254` and related cloud metadata endpoints explicitly blocked

#### 7. Browser Automation (Deferred)
- Browser tools are registered as placeholders; they return "not yet available" until Playwright/Puppeteer is integrated
- When implemented: max concurrent pages, navigation timeout, headless enforcement, JavaScript execution isolation

#### 8. MCP Credential Management
- **Encryption at Rest**: AES-256-GCM with key derived from `SECUREYEOMAN_TOKEN_SECRET` via SHA-256 + salt
- **No Value Exposure**: API only returns credential keys, never decrypted values
- **Injection Isolation**: Decrypted credentials injected only into server spawn environment, not logged
- **Tamper Detection**: GCM authentication tag validates ciphertext integrity on decrypt

#### 9. MCP Health Monitoring
- **Auto-Disable**: Servers auto-disabled after configurable consecutive failures (default 5) to prevent repeated connection attempts to compromised endpoints
- **Timeout Enforcement**: Health check HTTP requests timeout after 10 seconds

---

## Security Architecture

### Security Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Network Layer                        │
│  TLS 1.3 │ Domain Whitelist │ Rate Limit │ IP Filtering│
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────┐
│                  Application Layer                      │
│ RBAC │ JWT Auth │ Input Validation │ API Security     │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────┐
│                   Execution Layer                       │
│ Sandbox │ Encryption │ Audit Chain │ Resource Limits   │
└─────────────────────────────────────────────────────────┘
```

### Core Security Components

#### 1. Authentication System
```typescript
interface AuthenticationSystem {
  jwt: {
    signingKey: string;
    tokenRotation: boolean;
    refreshTokens: boolean;
    blacklist: Set<string>;
  };
  apiKeys: {
    keyGeneration: () => string;
    rateLimiting: boolean;
    revocation: boolean;
  };
  rbac: {
    roles: Role[];
    permissions: Permission[];
    inheritance: boolean;
  };
}
```

#### 2. Encryption Framework
```typescript
interface EncryptionFramework {
  atRest: {
    algorithm: "AES-256-GCM";
    keyDerivation: "scrypt";
    keyRotation: boolean;
  };
  inTransit: {
    protocol: "TLS 1.3";
    certificateValidation: "strict";
    cipherSuites: string[];
  };
  keyManagement: {
    storage: "system_keyring";
    rotation: boolean;
    backup: boolean;
  };
}
```

#### 3. Audit System
```typescript
interface AuditSystem {
  logging: {
    structured: boolean;
    correlationIds: boolean;
    cryptographic: boolean;
  };
  storage: {
    appendOnly: boolean;
    tamperDetection: boolean;
    backup: boolean;
  };
  integrity: {
    chainVerification: boolean;
    hashAlgorithm: "SHA-256";
    hmacKey: string;
  };
}
```

---

## Defense in Depth

### Layer 1: Network Security

#### TLS Configuration
```yaml
transport_security:
  protocol: TLS 1.3
  cipher_suites:
    - TLS_AES_256_GCM_SHA384
    - TLS_CHACHA20_POLY1305_SHA256
  certificate_validation: strict
  certificate_pinning: optional
```

#### Domain Whitelisting
```yaml
network_security:
  allowlist:
    enabled: true
    domains:
      - api.anthropic.com
      - api.openai.com
      - "*.githubusercontent.com"
  
  denylist:
    enabled: true
    sources:
      - config/blocked_domains.txt
      - https://malware-domains.txt
```

#### Rate Limiting
```yaml
rate_limiting:
  rules:
    - name: api_requests
      window: 60s
      max_requests: 100
      key: ip_address
    
    - name: authentication
      window: 900s
      max_requests: 5
      key: ip_address
      on_exceed: block_30m
```

#### HTTP Security Headers

The gateway sets the following headers on every response automatically:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking via iframes |
| `X-XSS-Protection` | `0` | Disables legacy XSS auditor (CSP supersedes) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage to third parties |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables unnecessary browser APIs |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | HSTS — only when TLS is enabled |

These headers are unconditional and not configurable. There is no legitimate reason to disable them on an API server.

#### CORS Policy

CORS is enforced with the following rules:
- **Wildcard origins** (`*`): `Access-Control-Allow-Origin: *` is set, but `Access-Control-Allow-Credentials` is **never** set (per the Fetch spec, browsers reject credentialed requests with wildcard origins)
- **Explicit origins**: The request origin is reflected back with `Access-Control-Allow-Credentials: true` and `Vary: Origin`
- **Unlisted origins**: No CORS headers are set — the browser blocks the request

#### WebSocket Channel Authorization

WebSocket connections are authenticated via JWT token in the query string. The token is validated before the connection is accepted. The user's role is then used to enforce RBAC on channel subscriptions:

| Channel | RBAC Resource | RBAC Action |
|---------|--------------|-------------|
| `metrics` | `metrics` | `read` |
| `tasks` | `tasks` | `read` |
| `audit` | `audit` | `read` |
| `security` | `security_events` | `read` |

Unauthorized channels are silently skipped during subscription. A 30-second ping/pong heartbeat terminates unresponsive connections after 60 seconds.

### Layer 1.5: XSS Protection (DOMPurify)

The dashboard sanitizes all AI-generated and user-generated content before rendering using [DOMPurify](https://github.com/cure53/DOMPurify). Two sanitization modes are available:

- **`sanitizeHtml(dirty)`**: Allows safe formatting tags (`b`, `i`, `em`, `strong`, `a`, `p`, `br`, `ul`, `ol`, `li`, `code`, `pre`, `blockquote`, `h1`–`h4`) while stripping all script tags, event handlers, and dangerous attributes. Used for rendering rich content safely.
- **`sanitizeText(dirty)`**: Strips ALL HTML tags. Used as defense-in-depth for text content that should never contain HTML (chat messages, notification text, task descriptions, error messages).

Applied to all dashboard components that display dynamic content: ChatPage, SecurityEvents, PersonalityEditor, SkillsPage, CodePage, NotificationBell, TaskHistory, ConnectionsPage.

A `<SafeHtml>` React component wraps `sanitizeHtml` for use with `dangerouslySetInnerHTML`.

### Layer 2: Application Security

#### Input Validation Pipeline
```typescript
const validationPipeline = {
  sizeCheck: { maxLength: 100000, action: "reject" },
  encodingNormalization: { targetEncoding: "UTF-8" },
  injectionDetection: {
    patterns: [/{{.*system.*}}/i, /<script.*?>.*?<\/script>/i],
    action: "sanitize_and_log"
  },
  contentPolicy: { blocklist: "config/blocked_words.txt" }
};
```

#### RBAC Enforcement
```typescript
const rbacSystem = {
  roles: {
    admin: { permissions: ["*"] },
    operator: { permissions: ["tasks.*", "metrics.read", "capture.screen"] },
    auditor: { permissions: ["audit.*", "metrics.read", "capture.review"] },
    viewer: { permissions: ["metrics.read", "tasks.read"] },
    capture_operator: { permissions: ["capture.screen", "capture.camera"] },
    security_auditor: { permissions: ["capture.review", "audit.*"] }
  },
  middleware: "enforce_permissions_on_all_routes",
  management: {
    // Full CRUD via REST API: GET/POST/PUT/DELETE /api/v1/auth/roles
    // User assignment: GET/POST /api/v1/auth/assignments, DELETE /api/v1/auth/assignments/:userId
    // Built-in roles (role_admin, role_operator, etc.) are immutable
    // Custom roles can be created, updated, and deleted via Dashboard or CLI
    customRoles: true,
    roleAssignments: true,
    cli: "secureyeoman role [list|create|delete|assign|revoke|assignments]"
  }
};
```

### Layer 3: Execution Security

#### Sandboxing
```yaml
sandbox:
  linux:
    # V1: Soft sandbox with path validation and resource tracking
    # V2: Landlock kernel-level enforcement via forked worker process
    landlock: { enabled: true, filesystem_rules: "restrictive" }
    namespaces: ["user", "pid", "network", "mount"]

  darwin:
    # macOS sandbox-exec with deny-default .sb profile
    sandbox_exec: { enabled: true }

  resource_limits:
    memory: { soft: "512MB", hard: "1GB" }
    cpu: { max_percent: 50 }
    disk: { max_write_per_task: "100MB" }
    time: { task_timeout: "300s" }
```

#### Encryption at Rest
```typescript
const encryptionConfig = {
  algorithm: "AES-256-GCM",
  keyDerivation: {
    algorithm: "scrypt",
    params: { N: 16384, r: 8, p: 1 }
  },
  protectedResources: [
    "secrets/*",
    "config/credentials.json",
    "logs/audit/*"
  ]
};
```

---

## Security Controls

### 1. Authentication Controls

| Control | Implementation | Risk Mitigated |
|---------|----------------|----------------|
| **JWT with Rotation** | Short-lived access tokens + refresh tokens | Token theft, replay attacks |
| **API Key Management** | Secure generation, rate limiting, revocation | API abuse, credential leakage |
| **mTLS Client Certs** | Client certificate CN extraction, CA validation | Zero-trust environments, machine-to-machine auth |
| **Multi-Factor Auth** | Optional 2FA for admin operations | Credential compromise |
| **Session Management** | Secure cookies, timeout handling | Session hijacking |

### 2. Authorization Controls

| Control | Implementation | Risk Mitigated |
|---------|----------------|----------------|
| **RBAC** | Role-based permissions with inheritance | Privilege escalation |
| **Resource Scoping** | Permissions tied to specific resources | Unauthorized access |
| **Permission Caching** | LRU cache with invalidation | Performance vs security balance |
| **Audit Logging** | All access attempts logged | Accountability |

### 2.1 Capture Permissions

Screen capture is a high-risk operation requiring specialized permissions:

#### Capture Resources
```typescript
type CaptureResource =
  | 'capture.screen'      // Screen recording/capture
  | 'capture.camera'      // Camera/microphone access
  | 'capture.clipboard'   // Clipboard access
  | 'capture.keystrokes'; // Keystroke logging (highly restricted)
```

#### Capture Actions
```typescript
type CaptureAction =
  | 'capture'     // Initiate capture
  | 'stream'      // Stream live feed
  | 'configure'   // Change capture settings
  | 'review';     // Review captured data
```

#### Permission Conditions
Capture permissions support conditional enforcement:

```typescript
// Operator: Can capture screen for up to 5 minutes
{
  resource: 'capture.screen',
  actions: ['capture', 'configure', 'review'],
  conditions: [{ field: 'duration', operator: 'lte', value: 300 }]
}

// Capture Operator: Extended limits (30 minutes)
{
  resource: 'capture.screen',
  actions: ['capture', 'stream', 'configure', 'review'],
  conditions: [{ field: 'duration', operator: 'lte', value: 1800 }]
}
```

#### Security Principles for Capture
1. **Deny by Default** - No capture without explicit permission
2. **Time Limits** - All capture permissions have duration limits
3. **Role Isolation** - Viewer role has no capture access
4. **Condition Enforcement** - Duration, purpose, and scope conditions are strictly evaluated
5. **Audit Trail** - Every permission check is logged

### 3. Input Validation Controls

| Control | Implementation | Risk Mitigated |
|---------|----------------|----------------|
| **Size Limits** | Max input size validation | DoS attacks, memory exhaustion |
| **Encoding Checks** | Unicode normalization | Encoding bypass attacks |
| **Injection Detection** | Pattern matching for malicious input | Code injection, XSS |
| **Content Policy** | Blocked word/prohibited content filtering | Inappropriate content |

### 4. Execution Controls

| Control | Implementation | Risk Mitigated |
|---------|----------------|----------------|
| **Sandboxing** | Isolated execution environment | System compromise |
| **Resource Limits** | Memory, CPU, disk, time limits | Resource exhaustion |
| **Filesystem Restrictions** | Path whitelisting, traversal prevention | File system access |
| **Network Restrictions** | Egress filtering, domain whitelisting | Data exfiltration |

### 5. Data Protection Controls

| Control | Implementation | Risk Mitigated |
|---------|----------------|----------------|
| **Encryption at Rest** | AES-256-GCM with scrypt KDF | Data theft |
| **Encryption in Transit** | TLS 1.3 with strict validation | Man-in-the-middle attacks |
| **Key Management** | System keyring, rotation policies | Key compromise |
| **Secret Redaction** | Automatic log sanitization | Credential leakage |

---

## Audit and Compliance

### Audit Trail Design

#### Cryptographic Chain
```typescript
interface AuditEntry {
  id: string;                    // UUID v7 (time-sortable)
  timestamp: number;              // Unix timestamp
  event: string;                 // Event type
  message: string;               // Human-readable message
  details: Record<string, any>;   // Structured data
  userId?: string;               // User who performed action
  ipAddress?: string;             // Source IP
  userAgent?: string;            // Client identifier
  
  // Integrity verification
  previousHash: string;          // Previous entry hash
  currentHash: string;           // This entry hash
  signature: string;             // HMAC-SHA256 signature
}
```

#### Verification Process
```typescript
class AuditChain {
  verify(): VerificationResult {
    let expectedPrevHash = "GENESIS";
    
    for (const entry of this.storage.iterate()) {
      const computedHash = this.computeHash(entry);
      const expectedSignature = this.computeSignature(computedHash, expectedPrevHash);
      
      if (entry.signature !== expectedSignature) {
        return { valid: false, brokenAt: entry.id };
      }
      
      expectedPrevHash = computedHash;
    }
    
    return { valid: true };
  }
}
```

### Compliance Considerations

| Standard | Relevance | Implementation |
|-----------|------------|----------------|
| **SOC 2** | High | Audit logging, access controls, security monitoring |
| **GDPR** | Medium | Data retention, right to deletion, encryption |
| **HIPAA** | Low (unless healthcare) | Audit trails, encryption, access controls |
| **PCI DSS** | Low (unless payments) | Not typically applicable |

### Data Retention

```yaml
retention_policy:
  audit_logs: 7 years    # For compliance
  task_logs: 1 year      # Operational needs
  metrics: 90 days       # Performance data
  security_events: 3 years # Incident investigation
```

---

## Incident Response

### Incident Classification

| Severity | Response Time | Escalation |
|----------|---------------|------------|
| **Critical** | 5 minutes | Immediate admin notification |
| **High** | 30 minutes | Security team notification |
| **Medium** | 4 hours | Shift lead notification |
| **Low** | 24 hours | Documentation only |

### Incident Types

#### Security Incidents
1. **Authentication Breach**
   - Unauthorized access detected
   - Immediate account lockout
   - Password reset for affected users
   - Investigation of access patterns

2. **Sandbox Escape**
   - Detected resource limit violation
   - Immediate task termination
   - System isolation and forensics
   - Security patch deployment

3. **Data Exposure**
   - Sensitive data in logs or responses
   - Immediate log redaction
   - Key rotation if necessary
   - Impact assessment

4. **Audit Chain Compromise**
   - Chain verification failure
   - Immediate system halt
   - Forensic snapshot creation
   - Chain reconstruction

### Response Procedures

#### Immediate Response (0-5 minutes)
```typescript
const immediateResponse = {
  contain: "Isolate affected systems",
  assess: "Determine impact scope",
  notify: "Alert security team and admins",
  document: "Create initial incident report"
};
```

#### Investigation (5-30 minutes)
```typescript
const investigation = {
  preserve: "Collect forensic evidence",
  analyze: "Review logs and audit trails",
  identify: "Determine root cause",
  assess: "Evaluate data and system impact"
};
```

#### Recovery (30 minutes - 4 hours)
```typescript
const recovery = {
  remediate: "Patch vulnerabilities",
  restore: "Recover from backups if needed",
  verify: "Confirm system integrity",
  monitor: "Enhanced monitoring post-incident"
};
```

#### Post-Incident (4 hours+)
```typescript
const postIncident = {
  review: "Analyze response effectiveness",
  improve: "Update procedures and controls",
  train: "Educate team on lessons learned",
  report: "Document for compliance and improvement"
};
```

---

## Code Execution Sandboxing

### Runtime Isolation

When code execution is enabled (`security.codeExecution.enabled: true`), all user/AI-generated code runs within the existing sandbox infrastructure:

- **Linux**: Landlock filesystem restrictions + seccomp-bpf syscall filtering
- **macOS**: `sandbox-exec` with deny-default policy
- **Resource limits**: Memory, CPU, file size, and execution time limits from `security.sandbox` config apply to all code execution

Each runtime (Python, Node.js, shell) runs in an isolated child process with no access to the parent process memory space.

### Secrets Filtering

All code execution output passes through a streaming-aware secrets filter before reaching the dashboard, WebSocket, or logs:

- Buffers output in 256-byte windows to detect partial secret matches
- Masks matches with `***` using the same patterns as log redaction
- Detects API keys, tokens, passwords, and connection strings from `security.inputValidation` patterns plus any secrets in the SecretManager
- Filter runs synchronously in the output pipeline -- no unfiltered output ever reaches external consumers

### Approval Policies

Code execution uses a two-level opt-in model:

| Configuration | Behavior |
|---------------|----------|
| `enabled: false` (default) | Code execution tool is not registered. Agent cannot generate or run code. |
| `enabled: true, autoApprove: false` | Agent can propose code but every execution requires user approval via dashboard prompt. |
| `enabled: true, autoApprove: true` | Executions proceed without prompting. For trusted/automated environments only. |

"Approve & Trust Session" allows auto-approval within a single session (same conversation, same runtime) after initial manual approval.

Every code execution is recorded in the cryptographic audit chain with input code, output summary, exit code, duration, and approval metadata.

---

## Security Policy Dashboard

The security dashboard (Settings > Security) provides toggles to enable or disable high-risk system capabilities:

| Toggle | Config Field | Default | Description |
|--------|--------------|---------|-------------|
| **Sub-Agent Delegation** | `allowSubAgents` | `true` | Enable/disable the entire sub-agent delegation system |
| **A2A Networks** | `allowA2A` | `false` | Allow agent-to-agent networking (nested under Sub-Agent Delegation) |
| **Lifecycle Extensions** | `allowExtensions` | `false` | Allow lifecycle extension hooks for custom logic injection |
| **Sandbox Execution** | `allowExecution` | `true` | Allow sandboxed code execution (Python, Node.js, shell) |

All toggles are managed via the Security Policy API (`GET/PATCH /api/v1/security/policy`) and stored in the security configuration (`packages/shared/src/types/config.ts`). Changes take effect immediately without restart.

**Note**: A2A networking requires sub-agent delegation to be enabled (nested dependency).

---

## A2A Trust Model

### Trust Progression

A2A peers progress through trust levels based on verification and interaction history:

| Level | Description | Capabilities |
|-------|-------------|-------------|
| **Untrusted** | Newly discovered peer, no verification | Cannot delegate tasks. Can only exchange capability queries. |
| **Verified** | Public key verified, signed capability exchange completed | Can delegate tasks with per-execution token budget limits. Subject to rate limiting. |
| **Trusted** | Manually promoted by admin or after sustained successful interaction | Full delegation capabilities. Higher token budget limits. Reduced rate limiting. |

### E2E Encryption

All A2A messages use the existing comms crypto layer:

- **Key exchange**: X25519 ephemeral key agreement per message
- **Signing**: Ed25519 signatures on all messages for authentication and non-repudiation
- **Encryption**: AES-256-GCM with per-message nonces
- **Capability assertions**: Peers include signed capability responses to prevent mDNS/DNS-SD spoofing

### Authorization Controls

- Providers can configure allowlists/denylists for which peers may delegate
- Token budgets are enforced independently by both requester and provider
- Per-peer rate limits prevent resource exhaustion from external delegation requests
- Results include a cryptographic proof (signed hash of sealed conversation)
- All A2A delegation activity is recorded in the audit chain

---

## Security Best Practices

### For Users

1. **Use Strong Authentication**
   - Complex passwords
   - Enable 2FA when available
   - Regular password rotation

2. **Practice Good Security Hygiene**
   - Regular security log review
   - Keep software updated
   - Follow principle of least privilege

3. **Monitor System Activity**
   - Review audit logs regularly
   - Set up security alerts
   - Investigate unusual activity

### For Developers

1. **Secure Development Practices**
   - Input validation and sanitization
   - Error handling without information leakage
   - Secure dependency management

2. **Code Security**
   - Regular security reviews
   - Static and dynamic analysis
   - Security testing in CI/CD

3. **Documentation**
   - Security considerations documented
   - Threat models reviewed
   - Incident procedures updated

---

## Related Documentation

- [API Security](../api/rest-api.md#authentication)
- [Architecture Overview](../development/architecture.md)
- [Configuration Reference](../configuration.md)

---

*This security model is continuously updated as new threats emerge and security controls evolve.*