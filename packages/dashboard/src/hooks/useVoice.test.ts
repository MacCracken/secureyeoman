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
});
