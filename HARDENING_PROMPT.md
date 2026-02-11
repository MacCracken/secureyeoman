# Security Hardening & Production Features

> Prompt for implementing deferred security hardening, production features, and remaining integration depth.
> These items strengthen the system for production deployments and complete security coverage gaps.

---

## Context

F.R.I.D.A.Y. Phases 1-5 are complete with enterprise-grade security fundamentals in place: RBAC, JWT auth, AES-256-GCM encryption, sandboxed execution, rate limiting, audit chains, and Prometheus metrics. The items below address remaining hardening gaps and production UX features that were deferred during core development.

**Backend**: `packages/core/` — TypeScript, Fastify, better-sqlite3, WAL mode
**Security**: `packages/core/src/security/` — RBAC, auth, encryption, sandbox, rate limiting, input validation
**Logging**: `packages/core/src/logging/` — SQLite audit storage, HMAC-SHA256 chain, FTS5 search, file writer, log rotation
**Testing**: Vitest, 850+ core tests, security + chaos test suites in `tests/`

---

## Deliverables

### Security Features

#### 1. Audit Log Retention Policy Enforcement

Automatically purge old audit entries to bound storage growth.

**File**: `packages/core/src/logging/sqlite-storage.ts`

- Add `enforceRetention(opts: { maxAgeDays?: number; maxEntries?: number }): number`
  - Delete entries older than `maxAgeDays` (default 90)
  - If entry count exceeds `maxEntries`, delete oldest entries beyond the limit
  - Return count of deleted entries
  - Preserve audit chain integrity: when deleting, record a "retention_purge" audit entry noting the range deleted
- Add configuration in `config.yaml` under `security.audit`:
  ```yaml
  audit:
    retention_days: 90
    max_entries: 1000000
  ```
- Wire into `SecureYeoman` maintenance cycle (call periodically alongside brain maintenance)

**Tests** (`packages/core/src/logging/sqlite-storage.test.ts` or new file):
- Purges entries older than threshold
- Respects max entries limit
- Records purge audit entry
- No-op when within limits

#### 2. Encrypted Config File Support

Allow the config loader to consume encrypted configuration files.

**File**: `packages/core/src/config/loader.ts` (or create)

- Detect `.enc.yaml` or `.encrypted.yaml` config files
- Use the existing `SecretStore` (`packages/core/src/security/secret-store.ts`) to decrypt
- Flow: read encrypted file -> decrypt with SecretStore -> parse YAML -> validate with Zod
- Support encrypting a config: add `secureyeoman config encrypt <file>` CLI command
- Support decrypting for inspection: `secureyeoman config decrypt <file>`

**Tests**:
- Encrypts and decrypts a config file round-trip
- Rejects invalid encryption key
- Falls back to plain YAML when no `.enc` extension

#### 3. seccomp-bpf Filter Creation

Add proper seccomp-bpf system call filtering for sandboxed execution on Linux.

**File**: `packages/core/src/sandbox/seccomp.ts` (new)

- Create seccomp-bpf filter using a native addon or `prctl` via FFI
- Default policy: allow-list of safe syscalls (read, write, open, close, mmap, etc.)
- Block dangerous syscalls: `execve` (except for allowed binaries), `ptrace`, `mount`, `reboot`, `kexec_load`
- Integrate with existing `LinuxSandbox` as an additional layer
- Graceful fallback: if seccomp is not available (old kernel), log warning and continue with Landlock only

**Note**: This requires native bindings. Consider using `node-ffi-napi` or a small C addon compiled with `node-gyp`. Evaluate whether the complexity is justified vs. the existing Landlock V2 sandbox.

**Tests**:
- Seccomp filter blocks `execve` for disallowed binaries
- Allowed syscalls still work
- Graceful degradation on unsupported kernels

#### 4. Namespace Isolation (PID, Network, Mount)

Add Linux namespace isolation for stronger sandboxing.

**File**: `packages/core/src/sandbox/namespaces.ts` (new)

- Use `clone()` with namespace flags via native bindings or `unshare` command
- PID namespace: sandbox process gets PID 1, can't see host processes
- Network namespace: no network access by default, optional allowlist
- Mount namespace: read-only root, writable tmpfs for workspace
- Integrate with `LinuxSandbox` — use namespaces when available, fall back to current approach

**Note**: Requires root or `CAP_SYS_ADMIN` for full namespace isolation. Consider using `unshare` command as a simpler alternative that works without native bindings.

**Tests**:
- PID namespace isolates process tree
- Network namespace blocks outbound connections
- Mount namespace prevents writes outside workspace
- Graceful fallback without root/capabilities

---

### Production Features

#### 5. Remember Me Toggle on Login

Extend session duration when user opts in.

**Files**:
- `packages/dashboard/src/components/LoginPage.tsx` — add checkbox
- `packages/core/src/security/auth.ts` — accept `rememberMe` flag

- Add "Remember me" checkbox to the login form
- When checked, issue JWT with extended expiration (30 days instead of default 24h)
- Store preference in refresh token metadata
- Update `POST /api/v1/auth/login` to accept `rememberMe: boolean`
- Dashboard: if remembered, skip session timeout warnings

**Tests**:
- Login with rememberMe returns longer-lived token
- Login without rememberMe returns standard token
- Dashboard checkbox state persists across page reload (localStorage)

#### 6. Password Reset Flow

Allow admin to reset passwords without restarting the server.

**Files**:
- `packages/core/src/security/auth.ts` — add `resetPassword()` method
- `packages/core/src/gateway/auth-routes.ts` — add reset endpoint

- Add `POST /api/v1/auth/reset-password` endpoint (admin-only, requires current password)
- Accept `{ currentPassword, newPassword }` body
- Validate new password meets minimum requirements (32+ chars)
- Invalidate all existing sessions/tokens for the user after reset
- Audit log the password change event

**Tests**:
- Successful password reset with correct current password
- Reject reset with wrong current password
- Reject weak new password
- All existing tokens invalidated after reset
- Audit entry created

#### 7. Two-Factor Authentication (2FA)

Add TOTP-based 2FA for enhanced login security.

**Files**:
- `packages/core/src/security/totp.ts` (new) — TOTP generation/verification
- `packages/core/src/security/auth.ts` — integrate 2FA into login flow
- `packages/dashboard/src/components/TwoFactorSetup.tsx` (new)

- Implement TOTP (RFC 6238) using a library like `otpauth` or hand-roll with `crypto`
- Setup flow: generate secret -> display QR code -> verify first code -> enable
- Login flow: after password verification, prompt for TOTP code if 2FA is enabled
- Recovery codes: generate 10 one-time backup codes on setup
- Store encrypted 2FA secret in auth storage

**Tests**:
- TOTP code generation matches expected values
- Valid code accepted within time window
- Expired/reused code rejected
- Recovery code works once then is consumed
- Login requires 2FA when enabled

#### 8. Release Notes Generation

Auto-generate release notes from conventional commits.

**File**: `scripts/generate-release-notes.ts` (new)

- Parse git log for conventional commits since last tag
- Group by type: Features, Bug Fixes, Docs, etc.
- Output Markdown format suitable for GitHub Releases
- Include contributor list and PR links where available
- Add `npm run release-notes` script

**Tests**:
- Parses conventional commit messages correctly
- Groups by type
- Handles missing tags gracefully

---

### Integration Depth

#### 9. Plugin Loader with Dynamic Import

Replace manual integration registration with dynamic loading.

**File**: `packages/core/src/integrations/manager.ts`

- Scan a `plugins/` directory for integration modules
- Each plugin exports an `Integration` factory conforming to the existing interface
- Use `import()` for dynamic loading
- Validate plugin exports at load time
- Support hot-reload in development (watch plugin directory)

**Tests**:
- Loads a valid plugin from directory
- Rejects plugin with missing exports
- Handles plugin load errors gracefully

#### 10. Zod-Validated Per-Plugin Config Schema

Add type-safe configuration for each integration plugin.

**File**: `packages/core/src/integrations/types.ts`

- Each integration declares a Zod schema for its config
- `IntegrationManager.register()` validates config against the schema
- Invalid config produces clear error messages
- Merge into existing `IntegrationConfig` type

**Tests**:
- Valid config passes validation
- Invalid config rejected with descriptive errors
- Missing required fields detected

#### 11. Media Handling for Integrations

Support receiving and sending images, files, and voice messages.

**Files**: Platform adapter files in `packages/core/src/integrations/`

- Extend `UnifiedMessage` with attachment support (already has `MessageAttachment` type)
- Download received media to a temp directory with size limits (10MB default)
- Virus/content scanning hook point (interface only, no implementation needed now)
- Platform-specific: Telegram photos/documents, Discord attachments, Slack file uploads
- Clean up temp files after processing

**Tests** (per adapter):
- Receives image attachment
- Enforces size limit
- Cleans up temp files

#### 12. Reply Threading and Context Preservation

Maintain conversation context across message threads.

**File**: `packages/core/src/integrations/conversation.ts`

- Track thread IDs per platform (Telegram reply chains, Discord threads, Slack thread_ts)
- Maintain conversation context window per thread
- Auto-expire stale threads after configurable timeout
- Pass thread context to AI for continuity

**Tests**:
- Tracks replies within a thread
- Separate threads have independent context
- Stale threads expire

---

## Testing Requirements

- All new security features must have dedicated test files
- Follow existing patterns: Vitest, in-memory SQLite, mock dependencies
- Security features: test both positive (authorized) and negative (unauthorized) cases
- Add to the security test suite in `tests/security/` where integration testing is needed
- Target 80%+ coverage on new code

## Priority Order (Suggested)

1. **Audit Log Retention** (operational necessity, prevents disk exhaustion)
2. **Password Reset Flow** (basic production requirement)
3. **Remember Me Toggle** (quick win, improves UX)
4. **Encrypted Config Files** (security hygiene for deployment)
5. **Plugin Loader** (enables community contributions)
6. **Zod Plugin Config** (pairs with plugin loader)
7. **2FA** (significant security upgrade, moderate complexity)
8. **Reply Threading** (improves integration quality)
9. **Media Handling** (extends integration capabilities)
10. **Release Notes** (developer tooling)
11. **seccomp-bpf** (advanced, requires native bindings)
12. **Namespace Isolation** (advanced, requires root/capabilities)

---

*See [TODO.md](TODO.md) for the full deferred items list.*
*See [CHANGELOG.md](CHANGELOG.md) for completed work history.*
*See [docs/troubleshooting.md](docs/troubleshooting.md) for common issues.*
*See [DASHBOARD_PROMPT.md](DASHBOARD_PROMPT.md) for dashboard polish items.*
