# ADR 084 — Multimodal Provider Abstraction: Voicebox + ElevenLabs

**Date**: 2026-02-21
**Status**: Accepted

---

## Context

A review of the [Voicebox](https://github.com/jamiepine/voicebox) project (8.4k stars, MIT licence) revealed a significant gap in SecureYeoman's multimodal I/O stack:

**Current state**: `MultimodalManager.transcribeAudio()` and `synthesizeSpeech()` are hardwired to OpenAI Whisper and OpenAI TTS respectively. There is no way to use an alternative provider without modifying source code. This creates three problems:

1. **Privacy / offline use** — all audio goes to OpenAI, even in air-gapped or privacy-sensitive deployments.
2. **Cost** — OpenAI TTS and Whisper are metered; local inference is free after model download.
3. **Voice quality / cloning** — OpenAI offers 6 preset voices with no cloning capability; Voicebox provides Qwen3-TTS with high-fidelity voice cloning from a 2-30s reference audio sample.

**Voicebox** is a local-first voice synthesis studio that runs a FastAPI server at `localhost:17493`. It exposes:
- `POST /generate` — Qwen3-TTS synthesis with optional voice profile cloning
- `GET /audio/{id}` — Serve generated audio
- `POST /transcribe` — Whisper-based STT (MLX on Apple Silicon, PyTorch elsewhere)

**ElevenLabs** provides a first-party MCP server (`@elevenlabs/mcp`) offering 3,000+ voices, voice cloning, and 32 languages as MCP tools — complementing Voicebox at the cloud-quality end.

---

## Decision

### 1. TTS/STT provider abstraction in `MultimodalManager`

Add env-var-based provider routing to `transcribeAudio()` and `synthesizeSpeech()`:

| Env var | Values | Default |
|---------|--------|---------|
| `TTS_PROVIDER` | `openai` \| `voicebox` | `openai` |
| `STT_PROVIDER` | `openai` \| `voicebox` | `openai` |
| `VOICEBOX_URL` | Base URL for Voicebox server | `http://localhost:17493` |
| `VOICEBOX_PROFILE_ID` | Voicebox voice profile UUID (required when `TTS_PROVIDER=voicebox`) | — |

Env vars take precedence over `config.tts.provider` / `config.stt.provider` from the config object, allowing runtime override without a restart for environments that support hot env reload.

**Why env vars rather than a runtime PATCH API?**
A runtime settings write path would require: a new DB column or config file write, a PATCH endpoint, RBAC gating, and audit logging. The env var approach is minimal-scope for Phase A; a full interactive runtime picker with connection-awareness is deferred to the roadmap (see Consequences).

### 2. Provider info surfaced in the config endpoint

`GET /api/v1/multimodal/config` now returns a `providers` object alongside the existing config:

```json
{
  "providers": {
    "tts": { "active": "openai", "available": ["openai", "voicebox"], "voiceboxUrl": "..." },
    "stt": { "active": "openai", "available": ["openai", "voicebox"], "voiceboxUrl": "..." }
  }
}
```

### 3. Provider status card in `MultimodalPage`

A read-only **Speech Providers** card is added above the job stats, showing:
- Active TTS and STT providers (highlighted badge)
- All available providers (dimmed badges)
- Env var hint for switching (`TTS_PROVIDER=voicebox`)

This fulfils the UX requirement to show users which provider is active without requiring a full interactive picker in Phase A.

### 4. ElevenLabs MCP prebuilt

`@elevenlabs/mcp` is added to `McpPrebuilts.tsx` as a standard `stdio` prebuilt requiring `ELEVENLABS_API_KEY`. This provides cloud-quality voice cloning via Claude's tool layer, complementary to Voicebox's local inference path.

### Why Voicebox specifically?

| Criterion | Voicebox | Whisper.cpp (alternative) | Piper (alternative) |
|---|---|---|---|
| TTS quality | High (Qwen3-TTS 1.7B) | N/A | Medium |
| Voice cloning | ✅ From 2-30s sample | ❌ | ❌ |
| STT | ✅ Whisper backend | ✅ | ❌ |
| REST API | ✅ Native FastAPI | ❌ Custom build | ❌ |
| Active maintenance | ✅ 8.4k stars, daily commits | ✅ | Limited |
| Mac acceleration | ✅ MLX (4-5x faster) | Partial | ❌ |

Voicebox is the only option that covers both TTS (with cloning) and STT under a single local server with an existing REST API that maps cleanly to the existing `MultimodalManager` interface.

---

## What was NOT added and why

| Item | Decision | Reason |
|---|---|---|
| **Runtime provider picker** (interactive UI) | Deferred to roadmap | Requires settings write path + RBAC + audit; out of scope for Phase A |
| **Voicebox as MCP prebuilt** | Not added | Voicebox is a REST API server, not an MCP server; it integrates via provider routing in the manager, not the MCP client |
| **ElevenLabs as TTS_PROVIDER** | Not added | ElevenLabs integrates via MCP tools (multimodal_speak equivalent), not via the MultimodalManager provider routing |
| **Whisper.cpp direct** | Not added | Voicebox already bundles Whisper; duplicate effort |
| **Google TTS / Azure Speech** | Not added | No demonstrable user demand; add when requested |

---

## Consequences

- `transcribeAudio()` and `synthesizeSpeech()` now branch on env var — existing OpenAI path is unchanged; no regression risk
- `VOICEBOX_PROFILE_ID` is required when `TTS_PROVIDER=voicebox` — server will throw a clear error if missing
- Config endpoint shape changes (additive) — `providers` field is new; no breaking change for existing clients
- `MultimodalPage` imports `fetchMultimodalConfig` (already defined in API client) and renders `ProviderCard`
- `McpPrebuilts` grows from 13 to 14 entries
- 7 new tests in `manager.test.ts` cover voicebox routing, error cases, and URL normalisation
- **Roadmap**: Interactive provider picker with live connection detection (is voicebox running? is ElevenLabs MCP connected?) goes to Future Features

---

## Related

- [ADR 041 — Multimodal I/O](041-multimodal-io.md)
- [ADR 046 — MCP Prebuilts](046-phase11-mistral-devtools-mcp-prebuilts.md)
- [ADR 083 — Device Control MCP Prebuilt](083-device-control-mcp-prebuilt.md)
