# Rust Crates Testing Matrix

> Testing requirements, coverage targets, and hardware test plan for the `crates/` Cargo workspace.

---

## Coverage Summary (as of 2026.3.19)

| Crate | Tests | Coverage | Target | Status |
|-------|-------|----------|--------|--------|
| sy-crypto | 42 | 98.0% | 95% | **Met** |
| sy-privacy | 25 | 97.7% | 95% | **Met** |
| sy-audit | 15 | 100.0% | 95% | **Met** |
| sy-tee | 19 | 88.3% | 80% | **Met** |
| sy-sandbox | 14 | 76.2% | 80% | Close — kernel-gated paths |
| sy-hwprobe | 32 | 56.0% | 60% | Close — hardware-gated paths |
| sy-edge | 62 | 37.1% | 50% | Server/network modules untestable without async harness |
| **Total** | **209** | | | |

> Coverage measured with `cargo tarpaulin` per-crate, excluding dependency source lines.

---

## Hardware Testing Matrix

Tests below require specific hardware or kernel features. Mark each cell when verified on that platform.

**Test Machines:**
- **Dev (x64)**: `archaemenid` — x86_64, Linux 6.12.71-1-lts, 16 cores, 61 GB RAM, DRI GPU (`/dev/dri/renderD128`), cgroup v2, seccomp available, no TPM
- **RPi4 (arm64)**: Raspberry Pi 4 — aarch64, <4 GB RAM, edge target
- **DeepLens (arm64)**: AWS DeepLens — aarch64, edge target with GPU
- **CI (no GPU)**: GitHub Actions runner — x86_64, containerized, no hardware accelerators

### GPU Detection (sy-hwprobe + sy-edge)

| Test | Dev (x64 + NVIDIA) | RPi4 (arm64) | DeepLens (arm64) | CI (no GPU) |
|------|:-------------------:|:------------:|:----------------:|:-----------:|
| `nvidia-smi` CSV parsing | [ ] | N/A | N/A | Mocked |
| sysfs `/sys/class/drm` AMD detection | N/A | N/A | N/A | Mocked |
| `/dev/nvidia0` presence check | [ ] | N/A | N/A | N/A |
| `/dev/dri/renderD128` presence check | [x] present | [ ] | [ ] | N/A |
| `lspci` Intel iGPU parsing | N/A (no lspci) | N/A | N/A | Mocked |
| Edge `detect_gpu()` returns true | [x] true | [ ] | [ ] | N/A |

### TPU Detection (sy-hwprobe)

| Test | Cloud TPU VM | Dev (no TPU) |
|------|:------------:|:------------:|
| `/sys/class/accel` sysfs reading | [ ] | Skipped |
| TPU version parsing (v4/v5e/v5p) | [ ] | Mocked |
| HBM per chip calculation | Unit tested | Unit tested |
| XDNA driver exclusion | [ ] | Unit tested |

### NPU Detection (sy-hwprobe)

| Test | Intel Meteor Lake+ | AMD Ryzen AI | Dev (no NPU) |
|------|:------------------:|:------------:|:------------:|
| `/sys/class/misc/intel_npu` | [ ] | N/A | Skipped |
| AMD XDNA via `/sys/class/accel` | N/A | [ ] | Skipped |

### AI ASIC Detection (sy-hwprobe)

| Test | Gaudi Instance | Neuron Instance | Qualcomm AI 100 | Dev (no ASIC) |
|------|:--------------:|:---------------:|:----------------:|:-------------:|
| `hl-smi` CSV parsing | [ ] | N/A | N/A | Mocked |
| `neuron-ls --json-output` | N/A | [ ] | N/A | Mocked |
| `/dev/neuron*` fallback | N/A | [ ] | N/A | N/A |
| `/sys/class/qaic` detection | N/A | N/A | [ ] | N/A |

### Sandbox Capabilities (sy-sandbox)

| Test | Linux 6.12 (dev) | Linux 5.13+ | Linux < 5.13 | Container |
|------|:----------------:|:-----------:|:------------:|:---------:|
| seccomp mode detection | [x] disabled (available) | [ ] | [ ] | [ ] |
| Landlock ABI version | [x] kernel 6.12 (no proc entry) | [ ] | N/A | [ ] |
| cgroup v2 detection | [x] active | [ ] | [ ] | [ ] |
| cgroup memory limits | [x] no limit (max) | [ ] | [ ] | [ ] |
| Namespace availability | [x] all ns present | [ ] | [ ] | [ ] |

### TEE Sealing (sy-tee)

| Test | Dev (no TPM) | TPM2 Device | SGX Platform |
|------|:------------:|:-----------:|:------------:|
| Keyring seal/unseal | Unit tested | Unit tested | Unit tested |
| TPM key derivation | N/A | [ ] | N/A |
| TEE (SGX) key derivation | N/A | N/A | [ ] (stub) |
| File seal/unseal roundtrip | Unit tested | [ ] | N/A |

### Edge Binary (sy-edge)

| Test | Dev (x64) | RPi4 (arm64) | DeepLens | Docker |
|------|:---------:|:------------:|:--------:|:------:|
| `sy-edge --version` | [x] 0.1.0 | [ ] | [ ] | [ ] |
| `sy-edge status` (capabilities) | [x] GPU+16core+61GB | [ ] | [ ] | [ ] |
| `sy-edge start` (HTTP server) | [ ] | [ ] | [ ] | [ ] |
| `/health` endpoint | [ ] | [ ] | [ ] | [ ] |
| A2A registration with parent | [ ] | [ ] | [ ] | [ ] |
| Memory store persistence | [ ] | [ ] | [ ] | [ ] |
| Sandbox command execution | [ ] | [ ] | [ ] | [ ] |
| Binary size < 10 MB | [x] 6.9MB | [ ] | [ ] | N/A |
| RSS < 20 MB idle | [ ] | [ ] | [ ] | [ ] |

---

## What Cannot Be Unit Tested

These paths require integration or hardware testing and are excluded from coverage targets:

| Path | Reason | Test Strategy |
|------|--------|---------------|
| `nvidia-smi` execution | Binary not in CI | Mock CSV output (done) |
| `tpm2_unseal` execution | No TPM in CI | Manual on TPM device |
| Network calls (LLM, messaging) | External APIs | Integration test with mock server |
| mDNS advertisement | Network multicast | Manual on LAN |
| OTA update download | Requires parent server | Integration test |
| seccomp BPF filter application | Needs `libseccomp-sys` | Future native binding |
| Landlock rule enforcement | Needs root or CAP_SYS_ADMIN | Manual on target kernel |

---

## Running Tests

```bash
# All Rust tests
cargo test --manifest-path crates/Cargo.toml

# Single crate
cargo test --manifest-path crates/Cargo.toml -p sy-crypto

# Coverage (requires cargo-tarpaulin)
cd crates && cargo tarpaulin -p sy-crypto --skip-clean --timeout 60

# Edge binary smoke test
crates/target/release/sy-edge status
crates/target/release/sy-edge start --port 19999 &
curl http://localhost:19999/health
```

---

## Coverage Improvement Plan

1. **sy-sandbox → 80%**: Add Landlock kernel version mock tests, cgroup memory limit parsing with mock files
2. **sy-hwprobe → 60%**: Extract more parsing functions from probe functions (AMD sysfs, TPU sysfs), add mock output tests
3. **sy-edge → 50%**: Add `#[tokio::test]` async tests for server endpoint handlers with in-memory state
4. **sy-tee → 90%**: Test hex_decode edge cases, add tampered-ciphertext tests
