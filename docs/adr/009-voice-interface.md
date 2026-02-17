# ADR 009: Voice Interface

**Status**: Accepted
**Date**: 2026-02-12
**Release**: v1.3.0

## Context

Users requested hands-free interaction with SecureYeoman via voice — speech-to-text for input and text-to-speech for assistant responses. This needed to work on both the Chat page and the new Code page's chat sidebar.

## Decision

### Browser-Native APIs Only

We use the Web Speech API exclusively:

- **Speech-to-text**: `SpeechRecognition` / `webkitSpeechRecognition` with `continuous = false` and `interimResults = true`
- **Text-to-speech**: `window.speechSynthesis` with `SpeechSynthesisUtterance`, using the personality's `voice` field as a voice name hint

Alternatives considered:

- **OpenAI Whisper API** — higher accuracy but adds external dependency, latency, and cost
- **Google Cloud Speech-to-Text** — same trade-offs as Whisper
- **Deepgram** — real-time streaming but requires API key management

Browser-native APIs were selected because they require no external services, no API keys, no additional cost, and work offline. The trade-off is browser compatibility (Chrome/Edge have best support; Firefox/Safari partial).

### `useVoice` Hook

A dedicated `useVoice` hook (`packages/dashboard/src/hooks/useVoice.ts`) encapsulates all voice state and logic:

- `voiceEnabled` / `toggleVoice` — master on/off toggle
- `isListening` / `startListening` / `stopListening` — STT controls
- `speak` / `isSpeaking` — TTS controls
- `supported` — feature detection flag

### localStorage Persistence

The `voiceEnabled` preference is stored in `localStorage` under the key `friday-voice-enabled`. This persists the user's preference across page refreshes without requiring backend changes.

### Graceful Degradation

When `SpeechRecognition` or `speechSynthesis` is unavailable, `supported` returns `false`. The `VoiceToggle` component renders as a disabled button with a tooltip ("Voice not supported in this browser") rather than hiding the feature entirely, so users understand the capability exists.

## Consequences

- **Positive**: Zero external dependencies; no API costs; works offline; simple integration via hook pattern; consistent UX across Chat and Code pages
- **Negative**: Browser compatibility varies (best on Chromium); recognition accuracy depends on browser engine; no server-side transcription fallback
- **Mitigations**: Feature detection prevents errors on unsupported browsers; external voice service integration can be added as an optional enhancement in a future release
