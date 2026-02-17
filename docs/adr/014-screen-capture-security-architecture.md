# ADR 014: Screen Capture Security Architecture

## Status

Proposed

## Context

SecureYeoman requires screen capture capabilities to support visual assistance, debugging, and automation use cases. However, screen capture is a high-risk operation that could expose sensitive information, violate user privacy, or be exploited by malicious actors if not properly secured.

OpenClaw demonstrates one approach to screen capture: companion devices connect via WebSocket and can execute `screen.record` commands with pairing-based approval. While effective, this model lacks:
- Fine-grained access control beyond device pairing
- Cryptographic audit trails
- Sandboxed execution isolation
- Platform-native permission integration

Friday's security-first architecture requires a more comprehensive approach.

## Decision

Implement screen capture through a **multi-layer security model** with six integrated components:

### 1. RBAC Permission Layer
- Define granular permissions: `capture.screen`, `capture.camera`, `capture.microphone`
- Support action-level control: `capture`, `stream`, `configure`, `review`
- Role-based conditions (e.g., max duration limits per role)
- Deny-by-default policy

### 2. User Consent Layer
- Explicit user approval required for every capture session
- Configurable approval timeout (default: 30 seconds)
- Real-time visual indicator during active capture
- Cryptographic signatures on consent decisions for non-repudiation
- Support for consent revocation mid-capture

### 3. Scope Limiting Controls
- Target selection: full screen, specific window, application, or region
- Duration enforcement with automatic termination
- Quality settings to balance privacy vs utility
- Content filters: blur regions, regex redaction, watermarking
- Single-use and read-only restrictions

### 4. Audit Logging
- Blockchain-style integrity chain for all capture events
- Cryptographic signatures on every event
- Comprehensive event types: request, approval, denial, start, complete, fail, access, delete
- Real-time anomaly detection (high frequency, after-hours, etc.)
- Compliance reporting for GDPR, SOC2, HIPAA

### 5. Sandboxed Execution
- Isolated namespaces and process isolation
- Seccomp/seccomp-bpf syscall filtering
- Landlock filesystem restrictions (Linux)
- Seatbelt profiles (macOS)
- Resource limits: memory, CPU, file descriptors, process count
- No network access from capture process
- Encrypted IPC between main process and capture sandbox

### 6. Platform Permission Integration
- macOS: TCC (Transparency, Consent, Control) framework
- Windows: UWP permissions and Desktop Duplication API
- Linux: XDG Desktop Portals for Wayland/X11
- Graceful handling of permission revocation
- Enterprise MDM policy support

### Security Flow

```
User Request
    ↓
RBAC Check (deny-by-default)
    ↓
Platform Permission Check (TCC/UWP/Portal)
    ↓
User Consent Prompt (with signature)
    ↓
Scope Validation (duration, target, quality)
    ↓
Audit Log Entry (request + context)
    ↓
Sandbox Initialization (namespace, seccomp, Landlock)
    ↓
Capture Execution (in isolated process)
    ↓
Result Sanitization (filters, watermark)
    ↓
Audit Log Entry (completion + result hash)
    ↓
Encrypted Return
```

## Consequences

- **High implementation complexity**: Six integrated layers require significant development effort
- **Performance overhead**: Sandboxing and encryption add latency to capture operations
- **User friction**: Multiple approval steps may frustrate power users
- **Platform dependencies**: TCC, UWP, and Portal APIs require platform-specific code
- **Audit storage**: Cryptographic chain requires persistent storage and careful key management
- **Compliance ready**: Architecture supports GDPR right to erasure, SOC2 audit requirements, HIPAA access controls
- **Security audit required**: All capture code must undergo security review before production
- **Documentation burden**: Complex security model requires comprehensive admin and user documentation

### Positive

- Industry-leading security for a high-risk feature
- Tamper-evident audit trail
- Defense in depth (multiple security layers)
- Platform-native compliance
- Enterprise-ready with MDM support

### Negative

- Longer time-to-market for capture features
- Higher maintenance burden for six integrated systems
- Potential for security vs usability conflicts
- Requires security expertise to implement correctly

## References

- OpenClaw screen capture: https://docs.openclaw.ai/nodes
- macOS TCC: https://developer.apple.com/documentation/tcc
- Windows Graphics Capture: https://docs.microsoft.com/en-us/windows/uwp/audio-video-camera/screen-capture
- XDG Desktop Portal: https://flatpak.github.io/xdg-desktop-portal/
- `/docs/planning/screen-capture/IMPLEMENTATION_PLAN.md`
