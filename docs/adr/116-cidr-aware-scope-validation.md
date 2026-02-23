# ADR 116 — CIDR-Aware Scope Validation for Security Tools

**Date:** 2026-02-23
**Status:** Accepted
**Deciders:** SecureYeoman Core Team

---

## Context

The Kali Security Toolkit (`sec_*` MCP tools) enforces a target scope allowlist via `MCP_ALLOWED_TARGETS` to prevent the AI from scanning hosts outside an authorized engagement. The previous implementation in `validateTarget()` used a simple substring/prefix match:

```ts
const ok = allowedTargets.some(
  (entry) => target === entry || target.startsWith(entry) || entry.startsWith(target)
);
```

This approach had correctness bugs at subnet boundaries. For example, with `allowedTargets = ['10.10.10.0/24']`:

- `10.10.10.5` — **should match**, but `target.startsWith(entry)` is false because the string `10.10.10.5` does not start with `10.10.10.0/24`, and `entry.startsWith(target)` is false because `10.10.10.0/24` does not start with `10.10.10.5`.
- `10.10.11.5` — **should not match**, but `entry.startsWith(target)` would be true if target were a short prefix like `10.`.

The CIDR notation is the standard way to define network scope in penetration testing engagements. The old logic silently failed to honour it correctly.

---

## Decision

Replace the substring/prefix match with proper IPv4 CIDR math and a structured `matchesScope()` function. No new dependency is required — the logic is implemented inline in pure TypeScript.

### `isIpInCidr(ip, cidr)`

Converts both the IP and the network address to 32-bit unsigned integers, applies the prefix-length mask, and compares them. Returns `false` for any malformed input (fail-closed).

```ts
export function isIpInCidr(ip: string, cidr: string): boolean {
  const [network, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  const ipv4Re = /^\d{1,3}(\.\d{1,3}){3}$/;
  if (!ipv4Re.test(ip) || !network || !ipv4Re.test(network)) return false;
  const toNum = (s: string): number =>
    s.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0) >>> 0;
  const mask = bits === 0 ? 0 : ((~0) << (32 - bits)) >>> 0;
  return (toNum(ip) & mask) === (toNum(network) & mask);
}
```

### `matchesScope(target, entry)`

Dispatches to the correct matching strategy based on entry form:

| Entry form | Behaviour |
|---|---|
| Contains `/` | IPv4 CIDR range check via `isIpInCidr` |
| Starts with `.` | Domain suffix — matches apex (`example.com`) and all subdomains |
| Plain string | Exact match or subdomain (`target.endsWith('.entry')`) |

### `validateTarget()` updated

```ts
const ok = allowedTargets.some((entry) => matchesScope(target, entry));
```

---

## Consequences

- CIDR ranges in `MCP_ALLOWED_TARGETS` now work correctly at all subnet boundaries.
- Domain suffix entries (`.example.com`) are explicitly supported.
- Subdomain matching (`sub.example.com` allowed by `example.com`) is preserved.
- The wildcard `*` still short-circuits all checks.
- Both helpers are exported so they can be tested directly without exercising the full tool registration.

---

## Files Changed

| File | Change |
|---|---|
| `packages/mcp/src/tools/security-tools.ts` | Replaced `validateTarget()` body with `isIpInCidr()` + `matchesScope()` helpers; both exported |
| `packages/mcp/src/tools/security-tools.test.ts` | Added `isIpInCidr` and `matchesScope` test suites (22 new assertions) |
| `docs/adr/116-cidr-aware-scope-validation.md` | This document |
