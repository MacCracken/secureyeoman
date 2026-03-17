import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchVoiceProfiles, previewVoiceProfile } from '../../api/client';

export function VoiceLanguageSection({
  voice,
  onVoiceChange,
  voiceProfileId,
  onVoiceProfileIdChange,
  preferredLanguage,
  onPreferredLanguageChange,
}: {
  voice: string;
  onVoiceChange: (v: string) => void;
  voiceProfileId: string | null;
  onVoiceProfileIdChange: (v: string | null) => void;
  preferredLanguage: string;
  onPreferredLanguageChange: (v: string) => void;
}) {
  const { data: profilesData } = useQuery({
    queryKey: ['voice-profiles'],
    queryFn: fetchVoiceProfiles,
    refetchOnWindowFocus: false,
  });
  const profiles = profilesData?.profiles ?? [];
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreview = useCallback(async () => {
    if (!voiceProfileId) return;
    setPreviewing(true);
    try {
      if (audioRef.current) audioRef.current.pause();
      const result = await previewVoiceProfile(
        voiceProfileId,
        'Hello, this is a voice profile preview.'
      );
      const audio = new Audio(`data:audio/${result.format || 'mp3'};base64,${result.audioBase64}`);
      audioRef.current = audio;
      void audio.play();
      audio.onended = () => {
        setPreviewing(false);
      };
    } catch {
      setPreviewing(false);
    }
  }, [voiceProfileId]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b pb-4 mb-1">
      <div>
        <label className="block text-sm font-medium mb-1">Voice</label>
        <input
          type="text"
          value={voice}
          onChange={(e) => {
            onVoiceChange(e.target.value);
          }}
          className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="e.g., warm, professional"
          maxLength={200}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Preferred Language</label>
        <input
          type="text"
          value={preferredLanguage}
          onChange={(e) => {
            onPreferredLanguageChange(e.target.value);
          }}
          className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="e.g., English"
          maxLength={100}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium mb-1">Voice Profile</label>
        <div className="flex items-center gap-2">
          <select
            value={voiceProfileId ?? ''}
            onChange={(e) => {
              onVoiceProfileIdChange(e.target.value || null);
            }}
            className="flex-1 px-3 py-2 rounded border bg-background text-foreground text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">None (use default)</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.provider})
              </option>
            ))}
          </select>
          {voiceProfileId && (
            <button
              type="button"
              className="btn btn-ghost text-sm px-3 py-1.5"
              onClick={() => void handlePreview()}
              disabled={previewing}
            >
              {previewing ? 'Playing...' : 'Preview'}
            </button>
          )}
        </div>
        {profiles.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            No voice profiles configured. Create profiles in Voice settings.
          </p>
        )}
      </div>
    </div>
  );
}
