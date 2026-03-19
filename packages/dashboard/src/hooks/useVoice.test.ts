// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoice } from './useVoice';

const mockRecognitionInstance = {
  continuous: false,
  interimResults: false,
  lang: '',
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
  onresult: null as ((e: unknown) => void) | null,
  onerror: null as ((e: unknown) => void) | null,
  onend: null as (() => void) | null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn().mockReturnValue(true),
};

// Must use function keyword so `new` works
function MockSpeechRecognition() {
  return { ...mockRecognitionInstance };
}

const mockSpeechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
};

describe('useVoice', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (window as unknown as Record<string, unknown>).SpeechRecognition = MockSpeechRecognition;
    Object.defineProperty(window, 'speechSynthesis', {
      value: mockSpeechSynthesis,
      writable: true,
      configurable: true,
    });
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  });

  it('should return initial state with voice disabled', () => {
    const { result } = renderHook(() => useVoice());
    expect(result.current.voiceEnabled).toBe(false);
    expect(result.current.isListening).toBe(false);
    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.supported).toBe(true);
    expect(result.current.transcript).toBe('');
  });

  it('should read voiceEnabled from localStorage', () => {
    localStorage.setItem('secureyeoman-voice-enabled', 'true');
    const { result } = renderHook(() => useVoice());
    expect(result.current.voiceEnabled).toBe(true);
  });

  it('should toggle voice on and off', () => {
    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.toggleVoice();
    });
    expect(result.current.voiceEnabled).toBe(true);

    act(() => {
      result.current.toggleVoice();
    });
    expect(result.current.voiceEnabled).toBe(false);
  });

  it('should persist voiceEnabled to localStorage', () => {
    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.toggleVoice();
    });

    expect(localStorage.getItem('secureyeoman-voice-enabled')).toBe('true');
  });

  it('should clear transcript', () => {
    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.clearTranscript();
    });

    expect(result.current.transcript).toBe('');
  });

  it('should call startListening and stopListening', () => {
    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.startListening();
    });

    act(() => {
      result.current.stopListening();
    });

    expect(result.current.isListening).toBe(false);
  });

  it('should handle speak', () => {
    // Mock SpeechSynthesisUtterance
    const mockUtterance = {
      onstart: null as (() => void) | null,
      onend: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    // Must use function keyword for constructors
    (globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance = function () {
      return mockUtterance;
    };

    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.speak('Hello world');
    });

    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(mockSpeechSynthesis.speak).toHaveBeenCalled();

    // Trigger onstart
    act(() => {
      mockUtterance.onstart?.();
    });
    expect(result.current.isSpeaking).toBe(true);

    // Trigger onend
    act(() => {
      mockUtterance.onend?.();
    });
    expect(result.current.isSpeaking).toBe(false);
  });

  it('should handle speak error', () => {
    const mockUtterance = {
      onstart: null as (() => void) | null,
      onend: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    (globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance = function () {
      return mockUtterance;
    };

    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.speak('test');
    });

    act(() => {
      mockUtterance.onerror?.();
    });

    expect(result.current.isSpeaking).toBe(false);
  });

  it('should report supported based on available APIs', () => {
    // With SpeechRecognition available, supported should be true
    const { result } = renderHook(() => useVoice());
    expect(result.current.supported).toBe(true);
  });

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() => useVoice());
    unmount();
    // Cleanup runs without errors
    expect(true).toBe(true);
  });

  it('should handle recognition error', () => {
    const instance = { ...mockRecognitionInstance };
    (window as unknown as Record<string, unknown>).SpeechRecognition = function () {
      return instance;
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.startListening();
    });

    // Trigger error
    act(() => {
      instance.onerror?.({ error: 'network' });
    });

    expect(result.current.isListening).toBe(false);
  });

  it('should handle recognition onend', () => {
    const instance = { ...mockRecognitionInstance };
    (window as unknown as Record<string, unknown>).SpeechRecognition = function () {
      return instance;
    };

    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.startListening();
    });

    act(() => {
      instance.onend?.();
    });

    expect(result.current.isListening).toBe(false);
  });

  // ── Error suppression ───────────────────────────────────────────

  it('should suppress aborted error without console.warn', () => {
    const instance = { ...mockRecognitionInstance };
    (window as unknown as Record<string, unknown>).SpeechRecognition = function () {
      return instance;
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.startListening();
    });

    act(() => {
      instance.onerror?.({ error: 'aborted' });
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });

  it('should suppress no-speech error without console.warn', () => {
    const instance = { ...mockRecognitionInstance };
    (window as unknown as Record<string, unknown>).SpeechRecognition = function () {
      return instance;
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.startListening();
    });

    act(() => {
      instance.onerror?.({ error: 'no-speech' });
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('should warn on not-allowed error', () => {
    const instance = { ...mockRecognitionInstance };
    (window as unknown as Record<string, unknown>).SpeechRecognition = function () {
      return instance;
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.startListening();
    });

    act(() => {
      instance.onerror?.({ error: 'not-allowed' });
    });

    expect(warnSpy).toHaveBeenCalledWith('Speech recognition error:', 'not-allowed');
  });

  // ── WebKit fallback ─────────────────────────────────────────────

  it('should fall back to webkitSpeechRecognition', () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = MockSpeechRecognition;

    const { result } = renderHook(() => useVoice());
    expect(result.current.supported).toBe(true);
  });

  it('should use webkitSpeechRecognition as primary when SpeechRecognition unavailable', () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = MockSpeechRecognition;

    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.startListening();
    });

    // Should be listening via webkit fallback
    expect(result.current.isListening).toBe(true);
  });

  // ── Transcript from recognition result ──────────────────────────

  it('should set transcript from final recognition result', () => {
    const instance = { ...mockRecognitionInstance };
    (window as unknown as Record<string, unknown>).SpeechRecognition = function () {
      return instance;
    };

    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.startListening();
    });

    // Simulate a final result
    act(() => {
      instance.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            isFinal: true,
            0: { transcript: 'hello world' },
            length: 1,
          },
          item: (i: number) => ({ isFinal: true, 0: { transcript: 'hello world' }, length: 1 }),
        } as unknown as SpeechRecognitionResultList,
      });
    });

    expect(result.current.transcript).toBe('hello world');
  });

  // ── Toggle voice cancels speech synthesis ───────────────────────

  it('should cancel speech synthesis when toggling voice off', () => {
    const { result } = renderHook(() => useVoice());

    // Enable voice
    act(() => {
      result.current.toggleVoice();
    });
    expect(result.current.voiceEnabled).toBe(true);

    // Disable voice
    act(() => {
      result.current.toggleVoice();
    });
    expect(result.current.voiceEnabled).toBe(false);
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
  });

  // ── Start listening fails gracefully ────────────────────────────

  it('should handle start() throwing', () => {
    const instance = {
      ...mockRecognitionInstance,
      start: vi.fn().mockImplementation(() => {
        throw new Error('not allowed');
      }),
    };
    (window as unknown as Record<string, unknown>).SpeechRecognition = function () {
      return instance;
    };

    const { result } = renderHook(() => useVoice());

    act(() => {
      result.current.startListening();
    });

    expect(result.current.isListening).toBe(false);
  });
});
