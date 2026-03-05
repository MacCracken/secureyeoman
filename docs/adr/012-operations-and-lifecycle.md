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
