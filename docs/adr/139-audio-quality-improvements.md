# ADR 139: Audio Quality Improvements (Phase 58)

**Date**: 2026-02-26
**Status**: Accepted

---

## Context

The multimodal audio pipeline had three friction points discovered during real usage:

1. **TTS overhead**: `POST /api/v1/multimodal/audio/speak` returned `{ audioBase64, format, durationMs }` — every response carried a ~33% base64 inflation penalty. Integration bots and long TTS jobs transferred several MB of wasted encoding.

2. **Silent/bad audio reaching Whisper**: The STT endpoint accepted any base64 blob. Silent recordings, voice-memo clips captured before the mic opened, and clipped audio all reached the Whisper API producing empty or garbage transcripts, costing quota and adding latency.

3. **Whisper model locked at startup**: `stt.model` in `secureyeoman.yaml` (default `whisper-1`) could only be changed by restarting the container. Local deployments using Voicebox or OpenedAI Speech often want `tiny` (fastest) or `large-v3` (most accurate) depending on workload.

---

## Decision

### Item 1: Streaming TTS Binary Route

Add `POST /api/v1/multimodal/audio/speak/stream` that returns raw binary audio instead of base64 JSON.

**Key choices:**
- **Separate route** (not replacing `/speak`) so existing consumers (integrations, bots) are not broken. The old JSON endpoint remains.
- **OpenAI path pipes `arrayBuffer()` directly** — no base64 roundtrip at all. For a 30s clip this saves ~1 MB of encoding and parsing work.
- **Other providers** (voicebox, elevenlabs, deepgram, etc.) already buffer their responses internally (they call `res.arrayBuffer()` then `.toString('base64')`). For the stream route, we simply `Buffer.from(b64result.audioBase64, 'base64')` — same memory cost, but the client gets binary instead of JSON with base64 string.
- `Content-Type` is set per-format (`audio/mpeg` for mp3, `audio/ogg; codecs=opus` for opus, `audio/flac`, `audio/aac`, `audio/wav`). `Content-Length` is set from buffer size. `X-Duration-Ms` is included for client-side latency tracking.
- Dashboard adds `synthesizeSpeechStream()` which uses raw `fetch` → `.blob()` → `URL.createObjectURL()`, returning a blob URL suitable for `new Audio(url).play()`.

**Not done (deferred):**
- True streaming/chunked transfer encoding from provider to client. OpenAI does support streaming audio, but chunking the server-to-client path adds significant complexity (SSE or chunked HTTP, Fastify streaming API) without changing the user-facing interface. Deferred to a future phase if latency becomes a bottleneck.

### Item 2: Audio Validation Before STT

Add `validateAudioBuffer(buf, format)` in the STT route handler, executed after schema parse and before the manager call.

**Validation rules chosen:**
- **Universal: `< 1000` bytes** — catches completely truncated or empty payloads before any format-specific parsing.
- **WAV: RIFF header parse** — channels, sample rate, bits per sample at fixed offsets 22, 24, 34, 40. Division by zero guard for malformed headers.
- **WAV: duration 2–30s** — 2s is the practical minimum for Whisper to produce meaningful output. 30s is a soft cap; the hard limit is the 20MB `MAX_BASE64_LENGTH` in the manager. A 30s clip at 16kHz 16-bit mono is ~960 KB — well within budget, but longer recordings are usually better split.
- **WAV: RMS < 0.01** → `audio_too_quiet` — computed on the first 10s of 16-bit PCM samples (capped so large files don't block). 0.01 RMS (−40 dBFS) is well below any useful speech level.
- **WAV: peak ≥ 0.99** → `audio_clipped` — 32767/32768 amplitude. Clipped audio produces harsh artefacts and Whisper often misrecognizes it.

**Error code format**: `<code>: <human message>` returned in the `message` field of the standard `sendError` 422 response. This allows clients to branch on the prefix without parsing free text.

**Format scope**: Only WAV gets structural validation because WAV is the dominant format from our VAD/push-to-talk pipeline and has a well-defined header. Compressed formats (ogg, mp3, flac) require codec libraries to validate — out of scope here. They still get the universal size check.

### Item 3: Whisper Model Size Selection

**Resolution chain** (highest to lowest priority):
`WHISPER_MODEL` env var → `prefsStorage` key `multimodal.stt.model` → `config.stt.model` (default `whisper-1`)

**Rationale for this order:**
- Env var allows deployment-level pinning (e.g., `WHISPER_MODEL=large-v3` in docker-compose for a high-accuracy node).
- `prefsStorage` allows runtime changes via UI or API without restart.
- Config default provides a stable baseline.

**Route**: `PATCH /api/v1/multimodal/model` with `{ type: 'stt' | 'tts', model: string }`. Supports both STT and TTS model runtime updates for symmetry, even though the primary use case is STT/Whisper sizing.

**`detectAvailableProviders()` returns `stt.model`** so the dashboard can show the current effective model without a separate endpoint.

**Dashboard model selector:**
- Local providers (voicebox, openedai): `<select>` with `tiny | base | small | medium | large | large-v2 | large-v3`. These are the standard Whisper model sizes and are the only meaningful choices when running Whisper locally.
- OpenAI: static `whisper-1` chip (non-interactive). OpenAI only exposes this single model via the API; showing a selector would mislead users.
- No model selector for TTS providers in the dashboard UI — TTS model selection is less nuanced (usually `tts-1` vs `tts-1-hd`) and can be set via config or env var.

---

## Consequences

**Positive:**
- Streaming TTS eliminates ~33% overhead on the wire and avoids a JSON parse for audio playback.
- Audio validation provides fast, clear errors before any Whisper quota is consumed.
- Whisper model size is now adjustable at runtime — no container restart required for local STT deployments to switch between speed and accuracy modes.

**Negative / trade-offs:**
- Two TTS endpoints exist (`/speak` and `/speak/stream`). Clients must choose; existing integrations are unaffected.
- WAV validation only — non-WAV formats still pass through to Whisper without pre-validation. Acceptable given WAV is the primary format from our push-to-talk pipeline.
- The 30s hard cap on WAV validation is arbitrary. Long-form transcription users must split audio or use a non-WAV format (which skips the WAV-specific check).

---

## Alternatives Considered

- **Replace `/speak` with binary response**: Breaking change for all existing consumers. Rejected.
- **Validate all compressed formats**: Would require adding `fluent-ffmpeg` or similar. Deferred.
- **SSE streaming from OpenAI to client**: Correct long-term solution but requires a Fastify streaming handler rewrite. Deferred.
- **Client-side Whisper model config only**: Env var or `secureyeoman.yaml` is inconvenient for runtime tuning of local deployments. Runtime `PATCH` is more ergonomic.
