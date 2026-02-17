import { useState, useCallback, useRef, useEffect } from 'react';

export interface TalkModeConfig {
  maxDurationMs: number;
  silenceTimeoutMs: number;
  restartOnResponse?: boolean;
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

export interface UseTalkModeReturn {
  isActive: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  audioLevel: number;
  duration: number;
  error: string | null;
  start: () => void;
  stop: () => void;
}

const DEFAULT_CONFIG: TalkModeConfig = {
  maxDurationMs: 300000, // 5 minutes
  silenceTimeoutMs: 1500,
  restartOnResponse: true,
};

function getRecognitionConstructor() {
  return typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;
}

export function useTalkMode(
  config: Partial<TalkModeConfig> = {},
  onTranscript?: (transcript: string, isFinal: boolean) => void
): UseTalkModeReturn {
  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };

  const [isActive, setIsActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>(0);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const isSupported = typeof window !== 'undefined' && !!getRecognitionConstructor();

  const cleanup = useCallback(() => {
    setIsActive(false);
    setAudioLevel(0);
    setInterimTranscript('');

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

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    setError(null);
    setTranscript('');
    setInterimTranscript('');
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
        cleanup();
      }, resolvedConfig.maxDurationMs);

      const SpeechRec = getRecognitionConstructor();
      if (!SpeechRec) {
        throw new Error('Speech recognition not available');
      }

      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let finalTranscript = '';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript + ' ';
          } else {
            interim += result[0].transcript;
          }
        }

        if (interim) {
          setInterimTranscript(interim);
        }

        if (final) {
          finalTranscript += final;
          setTranscript(finalTranscript.trim());
          setInterimTranscript('');

          onTranscript?.(finalTranscript.trim(), true);

          // Reset silence timeout
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }

          silenceTimeoutRef.current = setTimeout(() => {
            if (finalTranscript.trim()) {
              cleanup();
            }
          }, resolvedConfig.silenceTimeoutMs);
        } else {
          // Interim results - reset silence timeout
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }

          silenceTimeoutRef.current = setTimeout(() => {
            if (interimTranscript.trim()) {
              finalTranscript += interimTranscript;
              setTranscript(finalTranscript.trim());
              setInterimTranscript('');
              onTranscript?.(finalTranscript.trim(), true);
            }
            cleanup();
          }, resolvedConfig.silenceTimeoutMs);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          console.warn('Speech recognition error:', event.error);
          setError(event.error);
        }
      };

      recognition.onend = () => {
        if (isActive) {
          // Restart if still active
          try {
            recognition.start();
          } catch {
            // Ignore
          }
        }
      };

      recognitionRef.current = recognition;
      setIsActive(true);
      recognition.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start';
      setError(message);
      cleanup();
    }
  }, [
    isSupported,
    resolvedConfig.maxDurationMs,
    resolvedConfig.silenceTimeoutMs,
    cleanup,
    onTranscript,
    isActive,
  ]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isActive,
    isSupported,
    transcript,
    interimTranscript,
    audioLevel,
    duration,
    error,
    start,
    stop,
  };
}
