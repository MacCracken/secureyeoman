# ADR 099 — Sandbox Credential Proxy

**Date:** 2026-02-21
**Status:** Accepted
**Deciders:** Core team

---

## Context

Sandboxed processes (Landlock workers, capture-sandbox children) historically received
secrets as environment variables. Environment variables are readable by any code running
inside the process, survive across `exec()` calls, and may appear in `/proc/self/environ`
on Linux. This is the one security gap where SecureYeoman trailed Ironclaw — the
functional-audit "Outbound Network Proxy" row was ❌.

The goal is to allow sandboxed agents to authenticate outbound HTTP(S) requests to known
APIs without ever holding the raw credential value.

---

## Decision

Introduce a `CredentialProxy` — a Node.js `http.Server` that:

1. Listens on `127.0.0.1:0` (OS-assigned ephemeral port) in the **parent** process.
2. Holds `{host → {headerName, headerValue}}` credential rules in memory (parent only).
3. Holds a `Set<string>` of allowed hostnames (union of explicit `allowedHosts` and hosts
   that have a credential rule).
4. **Plain HTTP requests** — validates the target hostname against the allowlist, injects
   the credential header if a matching rule exists, forwards the request with
   `http.request`, pipes the response back. Returns `403` if the host is not allowed.
5. **HTTPS CONNECT tunnels** — validates the target hostname, then creates a raw TCP
   tunnel via `net.createConnection`. Returns `403` if the host is not allowed.
   (Header injection is not possible inside TLS; allowlist enforcement is the security
   value here.)
6. **Other methods / non-proxy requests** — returns `405`.

The sandboxed child receives `http_proxy=http://127.0.0.1:PORT` via the environment.
It never sees the raw credential. The proxy is lifecycle-managed by `SandboxManager`
(`startProxy` / `stopProxy`) and its URL is surfaced in `getStatus()`.

---

## Alternatives Considered

| Alternative | Reason Rejected |
|---|---|
| Keep injecting env vars | Credentials visible inside sandbox; fails audit requirement |
| Unix domain socket proxy | More complex setup, harder to configure in standard HTTP clients |
| Mounted credential file | File is still accessible inside the sandbox filesystem |
| Out-of-process sidecar | Adds deployment complexity for a feature that can live in the parent process |

---

## Consequences

**Positive:**
- Credentials never enter the sandbox environment — closes the functional-audit gap.
- Allowlist enforcement provides defence-in-depth against SSRF from inside the sandbox.
- Additive to existing Landlock/seccomp/namespace isolation.
- Standard `http_proxy` env var is supported by virtually all HTTP client libraries.

**Negative / Trade-offs:**
- Plain HTTP forwarding is unencrypted between proxy and target when the target is HTTP
  (same risk as without the proxy; HTTPS targets use CONNECT tunnels).
- The proxy runs in the parent process — a compromised parent could still read credentials.
  This is an accepted boundary; the proxy protects the sandbox boundary, not the parent.
- Credential injection is not possible inside TLS tunnels (CONNECT); only allowlist
  enforcement applies for HTTPS targets.

---

## Implementation

| File | Role |
|---|---|
| `packages/core/src/sandbox/credential-proxy.ts` | `CredentialProxy` class |
| `packages/core/src/sandbox/credential-proxy.test.ts` | Unit tests (vitest) |
| `packages/core/src/sandbox/manager.ts` | `startProxy` / `stopProxy` / `getStatus` update |
| `packages/core/src/sandbox/index.ts` | Re-exports |
| `packages/core/src/sandbox/types.ts` | `credentialProxy?` in `SandboxCapabilities` |
| `packages/shared/src/types/config.ts` | `SandboxProxyCredentialSchema`, `credentialProxy` sub-object, `sandboxCredentialProxy` policy flag |
| `packages/core/src/secureyeoman.ts` | `updateSecurityPolicy` + `policyKeys` |
| `packages/core/src/gateway/server.ts` | Policy GET/PATCH + sandbox status endpoint |
| `packages/core/src/cli/commands/policy.ts` | `ALL_POLICY_FLAGS` |
| `packages/dashboard/src/api/client.ts` | `SecurityPolicy` interface + fallback |
| `packages/dashboard/src/components/SecuritySettings.tsx` | `PolicyToggle` in Sandbox Isolation card |
| `packages/dashboard/src/components/SecuritySettings.test.tsx` | Mock policy field |
