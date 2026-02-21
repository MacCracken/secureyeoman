# ADR 083 — Device Control MCP Prebuilt: Local Peripheral Access via mcp-device-server

**Date**: 2026-02-21
**Status**: Accepted

---

## Context

SecureYeoman's existing device-related capabilities are limited to two categories:

1. **Smart home devices** — via the Home Assistant MCP prebuilt (ADR 081), which covers IoT entities (lights, sensors, switches) through HA's `/api/mcp` endpoint.
2. **Cloud-mediated A/V** — via the Multimodal MCP tools (`multimodal_speak`, `multimodal_transcribe`, `multimodal_analyze_image`), which route audio and vision through external AI APIs rather than local hardware.

A gap exists for **directly attached peripherals**: USB webcams, local printers, onboard microphones, and speakers. These are common in agentic workflows such as:

- Capturing a photo from a webcam during a scheduled check-in
- Printing a document as part of an end-to-end automation
- Recording a short audio clip from the system microphone
- Taking a screen recording of a process for later analysis

The [`mcp-device-server`](https://github.com/akshitsinha/mcp-device-server) project provides an MIT-licensed Python MCP server with 18+ tools across four categories (camera, printer, audio, screen). It uses `fastmcp` ≥ 2.4.0, `opencv-python`, `pyaudio`, `mss`, and `ffmpeg` — a well-known set of cross-platform peripheral libraries.

---

## Decision

Add **Device Control** as a one-click `stdio` MCP prebuilt in `McpPrebuilts.tsx`, using `uvx mcp-device-server` as the run command.

### Why a prebuilt rather than a native integration?

The `mcp-device-server` project is a Python-based server that communicates exclusively over stdio MCP. There is no bidirectional messaging loop, no platform API to adapt, and no `UnifiedMessage` interface to satisfy. The MCP prebuilt pattern is the correct abstraction: connect once via the existing MCP client infrastructure, get all hardware tools.

A native TypeScript reimplementation would require:
- `node-webcam` / `opencv4nodejs` for camera (complex native bindings, OS-specific)
- `node-printer` for printing (Windows/macOS/CUPS differences)
- `node-record-lpcm16` / `portaudio` bindings for audio
- `ffmpeg` subprocess management for screen recording

This is significant maintenance burden for functionality that `mcp-device-server` already handles correctly across macOS, Linux, and Windows.

### Tool surface provided

| Category | Tools |
|----------|-------|
| **Camera** | `camera_list`, `camera_info`, `camera_capture`, `camera_record_start`, `camera_record_stop` |
| **Printer** | `printer_list`, `printer_print`, `printer_convert_pdf`, `printer_job_list`, `printer_job_cancel` |
| **Audio** | `audio_input_list`, `audio_output_list`, `audio_record_start`, `audio_record_stop`, `audio_play` |
| **Screen** | `screen_list`, `screen_capture`, `screen_record_start`, `screen_record_stop` |

### Differentiation from existing tools

| Capability | Existing coverage | Device Control adds |
|---|---|---|
| Webcam capture | None | Direct local hardware capture |
| Printer management | None | List printers, print files, cancel jobs |
| Microphone recording | `multimodal_transcribe` (cloud API) | Raw hardware recording to local file |
| Audio playback | `multimodal_speak` (cloud TTS) | Play any local audio file through speakers |
| Screenshot | `browser_screenshot` (Playwright) | Direct display capture without browser |
| Screen recording | None | Video recording of display output |

### Runtime and configuration

- **Command**: `uvx mcp-device-server`
- **Transport**: stdio
- **Required env vars**: none — device server auto-detects connected peripherals
- **Optional feature flags** (not surfaced in UI, configurable via shell env if needed): `ENABLE_CAMERA`, `ENABLE_PRINTER`, `ENABLE_AUDIO`, `ENABLE_SCREEN`
- **System prerequisites**: `uv` (Python package manager), `ffmpeg`, `PortAudio` — surfaced in the UI via the `note` field (same pattern as ADR 082)

### No env vars in the prebuilt form

Unlike every other prebuilt, Device Control requires no API keys or URLs. The `requiredEnvVars: []` empty array is valid per the `PrebuiltServer` interface and results in a two-step UX: the first "Connect" click expands the form to show the prerequisite note; the second click submits. No validation errors can occur from an empty env.

---

## What was NOT added and why

| Alternative | Decision | Reason |
|---|---|---|
| **Native TypeScript tools** | Not added | Cross-platform native bindings are high maintenance; mcp-device-server handles this already |
| **Google Home / SmartThings** | Not added | No officially maintained MCP server packages; demand unclear |
| **Sonos / LIFX** | Not added | Covered more holistically by Home Assistant if entities are exposed |
| **Feature-flag env var inputs** | Not added | All features enabled by default; optional vars are for advanced users who can set them in their shell |

---

## Consequences

- `PREBUILT_SERVERS` in `McpPrebuilts.tsx` grows from 12 to 13 entries
- Device Control is positioned between Qdrant and Home Assistant — all local/infrastructure-adjacent prebuilts grouped at the end of the list
- No backend changes; the server connects via the existing MCP client stdio infrastructure
- Users must install system dependencies (`uv`, `ffmpeg`, `portaudio`) before connecting — surfaced in the UI note
- The empty `requiredEnvVars` pattern is established as valid for credential-free prebuilts

---

## Related

- [ADR 004 — MCP Protocol](004-mcp-protocol.md)
- [ADR 046 — MCP Prebuilts](046-phase11-mistral-devtools-mcp-prebuilts.md)
- [ADR 081 — Home Assistant MCP prebuilt](081-twitter-ha-coolify-integrations.md)
- [ADR 082 — Meilisearch & Qdrant prebuilts](082-semantic-search-mcp-prebuilts.md)
