/**
 * Voice Provider Picker
 *
 * Settings panel for selecting TTS and STT providers with health
 * status indicators and test buttons.
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Volume2, Mic, ChevronDown, RefreshCw } from 'lucide-react';
import {
  fetchMultimodalConfig,
  updateMultimodalProvider,
  synthesizeSpeech,
  transcribeAudio,
} from '../../api/client';

interface ProviderOption {
  id: string;
  label: string;
}

const TTS_PROVIDERS: ProviderOption[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'polly', label: 'Amazon Polly' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
  { id: 'deepgram', label: 'Deepgram' },
  { id: 'cartesia', label: 'Cartesia' },
  { id: 'google', label: 'Google' },
  { id: 'azure', label: 'Azure' },
  { id: 'playht', label: 'PlayHT' },
  { id: 'openedai', label: 'OpenedAI' },
  { id: 'kokoro', label: 'Kokoro' },
  { id: 'voicebox', label: 'VoiceBox' },
  { id: 'orpheus', label: 'Orpheus' },
  { id: 'piper', label: 'Piper' },
];

const STT_PROVIDERS: ProviderOption[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'transcribe', label: 'AWS Transcribe' },
  { id: 'deepgram', label: 'Deepgram' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
  { id: 'assemblyai', label: 'AssemblyAI' },
  { id: 'google', label: 'Google' },
  { id: 'azure', label: 'Azure' },
  { id: 'voicebox', label: 'VoiceBox' },
  { id: 'faster-whisper', label: 'Faster Whisper' },
];

function HealthDot({ healthy }: { healthy: boolean | null }) {
  if (healthy === null) {
    return <span className="w-2 h-2 rounded-full bg-muted-foreground/30 inline-block" />;
  }
  return (
    <span
      className={`w-2 h-2 rounded-full inline-block ${healthy ? 'bg-success' : 'bg-destructive'}`}
    />
  );
}

export function VoiceProviderPicker() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['multimodal-config'],
    queryFn: fetchMultimodalConfig,
    refetchOnWindowFocus: false,
  });

  const currentTts = config?.ttsProvider as string | undefined;
  const currentStt = config?.sttProvider as string | undefined;
  const providerHealth = config?.providerHealth as Record<string, boolean> | undefined;

  // TTS test state
  const [ttsTestStatus, setTtsTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>(
    'idle'
  );
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // STT test state
  const [sttTestStatus, setSttTestStatus] = useState<
    'idle' | 'recording' | 'transcribing' | 'success' | 'error'
  >('idle');
  const [sttTranscript, setSttTranscript] = useState<string>('');

  const ttsMutation = useMutation({
    mutationFn: (provider: string) => updateMultimodalProvider('tts', provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['multimodal-config'] });
    },
  });

  const sttMutation = useMutation({
    mutationFn: (provider: string) => updateMultimodalProvider('stt', provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['multimodal-config'] });
    },
  });

  const handleTestTts = useCallback(async () => {
    setTtsTestStatus('testing');
    try {
      const result = await synthesizeSpeech({ text: 'Hello, this is a test' });
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
      }
      const audio = new Audio(`data:audio/${result.format || 'mp3'};base64,${result.audioBase64}`);
      ttsAudioRef.current = audio;
      audio.play();
      setTtsTestStatus('success');
      setTimeout(() => {
        setTtsTestStatus('idle');
      }, 3000);
    } catch {
      setTtsTestStatus('error');
      setTimeout(() => {
        setTtsTestStatus('idle');
      }, 3000);
    }
  }, []);

  const handleTestStt = useCallback(async () => {
    setSttTestStatus('recording');
    setSttTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => {
          t.stop();
        });
        setSttTestStatus('transcribing');
        try {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const result = await transcribeAudio({ audioBase64: base64, format: 'webm' });
          setSttTranscript(result.text || '(no speech detected)');
          setSttTestStatus('success');
          setTimeout(() => {
            setSttTestStatus('idle');
          }, 5000);
        } catch {
          setSttTestStatus('error');
          setTimeout(() => {
            setSttTestStatus('idle');
          }, 3000);
        }
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 3000);
    } catch {
      setSttTestStatus('error');
      setTimeout(() => {
        setSttTestStatus('idle');
      }, 3000);
    }
  }, []);

  const getHealthStatus = (providerId: string): boolean | null => {
    if (!providerHealth) return null;
    return providerHealth[providerId] ?? null;
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Loading voice configuration...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
          <Volume2 className="w-5 h-5" />
          Voice Providers
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure text-to-speech and speech-to-text providers for voice features.
        </p>
      </div>

      {/* TTS Provider */}
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          Text-to-Speech Provider
        </h3>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <select
              value={currentTts ?? ''}
              onChange={(e) => {
                if (e.target.value) ttsMutation.mutate(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary pr-8"
            >
              <option value="">Select TTS provider...</option>
              {TTS_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {currentTts && <HealthDot healthy={getHealthStatus(currentTts)} />}

          <button
            className="btn btn-ghost text-sm px-3 py-1.5 flex items-center gap-1.5"
            onClick={handleTestTts}
            disabled={!currentTts || ttsTestStatus === 'testing'}
          >
            {ttsTestStatus === 'testing' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
            {ttsTestStatus === 'testing'
              ? 'Testing...'
              : ttsTestStatus === 'success'
                ? 'Played'
                : ttsTestStatus === 'error'
                  ? 'Failed'
                  : 'Test'}
          </button>
        </div>

        {ttsMutation.isPending && (
          <p className="text-xs text-muted-foreground">Updating provider...</p>
        )}
        {ttsMutation.isError && (
          <p className="text-xs text-destructive">Failed to update TTS provider.</p>
        )}

        {/* Provider health list */}
        {providerHealth && (
          <div className="mt-2 space-y-1">
            {TTS_PROVIDERS.map((p) => {
              const health = getHealthStatus(p.id);
              if (health === null) return null;
              return (
                <div key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <HealthDot healthy={health} />
                  <span>{p.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* STT Provider */}
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Mic className="w-4 h-4" />
          Speech-to-Text Provider
        </h3>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <select
              value={currentStt ?? ''}
              onChange={(e) => {
                if (e.target.value) sttMutation.mutate(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary pr-8"
            >
              <option value="">Select STT provider...</option>
              {STT_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {currentStt && <HealthDot healthy={getHealthStatus(currentStt)} />}

          <button
            className="btn btn-ghost text-sm px-3 py-1.5 flex items-center gap-1.5"
            onClick={handleTestStt}
            disabled={
              !currentStt || sttTestStatus === 'recording' || sttTestStatus === 'transcribing'
            }
          >
            {sttTestStatus === 'recording' ? (
              <Mic className="w-3.5 h-3.5 text-destructive animate-pulse" />
            ) : sttTestStatus === 'transcribing' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
            {sttTestStatus === 'recording'
              ? 'Recording...'
              : sttTestStatus === 'transcribing'
                ? 'Transcribing...'
                : sttTestStatus === 'success'
                  ? 'Done'
                  : sttTestStatus === 'error'
                    ? 'Failed'
                    : 'Test'}
          </button>
        </div>

        {sttTranscript && (
          <div className="rounded-lg bg-muted/20 border border-border p-2 text-sm">
            <span className="text-xs text-muted-foreground block mb-0.5">Transcription:</span>
            {sttTranscript}
          </div>
        )}

        {sttMutation.isPending && (
          <p className="text-xs text-muted-foreground">Updating provider...</p>
        )}
        {sttMutation.isError && (
          <p className="text-xs text-destructive">Failed to update STT provider.</p>
        )}

        {/* Provider health list */}
        {providerHealth && (
          <div className="mt-2 space-y-1">
            {STT_PROVIDERS.map((p) => {
              const health = getHealthStatus(p.id);
              if (health === null) return null;
              return (
                <div key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <HealthDot healthy={health} />
                  <span>{p.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
