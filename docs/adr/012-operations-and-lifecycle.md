# ADR 012: Operations & Lifecycle

## Status

Accepted

## Context

This ADR consolidates operational decisions governing the CLI experience, audio pipeline, audit log export, and job completion notifications.

## Decisions

### CLI

**Shell Completions.** `secureyeoman completion <shell>` prints static completion scripts for bash, zsh, and fish. Full command/subcommand/flag map embedded. No runtime introspection required.

**Configuration Validation.** `secureyeoman config validate` provides pass/fail check: validates structure, checks required secrets, reports with colored markers, exits 0/1, supports `--json`.

**Plugin Management.** `secureyeoman plugin` with `list`, `info`, `add`, `remove` actions. Validates plugin exports (`platform`, `createIntegration`) on add. Restart required after changes.

**Rich Output.** `colorContext(stream)` respects NO_COLOR standard and TTY detection. Minimal braille spinner animation. All commands support `--json` for scripting.

### Audio

**Streaming TTS.** `POST /api/v1/multimodal/audio/speak/stream` returns raw binary audio, eliminating ~33% base64 inflation. `Content-Type` per format, `X-Duration-Ms` header. Original `/speak` preserved.

**Audio Validation.** `validateAudioBuffer()` before STT: universal 1,000-byte minimum, WAV-specific header parse (channels, sample rate, duration 2-30s, RMS/peak thresholds). Compressed formats receive size check only.

**Runtime Whisper Model Selection.** Priority chain: `WHISPER_MODEL` env var, `prefsStorage` key, config default. `PATCH /api/v1/multimodal/model` enables runtime changes.

### Audit Export

`POST /api/v1/audit/export` streams audit data via `reply.raw.write()` with no full-dataset buffering. Formats: JSONL, CSV, syslog RFC 5424. Filtering by date range, level, event, user, limit (cap: 1 million). `Content-Disposition: attachment` with appropriate MIME type.

### Notifications

**Job Completion Notifications.** `emitJobCompletion()` builds synthetic metric snapshots using `jobs.<type>.<status>.<field>` namespace and passes to `alertManager.evaluate()`. Reuses existing metric path resolution and comparison. Failed jobs include `error: 1` sentinel.

**ntfy Channel.** Fifth alert channel alongside Slack, PagerDuty, OpsGenie, webhook. Plain-text POST with `Title`, `Priority`, `Tags` headers. Optional Bearer authentication.

**Dashboard Templates.** Seven pre-built rule templates across Workflows, Training, and Security categories via "From template" dropdown.

### Responsible AI (Phase 130)

**Cohort Error Analysis.** `POST /api/v1/responsible-ai/cohort-analysis` slices eval run results by dimension (topic_category, user_role, time_of_day, personality_id, model_name, language, custom). Groups eval scores, computes per-cohort error rates (avg < 3.0 = error), sorts worst-first. Stored in `responsible_ai.cohort_analyses` with JSONB slices.

**Fairness Metrics.** `POST /api/v1/responsible-ai/fairness` computes demographic parity (max positive-rate difference), equalized odds (max TPR difference), and disparate impact ratio (min/max positive-rate). Threshold defaults to 0.8 (four-fifths rule). Stored in `responsible_ai.fairness_reports`.

**SHAP Token Attribution.** `POST /api/v1/responsible-ai/shap` computes leave-one-out perturbation-based attributions for each input token. Optionally uses AI client for scoring; falls back to length-based heuristic. Normalized to sum 1.0. Stored in `responsible_ai.shap_explanations`.

**Data Provenance.** Tracks every conversation's inclusion/exclusion in training datasets. Four statuses: included, filtered (with reason), synthetic, redacted. Batch insert for curation pipelines. `GET /provenance/user/:id` answers "was this user's data used in training?" `POST /provenance/redact/:id` marks records as redacted for GDPR right-to-erasure. Stored in `responsible_ai.provenance_entries`.

**Model Cards.** Auto-generated structured cards aligned with Hugging Face Model Card format and EU AI Act transparency requirements. Includes: intended use, limitations, ethical considerations, training data summary, evaluation results, fairness assessment, risk classification (minimal/limited/high/unacceptable). Markdown rendering via `GET /model-cards/:id/markdown`. Stored in `responsible_ai.model_cards`.

**RBAC.** `responsible_ai` resource added to PREFIX_RESOURCE_MAP. Operator: read+write. Auditor: read-only.

### Confidential Computing — TEE Full Stack (Phase 129)

**Remote Attestation Providers.** Three pluggable `RemoteAttestationProvider` implementations registered via `TeeAttestationVerifier.registerRemoteProvider()`:
- **Azure MAA** (`azure-maa.ts`): POST to `{tenantUrl}/attest/SgxEnclave`, parse JWT attestation token, validate `x-ms-attestation-type` and `x-ms-policy-signer` claims. 5s timeout via AbortSignal.
- **NVIDIA RAA** (`nvidia-raa.ts`): POST to NVIDIA Local GPU Attestation REST API. Parse `confidential_compute_mode`, `driver_version`, `gpu_uuid` from response. Validates CC mode is active.
- **AWS Nitro** (`aws-nitro.ts`): Read attestation document from `/dev/nsm`. Minimal CBOR decoder (no npm dependency) parses COSE_Sign1 structure. Extract and validate PCR values against expected measurements.

**Async Attestation.** `TeeAttestationVerifier.verifyAsync()` provides async remote attestation path alongside existing sync `verify()`. Bounded attestation history (100 per provider) via `getAttestationHistory()`. Static `detectHardware()` probes `/dev/sgx_enclave`, `/dev/sev`, `/dev/tpm0`, and `nvidia-smi` for CC mode.

**TEE Sandbox Backends.** Two new `Sandbox` implementations following the existing GVisor pattern:
- **SGX** (`sgx-sandbox.ts`): Detects `/dev/sgx_enclave` or `/dev/isgx` + Gramine binary. Executes via `gramine-sgx` manifest. Falls back to in-process execution.
- **SEV** (`sev-sandbox.ts`): Detects `/dev/sev` + `qemu-system-x86_64`. Launches SEV-SNP micro-VM. Falls back to in-process execution.
`SandboxManager` technology enum extended with `'sgx' | 'sev'`. `SandboxCapabilities` extended with `sgx`, `sev`, `tpm` booleans.

**Encrypted Model Weights.** `TeeEncryptionManager` provides AES-256-GCM encryption for model weight files. Wire format: `SEALED_V1 (8 bytes) || iv (12) || authTag (16) || keySourceTag (1) || ciphertext`. Three key sources: `tpm` (via `tpm2_unseal`), `tee` (stub — requires SGX sealing), `keyring` (env var `SECUREYEOMAN_MODEL_ENCRYPTION_KEY`). Key cache with manual clear.

**Confidential GPU Detection.** `tee-gpu.ts` provides `detectConfidentialGpu()` (runs `nvidia-smi` query for CC mode), `isGpuConfidential()`, and `blockNonConfidentialGpu()` (throws when `confidentialCompute: 'required'` and GPU is not in CC mode).

**Confidential Pipeline.** `ConfidentialPipelineManager` provides end-to-end chain-of-custody for TEE operations. `createConfidentialRequest()` generates a nonce, starts attestation chain with SHA-256 hash links, and verifies provider attestation. `verifyConfidentialResponse()` completes the chain with cryptographic proof. `getChainOfCustody()` and `listCompletedChains()` for compliance queries. Audit events: `tee_pipeline_start`, `tee_pipeline_attestation`, `tee_pipeline_complete`. Bounded at 1,000 active requests with LRU eviction.

**REST API.** Three routes under `/api/v1/security/tee`: `GET /providers` (list capabilities + hardware detection), `GET /attestation/:provider` (last attestation result), `POST /verify/:provider` (force re-verify). Convention-based RBAC via `security` resource in PREFIX_RESOURCE_MAP.

**MCP Tools.** Three tools feature-gated by `exposeTee` in `McpFeaturesSchema`: `tee_providers`, `tee_status`, `tee_verify`. Added to `manifest.ts` and `index.ts`.

**CLI.** `secureyeoman tee` subcommand with `status`, `verify <provider>`, and `hardware` actions. Aliased as `confidential`.

**Dashboard.** `TeeStatusWidget` with provider table (ShieldCheck/ShieldAlert/ShieldOff icons), hardware detection status, TEE coverage percentage bar, and verify buttons. Canvas registry entry (`'tee-status'`, category: monitoring).

**Marketplace.** "Confidential Computing" builtin skill (category: security, 3 `mcpToolsAllowed`: tee_providers, tee_status, tee_verify). 25 total builtin skills.

**Config.** `TeeConfigSchema` extended with `remoteAttestation` (azureMaa, nvidiaRaa, awsNitro) and `teeHardware` (sgxEnabled, sevEnabled, encryptedModels) sub-objects.

## Consequences

**Positive:**
- Shell completions and `--json` output enable scripting and CI/CD integration.
- Streaming audit export handles millions of entries without OOM.
- Job notifications reuse existing alert infrastructure with zero changes to evaluation loop.
- ntfy provides lightweight self-hosted push notifications.

**Negative:**
- Plugin hot-reload not supported; install-then-restart required.
- WAV-only structural audio validation; compressed format validation deferred.
- Two TTS endpoints exist; clients must choose based on needs.
