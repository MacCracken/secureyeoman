# Confidential Computing & TEE Guide

SecureYeoman supports TEE (Trusted Execution Environment) aware AI provider selection, remote attestation verification, SGX/SEV sandbox execution, encrypted model storage, and end-to-end confidential pipelines with cryptographic chain-of-custody proof.

## Quick Start

Enable TEE-aware routing in your config:

```yaml
security:
  tee:
    enabled: true
    providerLevel: optional    # or 'required' for strict enforcement
    attestationStrategy: cached
    attestationCacheTtlMs: 3600000  # 1 hour
    failureAction: block       # block | warn | audit_only

    # Remote attestation providers (Phase 129)
    remoteAttestation:
      azureMaa:
        enabled: false
        tenantUrl: ''          # e.g. https://myattestation.eus.attest.azure.net
        policyName: ''
      nvidiaRaa:
        enabled: false
        endpoint: ''           # e.g. http://localhost:8080/v1/attest
      awsNitro:
        enabled: false
        rootCaCertPath: ''
        expectedPcrs: {}       # e.g. { "0": "abc...", "1": "def..." }

    # Hardware TEE options
    teeHardware:
      sgxEnabled: false
      sevEnabled: false
      encryptedModels:
        enabled: false
        keySource: keyring     # tpm | tee | keyring
```

## Configuration Levels

TEE requirements can be set at multiple levels. The first non-`off` value wins:

### 1. Security Level (Global Default)

```yaml
security:
  tee:
    enabled: true
    providerLevel: required  # All providers must be TEE-capable
```

### 2. Model Level (Per-Model Override)

```yaml
model:
  provider: anthropic
  model: claude-sonnet-4-20250514
  confidentialCompute: required  # Override for this model config
  fallbacks:
    - provider: ollama
      model: llama3
      confidentialCompute: off   # Local provider, no TEE needed
```

### 3. Personality Level (Per-Personality Override)

In personality body config:

```json
{
  "body": {
    "confidentialCompute": "required"
  }
}
```

## Provider TEE Support

| Provider | TEE Support | Technologies | Notes |
|----------|-------------|--------------|-------|
| Anthropic | Yes | — | Secure infrastructure, no remote attestation API |
| OpenAI | Yes | SGX/SEV-SNP | Via Azure OpenAI Confidential Computing |
| Gemini | Yes | TDX/SEV-SNP | GCP Confidential VMs |
| Ollama | No | — | Local — depends on host hardware |
| LM Studio | No | — | Local |
| LocalAI | No | — | Local |
| DeepSeek | No | — | No public TEE attestation |
| Mistral | No | — | No public TEE attestation |
| Grok | No | — | No public TEE attestation |
| Groq | No | — | No public TEE attestation |
| OpenRouter | No | — | Proxy — depends on upstream |

## Failure Actions

| Action | Behavior |
|--------|----------|
| `block` | Request fails with `ProviderUnavailableError`. Triggers fallback chain to find a TEE-capable provider. |
| `warn` | Logs a warning, allows the request to proceed on non-TEE provider. |
| `audit_only` | Silent allow. Records the TEE bypass in the audit log for compliance review. |

## How It Works

1. **AIClient** calls `verifyTeeCompliance()` before every API request
2. The `TeeAttestationVerifier` checks the provider against the static capability table
3. If remote attestation is configured, `verifyAsync()` contacts the provider's attestation service
4. Results are cached per the configured TTL
5. If verification fails:
   - `block`: Throws `ProviderUnavailableError` → AIClient tries the next fallback
   - `warn`/`audit_only`: Request proceeds with appropriate logging
6. **ModelRouter** also filters candidates by TEE compliance when `confidentialCompute: 'required'` is set in routing options

## Remote Attestation

Remote attestation verifies that the AI provider is actually running inside a TEE by contacting an external attestation service.

### Azure MAA (Microsoft Azure Attestation)

For Azure OpenAI endpoints running on SGX/SEV-SNP Confidential VMs:

```yaml
remoteAttestation:
  azureMaa:
    enabled: true
    tenantUrl: https://myattestation.eus.attest.azure.net
    policyName: default
```

The provider POSTs to the Azure MAA REST API, receives a JWT attestation token, and validates the `x-ms-attestation-type` and `x-ms-policy-signer` claims.

### NVIDIA RAA (Remote Attestation API)

For self-hosted GPU inference on NVIDIA H100/H200 in Confidential Computing mode:

```yaml
remoteAttestation:
  nvidiaRaa:
    enabled: true
    endpoint: http://localhost:8080/v1/attest
```

Queries the NVIDIA Local GPU Attestation REST API and verifies `confidential_compute_mode` is active. Reports GPU UUID and driver version.

### AWS Nitro Enclaves

For AWS-hosted inference running in Nitro Enclaves:

```yaml
remoteAttestation:
  awsNitro:
    enabled: true
    rootCaCertPath: /etc/nitro/root-ca.pem
    expectedPcrs:
      "0": "abc123..."
      "1": "def456..."
```

Reads attestation documents from `/dev/nsm`, parses the COSE_Sign1 structure using a built-in minimal CBOR decoder (no npm dependencies), and validates PCR values against expected measurements.

## SGX/SEV Sandbox Backends

Code execution can run inside hardware TEE sandboxes for maximum isolation.

### Intel SGX (via Gramine)

```yaml
teeHardware:
  sgxEnabled: true
```

Requirements: `/dev/sgx_enclave` or `/dev/isgx` device + Gramine binary installed. Code executes via `gramine-sgx` manifest. Falls back to in-process execution if hardware is unavailable.

### AMD SEV-SNP

```yaml
teeHardware:
  sevEnabled: true
```

Requirements: `/dev/sev` device + `qemu-system-x86_64` installed. Launches a SEV-SNP micro-VM for sandboxed execution. Falls back to in-process execution if hardware is unavailable.

## Encrypted Model Weights

Local model weights can be encrypted at rest with AES-256-GCM, decrypted only inside the TEE boundary.

```yaml
teeHardware:
  encryptedModels:
    enabled: true
    keySource: keyring  # tpm | tee | keyring
```

### Key Sources

| Source | Description | Requirements |
|--------|-------------|--------------|
| `keyring` | Key from `SECUREYEOMAN_MODEL_ENCRYPTION_KEY` env var (64+ hex chars) | Always available |
| `tpm` | Key derived from TPM2 sealed data | `tpm2-tools` installed, `/dev/tpm0` available |
| `tee` | Key from TEE-sealed storage | SGX sealing APIs (stub — not yet implemented) |

### Wire Format

```
SEALED_V1 (8 bytes) || iv (12 bytes) || authTag (16 bytes) || keySourceTag (1 byte) || ciphertext
```

Use the CLI to seal/unseal model files:

```bash
# Set encryption key (keyring source)
export SECUREYEOMAN_MODEL_ENCRYPTION_KEY=$(openssl rand -hex 32)
```

## Confidential GPU Detection

Detects whether local NVIDIA GPUs are running in Confidential Computing mode:

```bash
secureyeoman tee hardware
```

When `confidentialCompute: 'required'` is set, non-CC GPUs are blocked from loading training datasets or running fine-tuning jobs.

## End-to-End Confidential Pipeline

The `ConfidentialPipelineManager` provides cryptographic chain-of-custody proof for TEE operations:

1. **Request creation** — Generates a random nonce, starts a SHA-256 hash chain, verifies provider attestation
2. **Chain links** — Each step (start, attestation, completion) adds a hash link with timestamp
3. **Response verification** — Completes the chain with a final hash, validates monotonic timestamps and attestation results
4. **Compliance query** — `getChainOfCustody(requestId)` returns the full chain for audit

Audit events emitted: `tee_pipeline_start`, `tee_pipeline_attestation`, `tee_pipeline_complete`.

## REST API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/security/tee/providers` | `security:read` | List provider TEE capabilities + hardware detection |
| GET | `/api/v1/security/tee/attestation/:provider` | `security:read` | Last attestation result for a provider |
| POST | `/api/v1/security/tee/verify/:provider` | `security:write` | Force re-verify a provider's attestation |

## MCP Tools

Three tools available when `exposeTee: true` in personality MCP features:

| Tool | Description |
|------|-------------|
| `tee_providers` | List all providers with TEE capabilities and hardware status |
| `tee_status` | Get attestation status for a specific provider |
| `tee_verify` | Force re-verify a provider's TEE attestation |

## CLI

```bash
# Show TEE config, hardware detection, and provider status
secureyeoman tee status

# Force re-verify a specific provider
secureyeoman tee verify openai

# Detect local TEE hardware (SGX, SEV, TPM, NVIDIA CC)
secureyeoman tee hardware
```

Alias: `secureyeoman confidential`.

## Dashboard Widget

The **TEE Status Widget** is available in the Canvas workspace (category: monitoring). It displays:

- Provider table with TEE status badges (ShieldCheck/ShieldAlert/ShieldOff icons)
- Hardware detection status (SGX, SEV, TPM, NVIDIA CC)
- TEE coverage percentage across active providers
- Verify buttons to trigger re-attestation

## Example: Sensitive Data Pipeline

For a personality handling healthcare data:

```json
{
  "name": "HIPAA Analyst",
  "body": {
    "confidentialCompute": "required"
  },
  "defaultModel": {
    "provider": "openai",
    "model": "gpt-4o"
  },
  "modelFallbacks": [
    { "provider": "anthropic", "model": "claude-sonnet-4-20250514" }
  ]
}
```

This ensures only TEE-capable providers (OpenAI via Azure CC, Anthropic) handle requests. If OpenAI is unavailable, it falls back to Anthropic — but never to a non-TEE provider.

## Related

- [ADR 012 — Operations & Lifecycle (Phase 129 section)](../adr/012-operations-and-lifecycle.md)
- [ADR 002 — Security Architecture](../adr/002-security-architecture.md)
- [Security Model](../security/security-model.md)
