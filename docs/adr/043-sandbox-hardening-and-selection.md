# ADR 043 — Sandbox Hardening & Intelligent Selection

**Status**: Accepted
**Date**: 2026-03-17

## Decision

### Firecracker Hardening

Harden the Firecracker microVM sandbox with production-grade isolation:

1. **Rootfs builder** — `scripts/build-firecracker-rootfs.sh` builds minimal Alpine + Node.js rootfs and downloads compatible kernel. Reproducible Docker-based build.

2. **Jailer hardening** — cgroup v2 resource limits (`memory.max`, `cpu.max`), auto-detected cgroup version, optional custom seccomp BPF filter path.

3. **Virtio-vsock** — AF_VSOCK support for host↔guest communication as an alternative to stdio-based task output. Configured via `useVsock` and `vsockGuestCid` options.

4. **Snapshot/restore** — Full VM state capture via Firecracker REST API. Restore from snapshot for sub-100ms cold starts instead of ~1-2s boot.

5. **TAP network isolation** — Per-VM TAP device with iptables chain scoped to `allowedHosts`. DNS always allowed. Full cleanup on VM exit.

### Intelligent Selection

Replace the simple platform-based auto-detection with strength-ranked selection:

- **Strength ranking**: Firecracker (90) > SEV (85) > SGX (80) > gVisor (70) > AGNOS (65) > Landlock (50) > WASM (40) > Darwin (30) > Noop (0)
- **Per-task override**: `createSandboxForTask(technology)` for one-off technology selection without affecting global state
- **Capability probe**: `GET /api/v1/sandbox/capabilities` returns full availability matrix with prerequisites and install hints
- **Live switching**: `PATCH /api/v1/sandbox/config` with `technology` field switches immediately without restart
- **Health monitoring**: `GET /api/v1/sandbox/health` verifies active sandbox with minimal execution test

## Consequences

- **Positive**: Strongest available isolation is always selected automatically
- **Positive**: Users can see exactly what's missing to unlock stronger isolation
- **Positive**: Live switching enables experimentation without downtime
- **Positive**: Snapshot/restore enables sub-100ms sandbox starts for per-tool-call isolation
- **Negative**: TAP network setup requires root/CAP_NET_ADMIN privileges
- **Negative**: Snapshot/restore requires Firecracker REST API socket (not available in `--no-api` mode)
- **Mitigated**: All features degrade gracefully — fallback to in-process execution when prerequisites unavailable
