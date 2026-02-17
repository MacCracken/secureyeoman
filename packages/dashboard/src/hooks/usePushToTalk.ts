import { useState, useCallback, useRef, useEffect } from 'react';

export interface PushToTalkConfig {
  hotkey: string;
  maxDurationMs: number;
  silenceTimeoutMs: number;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export interface UsePushToTalkReturn {
  isActive: boolean;
  isSupported: boolean;
  transcript: string;
  audioLevel: number;
  duration: number;
  error: string | null;
}

const DEFAULT_CONFIG: PushToTalkConfig = {
  hotkey: 'ctrl+shift+v',
  maxDurationMs: 60000,
  silenceTimeoutMs: 2000,
};

function getRecognitionConstructor() {
  return typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;
}

export function usePushToTalk(
  config: Partial<PushToTalkConfig> = {},
  onTranscript?: (transcript: string) => void
): UsePushToTalkReturn {
  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };

  const [isActive, setIsActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isSupported = typeof window !== 'undefined' && !!getRecognitionConstructor();

  const stopCapture = useCallback(() => {
    setIsActive(false);
    setAudioLevel(0);

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setDuration(0);
  }, []);

  const startCapture = useCallback(async () => {
    if (!isSupported) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    setError(null);
    setTranscript('');
    setDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const updateAudioLevel = () => {
        if (!analyserRef.current) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(average / 255);

        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      };

      updateAudioLevel();

      durationIntervalRef.current = setInterval(() => {
        setDuration((d) => d + 100);
      }, 100);

      maxDurationTimeoutRef.current = setTimeout(() => {
        stopCapture();
      }, resolvedConfig.maxDurationMs);

      const SpeechRec = getRecognitionConstructor();
      if (!SpeechRec) {
        throw new Error('Speech recognition not available');
      }

      const recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let finalTranscript = '';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript + ' ';
          }
        }

        if (finalTranscript) {
          setTranscript(finalTranscript.trim());
          onTranscript?.(finalTranscript.trim());
        }

        silenceTimeoutRef.current = setTimeout(() => {
          stopCapture();
        }, resolvedConfig.silenceTimeoutMs);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          console.warn('Speech recognition error:', event.error);
          setError(event.error);
        }
      };

      recognition.onend = () => {
        if (isActive) {
          stopCapture();
        }
      };

      recognitionRef.current = recognition;
      setIsActive(true);
      recognition.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start capture';
      setError(message);
      stopCapture();
    }
  }, [
    isSupported,
    resolvedConfig.maxDurationMs,
    resolvedConfig.silenceTimeoutMs,
    onTranscript,
    stopCapture,
    isActive,
  ]);

  useEffect(() => {
    if (!isSupported) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = [
        event.ctrlKey ? 'ctrl' : '',
        event.shiftKey ? 'shift' : '',
        event.altKey ? 'alt' : '',
        event.metaKey ? 'meta' : '',
        event.key.toLowerCase(),
      ]
        .filter(Boolean)
        .join('+');

      if (key === resolvedConfig.hotkey.toLowerCase() && !isActive) {
        event.preventDefault();
        startCapture();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = [
        event.ctrlKey ? 'ctrl' : '',
        event.shiftKey ? 'shift' : '',
        event.altKey ? 'alt' : '',
        event.metaKey ? 'meta' : '',
        event.key.toLowerCase(),
      ]
        .filter(Boolean)
        .join('+');

      if (key === resolvedConfig.hotkey.toLowerCase() && isActive) {
        event.preventDefault();
        stopCapture();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      stopCapture();
    };
  }, [isSupported, resolvedConfig.hotkey, isActive, startCapture, stopCapture]);

  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, [stopCapture]);

  return {
    isActive,
    isSupported,
    transcript,
    audioLevel,
    duration,
    error,
  };
}
