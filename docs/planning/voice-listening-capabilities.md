# Voice Listening Capabilities Plan

> Adding always-on voice interaction to F.R.I.D.A.Y. while maintaining security-first principles

## Overview

OpenClaw implements powerful listening capabilities that F.R.I.D.A.Y. can learn from:
- **Voice Wake** — Always-on speech recognition waiting for customizable wake words
- **Push-to-Talk** — Key hold to capture voice immediately  
- **Talk Mode** — Continuous hands-free conversation

## Current State (ADR 009)

F.R.I.D.A.Y. already has:
- ✅ Browser-native **text-to-speech** via `speechSynthesis`
- ✅ Browser-native **speech-to-text** via `SpeechRecognition` API
- ✅ Voice toggle button in dashboard
- ✅ Voice preference stored in Soul personality

**Gap**: No always-on listening, no wake words, no native app integration

---

## Security-First Design Principles

Before implementation, we establish security boundaries:

| Principle | Application to Voice |
|-----------|---------------------|
| **Deny by Default** | Voice listening must be explicitly enabled by user |
| **Consent Required** | Always-on listening requires explicit opt-in with clear consent UI |
| **Audit Everything** | All voice activations logged with transcript hashes |
| **Local Processing** | Prefer on-device STT; external services require explicit approval |
| **Least Privilege** | Voice RBAC — only authorized roles can enable listening |
| **Fail Secure** | If microphone permission denied, disable all voice features gracefully |

---

## Proposed Capabilities

### 1. Voice Wake (Always-On Listening)

**Description**: Continuous background audio monitoring for wake words

**Security Layers**:
- Requires `voice:wake` permission in RBAC
- User must explicitly enable in settings with consent dialog
- Visual indicator (menu bar icon) when listening active
- Configurable wake words (default: "Hey Friday")
- Automatic shutdown after configurable idle timeout

**Technical Options**:
| Option | Pros | Cons | Security |
|--------|------|------|----------|
| Browser Web Speech API | No setup, local | Chrome only, not truly always-on | ✅ Most secure |
| Whisper.cpp (local) | Offline, accurate | Higher resource usage | ✅ Secure |
| Picovoice Porcupine | Embedded, low-power | Requires wake word model | ✅ Secure |
| External API (Deepgram) | Accurate | Data leaves device | ⚠️ Requires opt-in |

**Recommendation**: Start with browser API for dashboard, add local Whisper.cpp for native apps

### 2. Push-to-Talk

**Description**: Hold key to capture voice, release to send

**Security Layers**:
- Requires `voice:ptt` permission
- Visual overlay shows capture state
- Configurable hotkey (default: Cmd+Shift+V)
- Maximum capture duration limit (default: 60s)
- Audio buffer cleared immediately after processing

**Implementation**:
```typescript
interface PushToTalkConfig {
  hotkey: string;           // e.g., "Cmd+Shift+V"
  maxDurationMs: number;    // default: 60000
  silenceTimeoutMs: number; // auto-stop after silence
  inputDeviceId?: string;   // specific microphone
}
```

### 3. Talk Mode (Continuous Conversation)

**Description**: Extended voice session without repeated wake words

**Security Layers**:
- Requires `voice:talk` permission (higher trust level)
- Auto-timeout after configurable duration (default: 5 min)
- Manual stop button always available
- VAD (Voice Activity Detection) to detect end of speech
- Interruptible — typing immediately stops voice mode

**Privacy Consideration**: Longer sessions = more audio retained in memory = higher risk

---

## Implementation Phases

### Phase 1: Foundation (Security Infrastructure)

**Duration**: 1 week

1. **Voice RBAC Permissions**
   ```typescript
   // New permission resources
   const VOICE_PERMISSIONS = {
     'voice:listen': { description: 'Use speech-to-text' },
     'voice:wake': { description: 'Enable voice wake' },
     'voice:ptt': { description: 'Use push-to-talk' },
     'voice:talk': { description: 'Use continuous talk mode' },
     'voice:tts': { description: 'Use text-to-speech' },
   };
   ```

2. **Audit Logging for Voice**
   ```typescript
   interface VoiceAuditEntry {
     event_type: 'voice_activation' | 'voice_transcript' | 'voice_error';
     session_id: string;
     duration_ms?: number;
     transcript_hash?: string;  // SHA-256, not raw text
     wake_word_matched?: boolean;
     success: boolean;
   }
   ```

3. **Consent UI Component**
   - Dialog explaining always-on listening implications
   - Microphone permission request flow
   - Toggle with clear on/off states

### Phase 2: Push-to-Talk (Quick Win)

**Duration**: 1 week

1. Global keyboard shortcut handling
2. Audio capture + Web Speech API transcription
3. Visual overlay component showing capture state
4. Integration with existing chat input

### Phase 3: Voice Wake

**Duration**: 2 weeks

1. Background audio monitoring (using Web Audio API)
2. Wake word detection (configurable trigger phrases)
3. Visual indicator when listening active
4. Low-power mode option using VAD

### Phase 4: Talk Mode

**Duration**: 1 week

1. Continuous STT session management
2. Silence detection for auto-send
3. Session timeout controls
4. Interrupt handling (keyboard/mouse)

### Phase 5: Native App Integration (Future)

**Duration**: 3-4 weeks per platform

- macOS menu bar app with Voice Wake
- iOS/Android companion nodes
- Cross-platform audio pipeline

---

## Configuration Schema

```yaml
voice:
  enabled: false  # Master toggle, requires RBAC permission
  
  # Push-to-Talk
  pushToTalk:
    enabled: true
    hotkey: "Cmd+Shift+V"
    maxDurationMs: 60000
    silenceTimeoutMs: 2000
  
  # Voice Wake
  wake:
    enabled: false  # Requires explicit consent
    words: ["Hey Friday", "Friday"]
    idleTimeoutMs: 300000  # 5 min
    sensitivity: 0.5
    
  # Talk Mode
  talk:
    enabled: true
    maxDurationMs: 300000  # 5 min
    silenceTimeoutMs: 1500
    
  # Text-to-Speech
  tts:
    enabled: true
    rate: 1.0
    pitch: 1.0
    voice: "${SOUND_VOICE}"  # From personality
    
  # Security
  security:
    requireConsent: true
    auditEnabled: true
    localProcessing: true  # Prefer local STT
```

---

## Reference: OpenClaw Implementation

From OpenClaw's architecture:

| Feature | OpenClaw Approach | Friday Adaptation |
|---------|------------------|-------------------|
| Wake Word | Swabble runtime, configurable trigger words | Start with browser API, local model later |
| Push-to-Talk | Right Option key hold | Global hotkey (Cmd+Shift+V) |
| Overlay | macOS native overlay | React overlay component |
| Permissions | TCC (macOS) integration | Platform permissions + RBAC |
| Forwarding | Gateway WebSocket | Existing WS infrastructure |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Accidental activation | Medium | Medium | Require explicit enable + visual indicator |
| Audio data exfiltration | Low | High | Local processing only by default; audit all external calls |
| Resource exhaustion | Medium | Low | Timeout limits, idle detection |
| Permission abuse | Low | High | RBAC enforcement, audit logging |
| Browser compatibility | High | Low | Graceful degradation, feature detection |

---

## Related Documentation

- [ADR 009: Voice Interface](./009-voice-interface.md) — Existing implementation
- [Security Model](./security/security-model.md) — RBAC and audit
- [Configuration Reference](./configuration.md) — Voice config fields
- [Screen Capture Security](./adr/014-screen-capture-security-architecture.md) — Similar permission model

---

## Next Steps

1. **Review this plan** with security stakeholders
2. **Create ADRs** for each major feature:
   - ADR 019: Voice Wake Architecture
   - ADR 020: Push-to-Talk Implementation  
   - ADR 021: Talk Mode (or extend 009)
3. **Start Phase 1** — Voice RBAC and audit infrastructure
