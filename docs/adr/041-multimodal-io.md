# ADR 041: Multimodal I/O (Phase 7.3)

## Status

Accepted

## Date

2026-02-16

## Context

SecureYeoman currently only processes text input and output. Users interacting via integrations like Telegram often send photos and voice messages, which are silently ignored. Adding multimodal capabilities (vision, speech-to-text, text-to-speech, and image generation) would significantly improve the user experience across all communication channels.

The existing codebase already has relevant scaffolding:
- `MessageAttachment` schema supports image/audio/video/file/location types
- `UnifiedMessage.attachments[]` exists but is never populated
- `MediaHandler` handles file download/validation/size limits/cleanup
- `BodyCapabilitySchema` includes `'auditory'`, `'vision'`, `'vocalization'`

## Decision

We implement a scoped MVP of multimodal I/O with the following design decisions:

### 1. Direct API Calls, No Provider Abstraction

For STT, TTS, and image generation, we call the OpenAI API directly using `fetch()` rather than introducing a provider abstraction layer. The AIClient is reused for vision (Claude/GPT-4o support image content natively).

**Rationale**: A provider abstraction adds complexity with no current benefit. If a second provider (e.g., ElevenLabs for TTS) is needed in the future, the abstraction can be added then.

### 2. OpenAI-Only for STT/TTS/ImageGen

- **STT**: OpenAI Whisper (`whisper-1`)
- **TTS**: OpenAI TTS (`tts-1`, `tts-1-hd`)
- **Image Generation**: OpenAI DALL-E 3

**Rationale**: OpenAI provides best-in-class APIs for all three. Adding more providers is a future enhancement.

### 3. Vision via Existing AIClient

Image analysis uses the existing AIClient's chat completion endpoint with image content parts. This works with Claude (vision) and GPT-4o.

**Rationale**: No new SDK or API integration needed. The AIClient already supports multimodal messages.

### 4. 20MB Upload Limit

Vision and STT endpoints accept up to 20MB request bodies.

**Rationale**: Accommodates high-resolution images and voice messages up to ~2 minutes in OGG format.

### 5. Telegram-Only Integration Initially

Only the Telegram adapter handles photo and voice messages in this phase. Other integrations (Discord, Slack) can follow the same pattern.

**Rationale**: Telegram is the most actively used integration and has the simplest photo/voice API.

### 6. Security Policy Gating

Multimodal I/O is gated by a `allowMultimodal` security policy toggle, consistent with other feature toggles (`allowSubAgents`, `allowProactive`, etc.).

### 7. Job Tracking

All multimodal operations are tracked as jobs in a `multimodal.jobs` PostgreSQL table. This enables monitoring, debugging, and usage analytics.

## Consequences

### Positive

- Users can send photos and voice messages via Telegram
- Vision analysis leverages existing AIClient infrastructure
- Job tracking provides observability
- Security toggle provides admin control
- Extension hooks enable custom post-processing

### Negative

- Requires `OPENAI_API_KEY` environment variable for STT/TTS/ImageGen
- Increases API cost (Whisper, TTS, DALL-E calls)
- 20MB body limit may not be sufficient for long audio recordings

### Not Included (Future Work)

- Document/OCR pipeline (vision models handle text extraction)
- Per-user voice preferences (system-wide config only)
- Image editing/variation (only generation)
- Provider abstraction layer
- Discord/Slack/other integration adapters
- Streaming TTS output
