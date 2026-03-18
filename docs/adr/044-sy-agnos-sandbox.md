# ADR 044 — sy-agnos: OS-Level Sandbox via Hardened AGNOS Image

**Status**: Proposed
**Date**: 2026-03-18

## Context

SecureYeoman currently offers 7 sandbox technologies ranked by isolation strength:

| Technology | Strength | Isolation Level | Weight |
|---|---|---|---|
| Firecracker | 90 | KVM hypervisor (microVM) | Heavy (~150ms snapshot, ~1-2s cold) |
| gVisor | 70 | User-space kernel | Medium |
| AGNOS (current) | 65 | Edge device OS bridge | Medium |
| Landlock | 50 | Kernel LSM | Light |
| WASM | 40 | WebAssembly runtime | Light |
| Darwin | 30 | macOS sandbox-exec | Light |
| Noop | 0 | None | None |

Firecracker provides the strongest isolation (KVM) but carries VM boot overhead and requires `/dev/kvm`. gVisor is lighter but still runs as a user-space kernel intercept. There is a gap between Firecracker's heavyweight hypervisor isolation (90) and gVisor's user-space kernel (70) — room for a medium-weight, ultra-high-security option that doesn't require KVM.

AGNOS is SecureYeoman's AI-native operating system for edge devices. We already control the kernel, init system, filesystem layout, package set, and network stack. The current `agnos` sandbox tier (65) treats AGNOS as a bridge to edge devices. This ADR proposes a new mode: **sy-agnos** — a purpose-built, hardened AGNOS image where the OS itself IS the sandbox.

NVIDIA's NemoClaw ships OpenShell for process-level sandboxing (filesystem isolation, network policy, syscall blocking). sy-agnos would exceed this by controlling the entire OS — not just process-level policy on someone else's host.

## Decision

### sy-agnos Sandbox Image

Build a minimal, hardened AGNOS image (`sy-agnos`) purpose-built as an execution sandbox:

**1. Immutable Rootfs**
- Read-only root filesystem (squashfs or dm-verity verified)
- No shell (`/bin/sh`, `/bin/bash` removed)
- No package manager, no compiler, no debug tools
- Minimal process tree: init → sy-agent → health-check (3 processes max)
- Only libraries required by the Node.js runtime and agent binary

**2. Filesystem Isolation**
- Root is immutable — agent cannot modify OS
- Single writable tmpfs at `/tmp` with size cap (configurable, default 256 MB)
- Optional writable volume mount for task output at `/data` (ephemeral, destroyed on sandbox teardown)
- No access to host filesystem — no bind mounts, no shared volumes

**3. Network Control**
- nftables policy applied at OS boot, not userspace
- Default-deny egress — only allowlisted hosts/ports permitted
- DNS restricted to configured resolvers (no arbitrary resolution)
- No listening sockets except health-check endpoint
- Network policy changes require image rebuild (not runtime mutable — this is a feature, not a limitation)

**4. Process Hardening**
- seccomp BPF filter baked into image (not applied at runtime — cannot be bypassed by the agent)
- No `CAP_SYS_ADMIN`, `CAP_NET_RAW`, or `CAP_PTRACE` — only `CAP_NET_BIND_SERVICE` if needed
- PID namespace isolation (agent sees only its own processes)
- No `mount`, `umount`, `pivot_root`, `chroot` syscalls permitted
- `prctl(PR_SET_NO_NEW_PRIVS)` enforced at init

**5. Boot & Lifecycle**
- Image boots in ~1-2 seconds (no kernel boot — container-runtime launch of the image)
- Can be launched via Docker, Podman, or direct `crun`/`runc` for minimal overhead
- Health endpoint responds within 500ms of launch
- Teardown destroys all writable state — no persistence between sandbox runs
- Optional: snapshot-restore for sub-500ms cold starts (same pattern as Firecracker snapshots)

**6. Communication**
- stdin/stdout JSON protocol (same as Firecracker and binary agent tiers)
- Optional vsock if running under a hypervisor
- Credential proxy injection via environment variable (secret never written to filesystem)

### Strength Scoring

The sy-agnos sandbox strength is **variable based on AGNOS hardening level**:

| AGNOS Hardening | Strength | Rationale |
|---|---|---|
| Base (current bridge) | 65 | Device-level isolation, shared OS |
| sy-agnos Minimal | 80 | Immutable rootfs, no shell, seccomp-baked, PID namespace |
| sy-agnos + dm-verity | 85 | Verified boot, tamper-evident filesystem, matches SEV tier |
| sy-agnos + measured boot + TPM | 88 | Hardware-attested integrity, approaches Firecracker |

The strength score is reported dynamically based on detected capabilities. As the AGNOS base hardens (verified boot, TPM attestation, measured launch), the score increases automatically — the `SandboxManager` reads capabilities from the running sy-agnos instance rather than using a static number.

### Updated Strength Ranking

```typescript
export const SANDBOX_STRENGTH: Record<string, number> = {
  firecracker: 90,
  'sy-agnos-measured': 88,
  sev: 85,
  'sy-agnos-verity': 85,
  sgx: 80,
  'sy-agnos': 80,
  gvisor: 70,
  agnos: 65,        // legacy bridge mode
  landlock: 50,
  wasm: 40,
  darwin: 30,
  none: 0,
};
```

### Integration with Sandbox Manager

- New technology value: `sy-agnos` (auto-detected when running inside a sy-agnos image via `/etc/sy-agnos-release` marker file)
- `SandboxManager.createSandboxForTask('sy-agnos')` launches the image, executes the task, returns the result, destroys the container
- Profile `high-security` updated to prefer `sy-agnos` when available (falls back to Firecracker → gVisor → Landlock)
- Capability probe reports sy-agnos variant and detected hardening level

### Image Build Pipeline

- `scripts/build-sy-agnos.sh` — builds the hardened image from AGNOS base
- Dockerfile.sy-agnos — multi-stage: AGNOS base → strip to minimal → copy SY agent binary → apply seccomp + nftables → squashfs rootfs
- Published to GHCR alongside main images: `ghcr.io/maccracken/sy-agnos:latest`
- Signed with cosign (same supply chain as main binary)

## Consequences

### Positive

- **OS-level isolation without hypervisor overhead** — stronger than gVisor (70) or Landlock (50), lighter than Firecracker (90)
- **No escape surface** — even if the agent achieves arbitrary code execution, there's nothing to escalate to (no shell, no tools, no writable OS)
- **Unique competitive differentiator** — no competitor controls their own OS. NemoClaw's OpenShell is process-level policy on an OpenClaw host. sy-agnos is the entire OS purpose-built for sandboxing
- **Progressive hardening** — strength score increases as AGNOS base improves (dm-verity, TPM, measured boot) without changing the SY integration
- **Air-gap ready** — the image includes everything needed; no runtime downloads
- **Fleet synergy** — same AGNOS image pipeline used for edge devices, now also used for sandboxing on any Docker host

### Negative

- Requires Docker/Podman/crun on the host (not available on bare-metal without a container runtime)
- Image build adds CI complexity (AGNOS base image + hardening steps + signing)
- Container startup (~1-2s) slower than Landlock (~0ms) or WASM (~10ms) for trivial tasks
- Two AGNOS sandbox modes to maintain (legacy bridge at 65, sy-agnos at 80+)

### Comparison: sy-agnos vs NemoClaw OpenShell

| | sy-agnos | NemoClaw OpenShell |
|---|---|---|
| **Isolation boundary** | Entire OS (immutable rootfs) | Process-level policy |
| **Shell access** | None (removed from image) | Available (host OS) |
| **Network control** | OS-level nftables (boot-baked) | YAML policy (runtime) |
| **Filesystem** | Immutable rootfs + ephemeral tmpfs | Policy-restricted host FS |
| **Escape surface** | 3 processes, no tools | Full host OS behind policy |
| **Dependency** | Docker/Podman on any Linux | OpenClaw installation |
| **Strength** | 80-88 (scales with hardening) | ~70 (process-level) |
| **Air-gap** | Yes (self-contained image) | Partial (needs OpenClaw + GPU) |

## Build Dependency: AGNOS First, SY Second

The sy-agnos image IS the sandbox. SY only launches and communicates with it. Build order:

```
AGNOS repo (agnosticos)                    SY repo (secureyeoman)
─────────────────────────                  ──────────────────────
1. sy-agnos recipe set
2. Hardened rootfs profile
3. Stripped image (no shell, baked seccomp)
4. nftables default-deny policy
5. dm-verity integration (Phase 2)
6. Image published to GHCR
                                           7. SandboxManager sy-agnos driver
                                           8. /etc/sy-agnos-release detection
                                           9. Strength scoring integration
                                           10. high-security profile update
```

**AGNOS provides**: The hardened OS image, built via takumi recipes from existing components (nftables, seccomp, tpm2-tools, dm-verity from agnos-sys, read-only rootfs from edge profile). ~80% of the work.

**SY provides**: A new sandbox driver (same pattern as the Firecracker driver), stdin/stdout task protocol, strength detection, and profile wiring. ~20% of the work.

### Existing AGNOS components reused

| Component | Location | Purpose in sy-agnos |
|---|---|---|
| nftables | `recipes/edge/nftables.toml` | Default-deny egress, boot-baked rules |
| seccomp (libseccomp) | `recipes/base/libseccomp.toml` | BPF filter baked into image |
| tpm2-tools + tpm2-tss | `recipes/edge/tpm2-*.toml` | Phase 3 measured boot attestation |
| dm-verity | `agnos-sys/src/dmverity.rs` | Phase 2 verified rootfs |
| read_only_rootfs | edge profile config | Immutable squashfs root |
| glibc + openssl | base recipes | Minimal runtime deps for Node.js |
| argonaut init | `agent-runtime/src/argonaut.rs` | Minimal init (3 processes) |
| aegis quarantine | `agent-runtime/src/aegis.rs` | Violation response |
| Firecracker recipe | `recipes/base/firecracker.toml` | Reference for VM-level isolation patterns |

## Implementation Phases

### Phase 1 — sy-agnos Minimal (score 80)

**AGNOS repo:**
- New recipe set: `recipes/sandbox/` with sy-agnos profile
- `recipes/sandbox/sy-agnos-rootfs.toml` — multi-stage: edge base → strip to minimal (no shell, no package manager, no SSH, no debug tools) → copy SY agent binary → bake seccomp BPF + nftables rules → squashfs
- `recipes/sandbox/sy-agnos-init.toml` — minimal init config: 3 processes (argonaut → sy-agent → health-check), no TTY, no login
- `recipes/sandbox/sy-agnos-nftables.toml` — default-deny egress ruleset, allowlist-driven, DNS restricted to configured resolvers
- `scripts/build-sy-agnos.sh` — builds the hardened OCI image from recipes
- `/etc/sy-agnos-release` marker file with version + hardening level metadata (JSON)
- Published to GHCR: `ghcr.io/maccracken/sy-agnos:latest`

**SY repo:**
- New sandbox driver: `packages/core/src/sandbox/sy-agnos-sandbox.ts`
- `createSandboxForTask('sy-agnos')` — launches OCI image, pipes task via stdin/stdout, destroys on teardown
- Dynamic strength detection: reads `/etc/sy-agnos-release` from running container, reports hardening level
- Update `high-security` profile to prefer sy-agnos when available (fallback: Firecracker → gVisor → Landlock)
- Tests: unit + E2E for sy-agnos driver

### Phase 2 — dm-verity (score 85)

**AGNOS repo:**
- Enable dm-verity on sy-agnos rootfs (already implemented in `agnos-sys/src/dmverity.rs`)
- Hash tree generation during image build
- Boot-time verification: rootfs tamper → refuse to start agent
- Update `/etc/sy-agnos-release` with `"dmverity": true`

**SY repo:**
- Strength auto-upgrades to 85 when dm-verity detected in release metadata

### Phase 3 — Measured Boot + TPM (score 88)

**AGNOS repo:**
- TPM 2.0 measured boot using tpm2-tools (already in edge recipes)
- PCR extend at each boot stage
- Attestation endpoint: `/v1/attestation` returns signed boot measurements
- Update `/etc/sy-agnos-release` with `"tpm_measured": true`

**SY repo:**
- Pre-dispatch attestation check: verify boot measurements before sending task to sandbox
- Remote attestation for fleet management (verify sandbox integrity across instances)
- Strength auto-upgrades to 88 when TPM measured boot detected
