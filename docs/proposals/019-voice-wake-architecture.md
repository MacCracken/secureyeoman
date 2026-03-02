# ADR 019: Voice Wake Architecture

**Status**: Proposed
**Date**: 2026-02-13

## Context

Users want hands-free interaction with SecureYeoman — not just push-to-talk, but always-on listening that responds to wake words. This is a core capability in OpenClaw that we need to implement while maintaining our security-first principles.

## Decision

### Core Architecture

We will implement a multi-layered voice wake system:

```
┌─────────────────────────────────────────────────────────────┐
│                     Voice Input Layer                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Push-to-Talk│  │ Voice Wake  │  │   Talk Mode         │  │
│  │  (Hotkey)   │  │ (Always-On) │  │ (Continuous)        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
└─────────┼─────────────────┼─────────────────────┼─────────────┘
          │                 │                     │
          ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Speech Recognition Layer                    │
│  ┌─────────────────────────────────────────────────────┐     │
│  │        Web Speech API / Local Whisper.cpp          │     │
│  └─────────────────────────────────────────────────────┘     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Processing Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Wake Word   │  │ Transcript  │  │   Response          │  │
│  │  Detection  │  │  Handler   │  │   Synthesizer      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Voice Capture Modes

#### 1. Push-to-Talk (PTT)
- **Activation**: Hold configurable hotkey (default: Cmd+Shift+V)
- **Behavior**: Capture audio while key held, process on release
- **Use case**: Explicit activation, no background listening

#### 2. Voice Wake (Always-On)
- **Activation**: Enable in settings (requires consent)
- **Behavior**: Continuous background audio monitoring for wake words
- **Wake words**: Configurable list (default: "Hey SecureYeoman")
- **Privacy**: Visual indicator when listening; audio buffer cleared after processing
- **Idle timeout**: Auto-disable after configurable inactivity (default: 5 min)

#### 3. Talk Mode (Continuous)
- **Activation**: Triggered after voice wake or manual start
- **Behavior**: Continuous speech-to-text until silence detected
- **Max duration**: Configurable (default: 5 min)
- **Use case**: Extended conversation without repeated wake words

### Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| **Explicit consent** | User must enable voice wake in settings with clear consent dialog |
| **RBAC** | `voice:wake` permission required for always-on; `voice:ptt` for push-to-talk |
| **Audit** | All voice activations logged with transcript hash (not raw text) |
| **Visual indicator** | Always show when voice capture is active |
| **Local processing** | Prefer on-device STT; external APIs require explicit opt-in |
| **Timeout** | Automatic stop after configurable duration |

### Technical Implementation

#### Browser API (Phase 1)
```typescript
// Web Speech API for initial implementation
interface VoiceConfig {
  mode: 'ptt' | 'wake' | 'talk';
  hotkey?: string;
  wakeWords?: string[];
  idleTimeoutMs?: number;
  maxDurationMs?: number;
  silenceThresholdMs?: number;
}
```

#### Wake Word Detection (Phase 2)
- Use Web Audio API for continuous audio capture
- Implement keyword spotting with configurable threshold
- Support custom wake words (not just single phrase)

#### Local Processing (Future)
- Whisper.cpp integration for offline speech recognition
- No network requests required for STT

### Component Structure

```
packages/dashboard/src/
├── hooks/
│   ├── useVoice.ts          # Core voice state management
│   ├── usePushToTalk.ts     # PTT hotkey handling
│   └── useVoiceWake.ts      # Wake word detection
├── components/
│   ├── VoiceToggle.tsx      # Master voice enable/disable
│   ├── VoiceIndicator.tsx   # Listening state indicator
│   ├── VoiceConsent.tsx     # Consent dialog for wake mode
│   └── VoiceOverlay.tsx     # PTT capture overlay
└── api/
    └── voice.ts             # Voice-related API calls
```

### Configuration Schema

```yaml
voice:
  enabled: false  # Master toggle
  
  ptt:
    enabled: true
    hotkey: "Cmd+Shift+V"
    maxDurationMs: 60000
    silenceTimeoutMs: 2000
    
  wake:
    enabled: false  # Requires explicit consent
    words:
      - "Hey SecureYeoman"
      - "SecureYeoman"
    idleTimeoutMs: 300000
    sensitivity: 0.5
    
  talk:
    enabled: true
    maxDurationMs: 300000
    silenceTimeoutMs: 1500
    
  tts:
    enabled: true
    rate: 1.0
    voice: "${SOUND_VOICE}"  # From personality
    
  security:
    requireConsent: true
    auditEnabled: true
    localProcessing: true
```

## Consequences

### Positive
- **Hands-free interaction**: Users can interact without typing
- **Accessibility**: Voice input helps users with disabilities
- **Privacy**: Local processing by default; clear consent flow
- **Auditability**: All voice activations logged

### Negative
- **Browser compatibility**: Web Speech API works best on Chrome/Edge
- **Resource usage**: Always-on listening consumes CPU/battery
- **False triggers**: Wake word may activate accidentally
- **Security surface**: Always-on microphone increases attack surface

### Mitigations
- Clear visual indicator when listening
- Require explicit consent for always-on mode
- Implement idle timeout
- Log activations (not transcripts) for audit

## Related ADRs

- [ADR 009: Voice Interface](./009-voice-interface.md) — Existing TTS/STT
- [ADR 020: Push-to-Talk Implementation](./020-push-to-talk.md) — PTT specifics
- [ADR 015: RBAC Capture Permissions](./015-rbac-capture-permissions.md) — Similar permission model

---

**Previous**: [ADR 018: Proactive Heartbeat](./018-proactive-heartbeat-enhancements.md)  
**Next**: [ADR 020: Push-to-Talk](./020-push-to-talk.md)
