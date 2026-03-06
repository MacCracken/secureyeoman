# ADR 028 — Agent Sandboxing Profiles

**Status**: Accepted
**Date**: 2026-03-06
**Changelog**: [2026.3.6]

## Context

SecureYeoman's sandbox system supports 8 implementations (Linux/Landlock, Darwin, gVisor, WASM, SGX, SEV, NoOp) with configurable resource limits, filesystem policies, and network restrictions. However, configuration is a flat set of values that users must tune manually for each environment. This makes it error-prone to switch between permissive development settings and locked-down production configurations.

## Decision

Introduce named sandbox profiles — preset configurations for dev, staging, prod, and high-security environments — with support for custom profiles.

1. **Four built-in profiles**: dev (permissive), staging (moderate), prod (locked-down with credential proxy), high-security (maximum isolation with Landlock, no network, strict tool blocklist).
2. **Custom profiles**: Users can create named custom profiles with arbitrary settings.
3. **Profile-to-config conversion**: `toManagerConfig()` translates profiles into `SandboxManagerConfig` for existing sandbox infrastructure.
4. **Config integration**: `activeProfile` field on `SandboxConfigSchema` selects the active profile.

## Consequences

- Existing sandbox config remains backward compatible — `activeProfile` is optional.
- Profiles are in-memory only (no database persistence). Custom profiles reset on restart. Persistence can be added later if needed.
- Per-personality profile overrides are possible via the profile registry but not yet wired into personality config.

## Files

| File | Purpose |
|------|---------|
| `packages/shared/src/types/sandbox-profiles.ts` | Zod schemas and TS types |
| `packages/core/src/sandbox/sandbox-profiles.ts` | Profile registry with 4 built-in presets |
| `packages/core/src/sandbox/sandbox-profile-routes.ts` | 5 REST API endpoints |
| `packages/core/src/sandbox/*.test.ts` | 20 tests across 2 files |
