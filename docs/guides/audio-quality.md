# Audio Quality Guide

This guide covers the three audio quality features added in Phase 58: streaming TTS, pre-flight audio validation, and runtime Whisper model selection.

---

## Streaming TTS (Binary Route)

### Why use it

`POST /api/v1/multimodal/audio/speak` returns JSON with a base64-encoded audio field. This adds ~33% overhead and requires a JSON parse before playback. The streaming route returns raw binary audio directly.

### Endpoint

```
POST /api/v1/multimodal/audio/speak/stream
Content-Type: application/json

{ "text": "Hello world", "voice": "alloy", "model": "tts-1", "responseFormat": "mp3" }
```

**Response headers:**
| Header | Value |
|--------|-------|
| `Content-Type` | `audio/mpeg` (mp3), `audio/ogg; codecs=opus` (opus), `audio/flac` (flac), `audio/aac` (aac), `audio/wav` (wav) |
| `Content-Length` | Byte length of the audio buffer |
| `X-Duration-Ms` | Server-side synthesis time in milliseconds |

**Response body:** raw audio bytes.

### Dashboard client

```typescript
import { synthesizeSpeechStream } from './api/client';

const blobUrl = await synthesizeSpeechStream({ text: 'Hello world' });
const audio = new Audio(blobUrl);
audio.play();
// Remember to release the object URL when done:
audio.onended = () => URL.revokeObjectURL(blobUrl);
```

### curl example

```bash
curl -X POST http://localhost:4001/api/v1/multimodal/audio/speak/stream \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","responseFormat":"mp3"}' \
  --output /tmp/hello.mp3

file /tmp/hello.mp3  # → MPEG audio data
```

> **Note:** Port 4001 in the examples above is a common local dev proxy port. The core API listens on port 18789 by default — the audio streaming endpoint is part of the core API at `/api/v1/multimodal/audio/speak/stream`. Adjust the port to match your deployment (e.g. `http://localhost:18789/...`).

---

## Audio Validation Before STT

The transcription endpoint validates audio before sending it to Whisper. This prevents wasted API calls from silent, clipped, or too-short recordings.

### Validation rules

| Check | Applies to | Error code | Details |
|-------|-----------|------------|---------|
| Minimum size | All formats | `audio_too_short` | Buffer must be ≥ 1000 bytes |
| WAV header parse | `format: wav` | `audio_too_short` | Buffer must be ≥ 44 bytes and have non-zero channels/sample rate/bit depth |
| Duration too short | `format: wav` | `audio_too_short` | Must be ≥ 2 seconds |
| Duration too long | `format: wav` | `audio_too_long` | Must be ≤ 30 seconds |
| Too quiet | `format: wav` | `audio_too_quiet` | RMS of first 10s must be ≥ 0.01 (~−40 dBFS) |
| Clipped | `format: wav` | `audio_clipped` | Peak of first 10s must be < 0.99 (~32735 / 32768) |

### Error response format (HTTP 422)

```json
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "message": "audio_too_quiet: audio level too low (RMS < 0.01)"
}
```

The `message` field always starts with the error code prefix, making it easy to branch on programmatically:

```typescript
try {
  await transcribeAudio({ audioBase64, format: 'wav' });
} catch (err) {
  if (err.message.startsWith('audio_too_quiet')) {
    showToast('Microphone level too low — please speak louder');
  } else if (err.message.startsWith('audio_too_short')) {
    showToast('Recording too short — hold the button for at least 2 seconds');
  }
}
```

### Format scope

Only WAV receives full structural + quality validation. Compressed formats (ogg, mp3, flac, webm) receive only the universal size check because their internal structure requires a codec library to validate. WAV is the primary format produced by our push-to-talk and VAD pipeline.

---

## Whisper Model Size Selection

For local STT providers (Voicebox, OpenedAI Speech), you can select the Whisper model size at runtime to trade off speed vs. accuracy.

### Model options

| Model | Speed | Accuracy | VRAM | Best for |
|-------|-------|----------|------|----------|
| `tiny` | ~10× realtime | Low | ~40 MB | Real-time transcription, fast hardware |
| `base` | ~7× realtime | Fair | ~70 MB | Low-latency with acceptable accuracy |
| `small` | ~4× realtime | Good | ~240 MB | Balanced default for local setups |
| `medium` | ~2× realtime | Very good | ~770 MB | High-accuracy, slower |
| `large` | ~1× realtime | Excellent | ~1.5 GB | Maximum accuracy |
| `large-v2` | ~1× realtime | Excellent | ~1.5 GB | Improved large |
| `large-v3` | ~1× realtime | Best | ~1.5 GB | State of the art (Whisper v3) |

**OpenAI**: Always uses `whisper-1` — the model is not configurable via the API.

### Resolution order

1. `WHISPER_MODEL` environment variable (deployment-level pin)
2. `prefsStorage` key `multimodal.stt.model` (runtime UI change)
3. `config.stt.model` in `secureyeoman.yaml` (default: `whisper-1`)

### Set via API

```bash
curl -X PATCH http://localhost:4001/api/v1/multimodal/model \
  -H "Content-Type: application/json" \
  -d '{"type": "stt", "model": "large-v3"}'

# Response: { "ok": true, "type": "stt", "model": "large-v3" }
```

The new model is used for all subsequent transcription requests. No restart required.

### Set via environment variable

Pin a model deployment-wide in `docker-compose.yml` or `.env.dev`:

```env
WHISPER_MODEL=large-v3
```

Environment variable takes precedence over all other settings.

### Set via config file

In `secureyeoman.yaml`:

```yaml
multimodal:
  stt:
    model: small
```

### View current model

The current effective model is included in the multimodal config response:

```bash
curl http://localhost:4001/api/v1/multimodal/config | jq '.providers.stt.model'
# → "large-v3"
```

### Dashboard UI

In the **Multimodal** page, the Providers card shows a model selector below the STT provider badges:

- **Local providers** (Voicebox, OpenedAI Speech): dropdown with all Whisper model sizes
- **OpenAI**: static `whisper-1` chip (non-interactive)

Changing the model in the UI calls `PATCH /api/v1/multimodal/model` and invalidates the config cache.

---

## TTS Model Selection

The same `PATCH /api/v1/multimodal/model` endpoint supports TTS models:

```bash
curl -X PATCH http://localhost:4001/api/v1/multimodal/model \
  -H "Content-Type: application/json" \
  -d '{"type": "tts", "model": "tts-1-hd"}'
```

OpenAI TTS supports `tts-1` (fast, lower quality) and `tts-1-hd` (slower, higher quality). The default is `tts-1`.

---

## Related

- [ADR 009 — Integrations & Platforms](../adr/009-integrations-and-platforms.md)
- [REST API Reference](../api/rest-api.md)
- [Notifications Guide](notifications.md)
