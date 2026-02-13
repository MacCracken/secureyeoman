# ADR 020: Push-to-Talk Implementation

**Status**: Proposed
**Date**: 2026-02-13

## Context

Push-to-talk (PTT) provides explicit voice activation via keyboard shortcut. Unlike always-on voice wake, PTT only captures audio while the key is held, providing a balance between convenience and privacy.

This ADR details the implementation of Push-to-Talk for F.R.I.D.A.Y.

## Decision

### Overview

Push-to-talk captures voice input when a configurable hotkey is held, processes it through speech recognition, and sends the transcript to the agent. It's the simplest voice interaction mode — no always-on listening, no wake words.

```
User holds hotkey → Audio capture → Speech-to-text → Agent processes → TTS response
```

### Configuration

```typescript
interface PushToTalkConfig {
  enabled: boolean;
  hotkey: string;              // e.g., "Cmd+Shift+V", "Ctrl+Space"
  maxDurationMs: number;       // Max capture time (default: 60000)
  silenceTimeoutMs: number;    // Auto-stop after silence (default: 2000)
  inputDeviceId?: string;      // Specific microphone (optional)
  outputDeviceId?: string;     // Speaker for TTS (optional)
}
```

### Default Hotkeys

| Platform | Default Hotkey |
|----------|---------------|
| macOS | Cmd+Shift+V |
| Windows/Linux | Ctrl+Shift+V |

### Implementation Details

#### 1. Global Keyboard Listener

```typescript
// Use a library like `hotkeys-js` or native EventTarget
import { useHotkeys } from 'use-hotkeys-hook';

function usePushToTalk(config: PushToTalkConfig) {
  const [isCapturing, setIsCapturing] = useState(false);
  
  useHotkeys(config.hotkey, (event) => {
    if (event.type === 'keydown') {
      startCapture();
    } else if (event.type === 'keyup') {
      stopCapture();
    }
  }, { keyup: true, keydown: true });
  
  // ...
}
```

#### 2. Audio Capture

```typescript
async function startCapture() {
  const stream = await navigator.mediaDevices.getUserMedia({ 
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    } 
  });
  
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  // Connect to speech recognition or save to buffer
}
```

#### 3. Speech Recognition

```typescript
function useSpeechRecognition() {
  const [transcript, setTranscript] = useState('');
  
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)({
    continuous: true,
    interimResults: true,
  });
  
  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    if (result.isFinal) {
      setTranscript(result[0].transcript);
    }
  };
  
  return { recognition, transcript };
}
```

#### 4. Visual Overlay

Show capture state to user:

```tsx
function VoiceOverlay({ isCapturing, duration, audioLevel }) {
  if (!isCapturing) return null;
  
  return (
    <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        <span>Listening...</span>
        <span className="text-sm opacity-75">{formatDuration(duration)}</span>
      </div>
      {/* Audio level indicator */}
      <div className="h-1 bg-primary-foreground/20 rounded mt-2">
        <div 
          className="h-full bg-primary-foreground rounded" 
          style={{ width: `${audioLevel * 100}%` }} 
        />
      </div>
    </div>
  );
}
```

### Security

| Aspect | Implementation |
|--------|----------------|
| **RBAC** | Requires `voice:ptt` permission |
| **Hotkey scope** | Global (works even when app not focused) |
| **Max duration** | Configurable limit prevents runaway capture |
| **Silence timeout** | Auto-stop after 2s of silence |
| **Visual indicator** | Always visible when capturing |
| **Audio buffer** | Cleared immediately after processing |

### API Endpoints

No new backend endpoints required — all processing happens client-side in browser.

### Fallback Behavior

| Scenario | Behavior |
|----------|----------|
| No microphone permission | Show error toast, disable PTT button |
| Speech API unavailable | Hide PTT, show "not supported" tooltip |
| Hotkey conflict | Allow user to customize in settings |

## Consequences

### Positive
- **Simple**: Single hotkey to remember
- **Privacy**: No background listening
- **Low resource**: Only captures when activated
- **Browser native**: Works without external dependencies

### Negative
- **Requires hand**: Must hold key while speaking
- **Chrome-focused**: Web Speech API support varies
- **No continuous**: Each capture is separate interaction

### Alternatives Considered

1. **Right Option key (OpenClaw)**: Works well on macOS but less portable
2. **Spacebar**: Common but conflicts with text input
3. **Mouse button**: Requires specific hardware

## Implementation Checklist

- [ ] Add `voice:ptt` permission to RBAC
- [ ] Create `usePushToTalk` hook
- [ ] Implement global hotkey listener
- [ ] Add audio capture with Web Audio API
- [ ] Integrate Speech Recognition
- [ ] Create VoiceOverlay component
- [ ] Add PTT button to Chat UI
- [ ] Wire up TTS response playback

## Related ADRs

- [ADR 009: Voice Interface](./009-voice-interface.md) — Existing implementation
- [ADR 019: Voice Wake Architecture](./019-voice-wake-architecture.md) — Always-on mode

---

**Previous**: [ADR 019: Voice Wake Architecture](./019-voice-wake-architecture.md)  
**Next**: [ADR 021: Skill Actions Architecture](./021-skill-actions-architecture.md)
