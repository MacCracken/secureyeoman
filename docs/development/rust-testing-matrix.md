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
| sy-edge | 62 | 37.1% | 50% | Server/network modules need async harness |
| **Total** | **209** | | | |

> Coverage measured with `cargo tarpaulin` per-crate, excluding dependency source lines.

---

## Test Machines

| Label | Host | Arch | OS / Kernel | RAM | Accelerators | Notes |
|-------|------|------|-------------|-----|--------------|-------|
| **Dev** | `archaemenid` | x86_64 | Linux 6.12.71-1-lts | 61 GB | DRI GPU (`/dev/dri/renderD128`) | cgroup v2, seccomp available, no TPM, no NVIDIA driver, no lspci |
| **RPi4** | TBD | aarch64 | TBD | 4 GB | None expected | Primary edge target |
| **DeepLens** | TBD | aarch64 | TBD | TBD | GPU (Intel/NVIDIA) | Edge target with accelerator |
| **CI** | GitHub Actions | x86_64 | Container | ~7 GB | None | No hardware, mocked probes only |

---

## Verified on Dev (`archaemenid`)

All items below confirmed working on 2026.3.19.

### sy-edge binary

| Check | Result |
|-------|--------|
| `sy-edge --version` | `0.1.0` |
| `sy-edge status` | nodeId `28488a0e`, x86_64, 16 cores, 61 GB, GPU detected |
| `sy-edge start --port 19999` | Server starts, logs JSON to stderr |
| `GET /health` | `{"status":"ok","mode":"edge","version":"0.1.0",...}` |
| `GET /api/v1/exec/allowed` | 23 allowed commands |
| `POST /api/v1/exec {"command":"uname","args":["-a"]}` | Returns kernel string, exit 0 |
| `GET /api/v1/metrics` | CPU 5.6%, mem 14249/61200 MB, disk 15.8% |
| `GET /api/v1/metrics/prometheus` | Valid Prometheus text format |
| `PUT /api/v1/memory/test/key1` | Stores value with TTL |
| `GET /api/v1/memory/test/key1` | Returns `{"value":"hello"}` |
| `GET /api/v1/a2a/peers` | `{"peers":[]}` (no parent configured) |
| `GET /api/v1/scheduler/tasks` | `{"tasks":[]}` |
| Binary size | 6.9 MB |
| RSS (idle, 1 req served) | 19.5 MB |

### sy-sandbox (kernel features)

| Check | Result |
|-------|--------|
| seccomp mode | `Seccomp: 0` (disabled, but kernel supports it) |
| Landlock | Kernel 6.12 supports it; `/proc/sys/kernel/landlock_restrict_self` not present |
| cgroup v2 | Active (`cgroup2 on /sys/fs/cgroup`) |
| cgroup memory.max | `max` (no container limit) |
| Namespaces | All present: cgroup, ipc, mnt, net, pid, time, user, uts |

### sy-hwprobe (GPU detection)

| Check | Result |
|-------|--------|
| `/dev/dri/renderD128` | Present |
| `detect_gpu()` | `true` |
| `nvidia-smi` | Not installed (no NVIDIA driver) |
| `lspci` | Not installed |
| `/dev/nvidia0` | Not present |

---

## Remaining: Not Yet Verified

Items below need hardware or platforms not currently available. Grouped by machine needed.

### Needs RPi4 (arm64 edge target)

| Crate | Test | What to check |
|-------|------|---------------|
| sy-edge | Cross-compile & run | `cargo build --target aarch64-unknown-linux-musl -p sy-edge` builds; binary runs on RPi4 |
| sy-edge | `sy-edge status` | Reports arm64 arch, <4 GB RAM, correct tags |
| sy-edge | `sy-edge start` + `/health` | HTTP server starts on constrained device |
| sy-edge | Binary size (arm64) | Should be < 10 MB |
| sy-edge | RSS idle | Should be < 20 MB |
| sy-edge | A2A registration | Register with parent SY instance from RPi4 |
| sy-hwprobe | `detect_gpu()` | Returns false (no GPU) |
| sy-hwprobe | `detect_tpu()` | Returns false |

### Needs DeepLens (arm64 + GPU)

| Crate | Test | What to check |
|-------|------|---------------|
| sy-edge | `sy-edge status` | Reports GPU presence via `/dev/dri/*` or `/dev/nvidia*` |
| sy-hwprobe | `detect_gpu()` | Returns true |
| sy-hwprobe | GPU probe family | Returns at least one device |

### Needs NVIDIA driver (any machine with nvidia-smi)

| Crate | Test | What to check |
|-------|------|---------------|
| sy-hwprobe | `nvidia-smi` live parsing | `probe()` returns devices with VRAM, temp, driver version |
| sy-hwprobe | Multiple GPU detection | Multi-GPU host returns correct device count |

### Needs Cloud TPU VM

| Crate | Test | What to check |
|-------|------|---------------|
| sy-hwprobe | `/sys/class/accel` live read | `probe()` returns TPU device(s) |
| sy-hwprobe | TPU version sysfs | Correctly reads v4/v5e/v5p from `tpu_version` |
| sy-hwprobe | Chip count | Reads `chip_count` and computes HBM correctly |

### Needs Intel Meteor Lake+ (NPU)

| Crate | Test | What to check |
|-------|------|---------------|
| sy-hwprobe | `/sys/class/misc/intel_npu` | `probe_intel()` returns device |

### Needs AMD Ryzen AI (XDNA NPU)

| Crate | Test | What to check |
|-------|------|---------------|
| sy-hwprobe | `/sys/class/accel` + amdxdna driver | `probe_amd_xdna()` returns device |
| sy-hwprobe | XDNA exclusion from TPU | TPU probe skips amdxdna-driven accel entries |

### Needs Gaudi instance (Intel Habana)

| Crate | Test | What to check |
|-------|------|---------------|
| sy-hwprobe | `hl-smi` live parsing | Returns Gaudi2/Gaudi3 devices with HBM |

### Needs AWS Neuron instance (Inferentia/Trainium)

| Crate | Test | What to check |
|-------|------|---------------|
| sy-hwprobe | `neuron-ls --json-output` live | Returns devices with nc_count, memory |
| sy-hwprobe | `/dev/neuron*` fallback | Falls back to device node detection |
| sy-hwprobe | Trainium vs Inferentia | DMI product_name correctly identifies chip type |

### Needs TPM2 device

| Crate | Test | What to check |
|-------|------|---------------|
| sy-tee | `tpm2_unseal` key derivation | `derive_from_tpm()` succeeds, returns 32-byte key |
| sy-tee | Seal/unseal with TPM source | Roundtrip works with TPM-derived key |

### Needs Docker / Container

| Crate | Test | What to check |
|-------|------|---------------|
| sy-edge | Edge in container | Binary runs in distroless/alpine container |
| sy-sandbox | seccomp in container | Detects container seccomp mode (typically `filter`) |
| sy-sandbox | cgroup limits in container | Reads `memory.max` set by Docker `--memory` flag |
| sy-sandbox | Namespace detection | User namespaces may be restricted |

### Needs different kernel versions

| Crate | Test | Kernel | What to check |
|-------|------|--------|---------------|
| sy-sandbox | Landlock ABI | 5.13 | Returns ABI v1 |
| sy-sandbox | Landlock ABI | 5.19+ | Returns ABI v2+ |
| sy-sandbox | Landlock unavailable | < 5.13 | Returns ABI 0, `is_available()` false |
| sy-sandbox | seccomp filter mode | 5.x+ with seccomp | `current_mode()` returns `"filter"` |

---

## Paths Excluded from Coverage Targets

These require integration testing or unavailable hardware and will never be unit-testable:

| Path | Crate | Reason | Mitigation |
|------|-------|--------|------------|
| `nvidia-smi` execution | sy-hwprobe | Binary not in CI | CSV parsing mocked (6 tests) |
| `rocm-smi` execution | sy-hwprobe | Binary not in CI | Parsing logic tested via sysfs path |
| `xpu-smi` execution | sy-hwprobe | Binary not in CI | CSV parsing mocked (3 tests) |
| `hl-smi` execution | sy-hwprobe | Binary not in CI | CSV parsing mocked (4 tests) |
| `neuron-ls` execution | sy-hwprobe | Binary not in CI | JSON deserialization tested (2 tests) |
| `tpm2_unseal` execution | sy-tee | No TPM in CI | Manual on TPM device |
| LLM API calls | sy-edge | External APIs | Provider config tested; calls need mock server |
| Webhook sends | sy-edge | External APIs | Target config tested; sends need mock server |
| mDNS advertisement | sy-edge | Network multicast | Stub logged; manual on LAN |
| OTA update download | sy-edge | Needs parent server | URL construction tested; download needs integration |
| seccomp BPF application | sy-sandbox | Needs `libseccomp-sys` | Detection tested; enforcement planned via native binding |
| Landlock rule enforcement | sy-sandbox | Needs privileges | Detection tested; enforcement is AGNOS-side |
| A2A parent registration | sy-edge | Needs parent instance | Request building tested; HTTP call needs live parent |

---

## Running Tests

```bash
# All Rust tests (209 tests)
cargo test --manifest-path crates/Cargo.toml

# Single crate
cargo test --manifest-path crates/Cargo.toml -p sy-crypto

# Coverage (requires cargo-tarpaulin)
cd crates && cargo tarpaulin -p sy-crypto --skip-clean --timeout 60

# Edge binary smoke test
crates/target/release/sy-edge status
crates/target/release/sy-edge start --port 19999 &
curl -s http://localhost:19999/health | python3 -m json.tool
kill %1
```

---

## Coverage Improvement Plan

| Crate | Current | Target | What to add |
|-------|---------|--------|-------------|
| sy-sandbox | 76.2% | 80% | cgroup memory parsing with mock `/proc` content; Landlock proc file parsing |
| sy-hwprobe | 56.0% | 60% | Extract AMD sysfs parsing into testable functions; add `rocm-smi` output mocking |
| sy-edge | 37.1% | 50% | `#[tokio::test]` async handler tests with in-memory `AppState`; mock HTTP for LLM/messaging |
