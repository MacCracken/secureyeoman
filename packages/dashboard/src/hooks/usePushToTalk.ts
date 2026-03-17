import { useState, useCallback, useRef, useEffect } from 'react';

export interface PushToTalkConfig {
  hotkey: string;
  maxDurationMs: number;
  silenceTimeoutMs: number;
  vadThreshold: number;
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
  vadThreshold: 0.015,
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
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastVoiceActivityRef = useRef<number>(0);
  const hasVoicedRef = useRef<boolean>(false);

  const isSupported = typeof window !== 'undefined' && !!getRecognitionConstructor();

  const stopCapture = useCallback(() => {
    setIsActive(false);
    setAudioLevel(0);

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
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
      void audioContextRef.current.close();
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

      // Initialise VAD state — grace period before silence detection kicks in
      lastVoiceActivityRef.current = Date.now();
      hasVoicedRef.current = false;

      const { silenceTimeoutMs, vadThreshold } = resolvedConfig;

      const updateAudioLevel = () => {
        if (!analyserRef.current) return;

        const timeDomainData = new Uint8Array(analyserRef.current.fftSize);
        analyserRef.current.getByteTimeDomainData(timeDomainData);

        // RMS from time-domain samples (centred around 128)
        const rms =
          Math.sqrt(
            timeDomainData.reduce((sum, v) => sum + (v - 128) * (v - 128), 0) /
              timeDomainData.length
          ) / 128;

        setAudioLevel(rms);

        const now = Date.now();
        if (rms > vadThreshold) {
          hasVoicedRef.current = true;
          lastVoiceActivityRef.current = now;
        } else if (hasVoicedRef.current && now - lastVoiceActivityRef.current > silenceTimeoutMs) {
          stopCapture();
          return;
        }

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
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          // eslint-disable-next-line no-console
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isSupported,
    resolvedConfig.maxDurationMs,
    resolvedConfig.silenceTimeoutMs,
    resolvedConfig.vadThreshold,
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
        void startCapture();
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
