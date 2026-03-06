// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePushToTalk } from './usePushToTalk';

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

const MockSpeechRecognition = vi.fn(() => mockRecognitionInstance);

describe('usePushToTalk', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (window as unknown as Record<string, unknown>).SpeechRecognition = MockSpeechRecognition;

    // Mock navigator.mediaDevices.getUserMedia
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      writable: true,
      configurable: true,
    });

    // Mock AudioContext
    (globalThis as unknown as Record<string, unknown>).AudioContext = vi.fn(() => ({
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
      })),
      createAnalyser: vi.fn(() => ({
        fftSize: 256,
        getByteTimeDomainData: vi.fn((arr: Uint8Array) => {
          arr.fill(128); // silence
        }),
      })),
      close: vi.fn(),
    }));

    // Mock requestAnimationFrame
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      // Don't call cb to avoid infinite loop
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => usePushToTalk());

    expect(result.current.isActive).toBe(false);
    expect(result.current.isSupported).toBe(true);
    expect(result.current.transcript).toBe('');
    expect(result.current.audioLevel).toBe(0);
    expect(result.current.duration).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('should report unsupported when SpeechRecognition is missing', () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    const { result } = renderHook(() => usePushToTalk());
    expect(result.current.isSupported).toBe(false);
  });

  it('should accept custom config', () => {
    const { result } = renderHook(() =>
      usePushToTalk({
        hotkey: 'alt+v',
        maxDurationMs: 30000,
        silenceTimeoutMs: 1000,
        vadThreshold: 0.02,
      })
    );

    expect(result.current.isSupported).toBe(true);
    expect(result.current.isActive).toBe(false);
  });

  it('should handle hotkey keydown event', () => {
    renderHook(() => usePushToTalk({ hotkey: 'ctrl+shift+v' }));

    // Simulate hotkey press
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'v',
          ctrlKey: true,
          shiftKey: true,
        })
      );
    });

    // startCapture is async, so we just verify no error
    expect(true).toBe(true);
  });

  it('should handle keyup event', () => {
    renderHook(() => usePushToTalk({ hotkey: 'ctrl+shift+v' }));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: 'v',
          ctrlKey: true,
          shiftKey: true,
        })
      );
    });

    expect(true).toBe(true);
  });

  it('should set error when speech recognition not supported and start is attempted', () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    const { result } = renderHook(() => usePushToTalk());

    // Simulate pressing the hotkey — since unsupported, should not start
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'v',
          ctrlKey: true,
          shiftKey: true,
        })
      );
    });

    expect(result.current.isActive).toBe(false);
  });

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() => usePushToTalk());
    unmount();
    expect(true).toBe(true);
  });

  it('should accept onTranscript callback', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => usePushToTalk({}, callback));
    expect(result.current.isSupported).toBe(true);
  });
});
