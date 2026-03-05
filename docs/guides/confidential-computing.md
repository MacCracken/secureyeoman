# Confidential Computing & TEE Guide

SecureYeoman supports TEE (Trusted Execution Environment) aware AI provider selection, ensuring sensitive workloads only run on providers with verified confidential computing capabilities.

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
3. Results are cached per the configured TTL
4. If verification fails:
   - `block`: Throws `ProviderUnavailableError` → AIClient tries the next fallback
   - `warn`/`audit_only`: Request proceeds with appropriate logging
5. **ModelRouter** also filters candidates by TEE compliance when `confidentialCompute: 'required'` is set in routing options

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

## Future: Remote Attestation (Phase 129)

Phase 129 will add actual remote attestation verification:
- Azure MAA (Microsoft Azure Attestation)
- NVIDIA RAA (Remote Attestation API for H100/H200 CC mode)
- AWS Nitro Enclave attestation documents
- SGX/SEV sandbox backends for code execution
- Encrypted model weights with TEE-sealed storage

## Related

- [ADR 002 — Security Architecture](../adr/002-security-architecture.md)
- [Security Model](../security/security-model.md)
- [Roadmap — Phase 129](../development/roadmap.md)
