import { useState, useCallback, useRef, useEffect } from 'react';

export interface TalkModeConfig {
  maxDurationMs: number;
  silenceTimeoutMs: number;
  restartOnResponse?: boolean;
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

export interface UseTalkModeReturn {
  isActive: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  audioLevel: number;
  duration: number;
  error: string | null;
  start: () => void | Promise<void>;
  stop: () => void;
}

const DEFAULT_CONFIG: TalkModeConfig = {
  maxDurationMs: 300000, // 5 minutes
  silenceTimeoutMs: 1500,
  restartOnResponse: true,
  vadThreshold: 0.015,
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
  const animationFrameRef = useRef(0);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastVoiceActivityRef = useRef(0);
  const hasVoicedRef = useRef(false);
  const interimTranscriptRef = useRef('');
  const finalTranscriptRef = useRef('');

  const isSupported = typeof window !== 'undefined' && !!getRecognitionConstructor();

  const cleanup = useCallback(() => {
    setIsActive(false);
    setAudioLevel(0);
    setInterimTranscript('');

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

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    setError(null);
    setTranscript('');
    setInterimTranscript('');
    setDuration(0);
    interimTranscriptRef.current = '';
    finalTranscriptRef.current = '';

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
          // Flush any accumulated interim transcript before stopping
          if (interimTranscriptRef.current.trim()) {
            finalTranscriptRef.current += interimTranscriptRef.current;
            setTranscript(finalTranscriptRef.current.trim());
            setInterimTranscript('');
            onTranscript?.(finalTranscriptRef.current.trim(), true);
          }
          cleanup();
          return;
        }

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
          interimTranscriptRef.current = interim;
          setInterimTranscript(interim);
        }

        if (final) {
          finalTranscriptRef.current += final;
          interimTranscriptRef.current = '';
          setTranscript(finalTranscriptRef.current.trim());
          setInterimTranscript('');
          onTranscript?.(finalTranscriptRef.current.trim(), true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isSupported,
    resolvedConfig.maxDurationMs,
    resolvedConfig.silenceTimeoutMs,
    resolvedConfig.vadThreshold,
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
