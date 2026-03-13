# ADR 040: Shruti DAW — Ecosystem Integration

**Status**: Proposed
**Date**: 2026-03-12

## Context

Shruti is a Rust-native Digital Audio Workstation built as the primary audio workstation for the Agnosticos ecosystem. It is at MVP v1 maturity (2026.3.11-0) with:

- Real-time audio engine (cpal, lock-free graph, cross-platform)
- 6 DSP effects, 3 virtual instruments (subtractive synth, drum machine, sampler)
- Multi-track session management with SQLite persistence and full undo/redo
- Plugin hosting (VST3, CLAP, native Rust)
- GPU-accelerated UI (egui/eframe)
- **Agent API** (`shruti-ai` crate): 35+ structured JSON methods, 6 MCP tool definitions, voice intent parser
- 723 tests, 0 clippy warnings, 0 audit vulnerabilities

Shruti already defines MCP tools following the daimon/Agnosticos pattern but has **no HTTP server** — the AgentApi is an in-process Rust API. SecureYeoman cannot call it without a network transport layer.

SecureYeoman's ecosystem currently has 7 services (Agnostic, AGNOS, Synapse, Delta, BullShift, Photisnadi, Aequi). Adding Shruti brings music production, audio recording/editing, spectral analysis, and AI-assisted mixing as first-class agent capabilities.

## Decision

### 1. Shruti HTTP API Wrapper (Shruti-side)

Shruti needs a lightweight HTTP server exposing its AgentApi over the network. This lives in the Shruti repo (not SY).

**Proposed**: `shruti serve --port 8050` subcommand that wraps `AgentApi` in an Actix-web or Axum server:

| Endpoint | Maps To |
|----------|---------|
| `GET /health` | Version, uptime, active session info |
| `POST /api/v1/session/{action}` | create, open, save, info |
| `POST /api/v1/tracks/{action}` | add, list, gain, pan, mute, solo, add_region |
| `POST /api/v1/transport/{action}` | play, stop, pause, seek, set_tempo |
| `POST /api/v1/export` | WAV/FLAC export with format options |
| `POST /api/v1/analysis/{type}` | spectrum, dynamics, auto_mix, composition |
| `POST /api/v1/mixer/{action}` | gain, pan, mute, solo, add_effect |
| `POST /api/v1/undo` | Undo last edit |
| `POST /api/v1/redo` | Redo last undo |
| `POST /api/v1/mcp/tool-call` | Direct MCP tool dispatch |

Auth: Bearer token (API key), validated locally or delegated to parent SY.

### 2. SY Ecosystem Service Registration

Add Shruti as the 8th ecosystem service in `service-discovery.ts`:

```typescript
{
  id: 'shruti',
  displayName: 'Shruti DAW',
  description: 'Rust-native digital audio workstation with AI-assisted music production',
  urlEnv: 'SHRUTI_URL',
  defaultUrl: 'http://127.0.0.1:8050',
  healthPath: '/health',
  requiredSecrets: ['SHRUTI_API_KEY'],
  mcpConfigKey: 'exposeShrutiTools',
}
```

### 3. SY Integration Client

`integrations/shruti/shruti-client.ts` — HTTP client wrapping Shruti's REST API:

| Method | Description |
|--------|-------------|
| `createSession(name, sampleRate, channels)` | Create a new audio session |
| `openSession(path)` | Open existing session |
| `saveSession()` | Persist session to disk |
| `sessionInfo()` | Current session metadata |
| `addTrack(name, type)` | Add audio/MIDI/bus/instrument track |
| `listTracks()` | List all tracks with state |
| `setTrackGain(trackIndex, gainDb)` | Set track volume |
| `setTrackPan(trackIndex, pan)` | Set stereo position |
| `muteTrack(trackIndex)` / `soloTrack(trackIndex)` | Mute/solo |
| `addRegion(trackIndex, filePath, position)` | Place audio on timeline |
| `transport(action)` | Play/stop/pause |
| `seek(position)` | Seek to frame/bar |
| `setTempo(bpm)` | Set session tempo |
| `exportAudio(path, format, bitDepth)` | Bounce session to file |
| `analyzeSpectrum(trackIndex, fftSize)` | FFT analysis |
| `analyzeDynamics(trackIndex)` | Peak/RMS/LUFS |
| `autoMixSuggest()` | AI mixing suggestions |
| `compositionSuggest()` | AI composition suggestions |
| `undo()` / `redo()` | Edit history navigation |

### 4. MCP Tools (10 tools)

`mcp/tools/shruti-tools.ts` — gated by `exposeShrutiTools` / `MCP_EXPOSE_SHRUTI_TOOLS`:

| Tool | Description |
|------|-------------|
| `shruti_session_create` | Create a new audio session with name, sample rate, channels |
| `shruti_session_open` | Open an existing session by path |
| `shruti_track_add` | Add a track (audio, MIDI, bus, instrument) |
| `shruti_track_list` | List all tracks with gain, pan, mute, solo state |
| `shruti_region_add` | Place an audio file on a track at a timeline position |
| `shruti_transport` | Control playback (play, stop, pause, seek, set tempo) |
| `shruti_export` | Export/bounce session to WAV or FLAC |
| `shruti_analyze` | Run spectral or dynamics analysis on a track |
| `shruti_mix` | Set track gain, pan, mute, solo, or get auto-mix suggestions |
| `shruti_edit` | Undo, redo, split region, trim, fade, move |

### 5. Docker Compose

```yaml
shruti:
  image: ghcr.io/maccracken/shruti:latest
  profiles: [shruti, full-dev]
  ports:
    - "8050:8050"
  environment:
    SHRUTI_API_KEY: ${SHRUTI_API_KEY:-}
    SHRUTI_DATA_DIR: /data
  volumes:
    - shruti-data:/data
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8050/health"]
    interval: 30s
    timeout: 5s
    retries: 3
```

### 6. Capabilities Shruti Brings to SY Agents

| Capability | What It Enables |
|------------|-----------------|
| **Audio recording** | Agents can record audio input, create sessions, manage takes |
| **Multi-track editing** | Non-destructive timeline editing, region manipulation, undo/redo |
| **Mixing & mastering** | Gain staging, panning, effects (EQ, compression, reverb, delay, limiting) |
| **Spectral analysis** | FFT-based frequency analysis, peak detection, spectral centroid |
| **Dynamics analysis** | Peak, RMS, true peak, crest factor, LUFS (EBU R128), dynamic range |
| **AI-assisted mixing** | Auto-mix suggestions (gain staging, pan spread, EQ recommendations) |
| **AI-assisted composition** | Structure, instrumentation, and tempo suggestions |
| **Virtual instruments** | Polyphonic synth (23 params), drum machine (16 pads, step sequencer), sampler |
| **Plugin hosting** | Load VST3/CLAP plugins for additional effects and instruments |
| **Voice control** | Natural language commands (play, stop, mute track 2, set tempo 120) |
| **Export** | Bounce to WAV/FLAC at 16/24/32-bit, 44.1–192 kHz |

### 7. Voice Integration with SY Voice Platform

Shruti's voice intent parser and SY's voice platform (Phase 146) can be bridged:

- SY's STT providers (faster-whisper, etc.) transcribe user speech
- Transcription forwarded to Shruti's `parse_voice_input()` for DAW-specific intents
- Results executed via AgentApi
- SY's TTS providers speak back confirmation ("Track 2 muted", "Tempo set to 120 BPM")

This enables fully voice-driven music production through SY agents.

## Consequences

- Shruti becomes the 8th ecosystem service (port 8050)
- `EcosystemServiceId` type union gains `'shruti'`
- 10 new MCP tools (total ~441+)
- New `integrations/shruti/` directory in SY core
- Shruti repo needs HTTP server implementation (Shruti-side work, not SY)
- Dashboard ecosystem panel gains Shruti card with enable/disable toggle
- Agents gain full music production capabilities — a unique differentiator

## Alternatives Considered

1. **Embed Shruti as a Rust library via FFI/NAPI** — Rejected: adds native compilation complexity, breaks bun bundling, Shruti is designed as a standalone app
2. **Use only Shruti's MCP tools without ecosystem integration** — Rejected: loses service discovery, health monitoring, secrets management, dashboard visibility
3. **Wait for Shruti to build its own HTTP server first** — Partially adopted: the SY integration client is designed against the proposed API, but actual integration requires the Shruti HTTP server to exist

## Migration

- No breaking changes to existing ecosystem
- New service added to `SERVICE_REGISTRY` array (additive)
- `exposeShrutiTools` config field added to `McpServiceConfig` (defaults to false)
- Docker compose profile `shruti` is opt-in
