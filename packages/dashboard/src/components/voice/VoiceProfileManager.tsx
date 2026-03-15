/**
 * Voice Profile Manager
 *
 * CRUD panel for voice profiles with preview, clone support,
 * and provider-specific settings.
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Volume2,
  Plus,
  Edit2,
  Trash2,
  Play,
  Copy,
  Upload,
  Mic,
  X,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import {
  fetchVoiceProfiles,
  createVoiceProfile,
  updateVoiceProfile,
  deleteVoiceProfile,
  previewVoiceProfile,
  cloneVoice,
  fetchMultimodalConfig,
} from '../../api/client';
import type { VoiceProfile } from '../../api/client';
import { ConfirmDialog } from '../common/ConfirmDialog';

const TTS_PROVIDERS = [
  'openai',
  'polly',
  'elevenlabs',
  'deepgram',
  'cartesia',
  'google',
  'azure',
  'playht',
  'openedai',
  'kokoro',
  'voicebox',
  'orpheus',
  'piper',
];

interface ProfileFormData {
  name: string;
  provider: string;
  voiceId: string;
  settingsJson: string;
}

const EMPTY_FORM: ProfileFormData = {
  name: '',
  provider: '',
  voiceId: '',
  settingsJson: '{}',
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function VoiceProfileManager() {
  const queryClient = useQueryClient();

  const { data: profilesData, isLoading } = useQuery({
    queryKey: ['voice-profiles'],
    queryFn: fetchVoiceProfiles,
    refetchOnWindowFocus: false,
  });

  const { data: multimodalConfig } = useQuery({
    queryKey: ['multimodal-config'],
    queryFn: fetchMultimodalConfig,
    refetchOnWindowFocus: false,
  });

  const profiles = profilesData?.profiles ?? [];
  const elevenlabsAvailable =
    multimodalConfig?.ttsProvider === 'elevenlabs' ||
    profiles.some((p) => p.provider === 'elevenlabs');

  // Form state
  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<VoiceProfile | null>(null);

  // Preview state
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Clone dialog state
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneAudioBase64, setCloneAudioBase64] = useState<string | null>(null);
  const [cloneRecording, setCloneRecording] = useState(false);
  const cloneMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cloneStreamRef = useRef<MediaStream | null>(null);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      provider: string;
      voiceId: string;
      settings?: Record<string, unknown>;
    }) => createVoiceProfile(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['voice-profiles'] });
      setFormMode('closed');
      setForm(EMPTY_FORM);
      setFormError(null);
    },
    onError: () => {
      setFormError('Failed to create profile.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        provider?: string;
        voiceId?: string;
        settings?: Record<string, unknown>;
      };
    }) => updateVoiceProfile(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['voice-profiles'] });
      setFormMode('closed');
      setEditingId(null);
      setForm(EMPTY_FORM);
      setFormError(null);
    },
    onError: () => {
      setFormError('Failed to update profile.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVoiceProfile(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['voice-profiles'] });
      setDeleteTarget(null);
    },
  });

  const cloneMutation = useMutation({
    mutationFn: ({ name, audioBase64 }: { name: string; audioBase64: string }) =>
      cloneVoice(name, audioBase64),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['voice-profiles'] });
      setCloneOpen(false);
      setCloneName('');
      setCloneAudioBase64(null);
    },
  });

  // Handlers
  const openCreate = useCallback(() => {
    setFormMode('create');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }, []);

  const openEdit = useCallback((profile: VoiceProfile) => {
    setFormMode('edit');
    setEditingId(profile.id);
    setForm({
      name: profile.name,
      provider: profile.provider,
      voiceId: profile.voiceId,
      settingsJson: JSON.stringify(profile.settings ?? {}, null, 2),
    });
    setFormError(null);
  }, []);

  const closeForm = useCallback(() => {
    setFormMode('closed');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!form.name.trim() || !form.provider || !form.voiceId.trim()) {
      setFormError('Name, provider, and voice ID are required.');
      return;
    }
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(form.settingsJson);
    } catch {
      setFormError('Settings must be valid JSON.');
      return;
    }

    if (formMode === 'create') {
      createMutation.mutate({
        name: form.name.trim(),
        provider: form.provider,
        voiceId: form.voiceId.trim(),
        settings,
      });
    } else if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: {
          name: form.name.trim(),
          provider: form.provider,
          voiceId: form.voiceId.trim(),
          settings,
        },
      });
    }
  }, [form, formMode, editingId, createMutation, updateMutation]);

  const handlePreview = useCallback(async (profileId: string) => {
    setPreviewingId(profileId);
    try {
      if (audioRef.current) audioRef.current.pause();
      const result = await previewVoiceProfile(
        profileId,
        'Hello, this is a voice profile preview.'
      );
      const audio = new Audio(`data:audio/${result.format || 'mp3'};base64,${result.audioBase64}`);
      audioRef.current = audio;
      audio.play();
      audio.onended = () => {
        setPreviewingId(null);
      };
    } catch {
      setPreviewingId(null);
    }
  }, []);

  const handleCloneFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setCloneAudioBase64(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  }, []);

  const startCloneRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      cloneStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => {
          t.stop();
        });
        cloneStreamRef.current = null;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          setCloneAudioBase64(result.split(',')[1]);
        };
        reader.readAsDataURL(blob);
        setCloneRecording(false);
      };
      cloneMediaRecorderRef.current = recorder;
      recorder.start();
      setCloneRecording(true);
    } catch {
      setCloneRecording(false);
    }
  }, []);

  const stopCloneRecording = useCallback(() => {
    if (cloneMediaRecorderRef.current?.state === 'recording') {
      cloneMediaRecorderRef.current.stop();
    }
  }, []);

  const handleCloneSubmit = useCallback(() => {
    if (!cloneName.trim() || !cloneAudioBase64) return;
    cloneMutation.mutate({ name: cloneName.trim(), audioBase64: cloneAudioBase64 });
  }, [cloneName, cloneAudioBase64, cloneMutation]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Voice Profile"
        message={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            Voice Profiles
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage voice profiles for text-to-speech output.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {elevenlabsAvailable && (
            <button
              className="btn btn-ghost text-sm px-3 py-1.5 flex items-center gap-1.5"
              onClick={() => {
                setCloneOpen(true);
                setCloneName('');
                setCloneAudioBase64(null);
              }}
            >
              <Copy className="w-3.5 h-3.5" />
              Clone Voice
            </button>
          )}
          <button
            className="btn btn-ghost text-sm px-3 py-1.5 flex items-center gap-1.5"
            onClick={openCreate}
          >
            <Plus className="w-3.5 h-3.5" />
            Create Profile
          </button>
        </div>
      </div>

      {/* Clone Voice Dialog */}
      {cloneOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => {
            setCloneOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Clone Voice"
        >
          <div
            className="card p-6 max-w-md w-full mx-4 shadow-lg space-y-4"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-lg">Clone Voice</h3>
              <button
                onClick={() => {
                  setCloneOpen(false);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Upload an audio file or record from your microphone to clone a voice using ElevenLabs.
            </p>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Profile Name</label>
              <input
                type="text"
                value={cloneName}
                onChange={(e) => {
                  setCloneName(e.target.value);
                }}
                placeholder="My cloned voice"
                className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground block">Audio Source</label>
              <div className="flex items-center gap-2">
                <label className="btn btn-ghost text-sm px-3 py-1.5 flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Upload File
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleCloneFileUpload}
                    className="hidden"
                  />
                </label>
                {!cloneRecording ? (
                  <button
                    className="btn btn-ghost text-sm px-3 py-1.5 flex items-center gap-1.5"
                    onClick={() => void startCloneRecording()}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    Record
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost text-sm px-3 py-1.5 flex items-center gap-1.5 text-destructive"
                    onClick={stopCloneRecording}
                  >
                    <Mic className="w-3.5 h-3.5 animate-pulse" />
                    Stop Recording
                  </button>
                )}
              </div>
              {cloneAudioBase64 && <p className="text-xs text-success">Audio ready for cloning.</p>}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                className="btn btn-ghost text-sm px-4 py-1.5"
                onClick={() => {
                  setCloneOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-ghost text-sm px-4 py-1.5"
                onClick={handleCloneSubmit}
                disabled={!cloneName.trim() || !cloneAudioBase64 || cloneMutation.isPending}
              >
                {cloneMutation.isPending ? 'Cloning...' : 'Clone'}
              </button>
            </div>

            {cloneMutation.isError && (
              <p className="text-xs text-destructive">Failed to clone voice. Please try again.</p>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit Form */}
      {formMode !== 'closed' && (
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              {formMode === 'create' ? 'Create Profile' : 'Edit Profile'}
            </h3>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                }}
                placeholder="Profile name"
                className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Provider</label>
              <div className="relative">
                <select
                  value={form.provider}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, provider: e.target.value }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary pr-8"
                >
                  <option value="">Select provider...</option>
                  {TTS_PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Voice ID</label>
            <input
              type="text"
              value={form.voiceId}
              onChange={(e) => {
                setForm((f) => ({ ...f, voiceId: e.target.value }));
              }}
              placeholder="Provider-specific voice identifier"
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Settings (JSON)</label>
            <textarea
              value={form.settingsJson}
              onChange={(e) => {
                setForm((f) => ({ ...f, settingsJson: e.target.value }));
              }}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              placeholder='{"speed": 1.0, "pitch": 0}'
            />
          </div>

          {formError && <p className="text-xs text-destructive">{formError}</p>}

          <div className="flex gap-2 justify-end">
            <button className="btn btn-ghost text-sm px-4 py-1.5" onClick={closeForm}>
              Cancel
            </button>
            <button
              className="btn btn-ghost text-sm px-4 py-1.5"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending ? 'Saving...' : formMode === 'create' ? 'Create' : 'Update'}
            </button>
          </div>
        </div>
      )}

      {/* Profiles List */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground p-4">Loading profiles...</div>
      ) : profiles.length === 0 ? (
        <div className="card p-6 text-center text-sm text-muted-foreground">
          No voice profiles yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((profile) => (
            <div key={profile.id} className="card p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{profile.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {profile.provider}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Voice: {profile.voiceId} | Created: {formatDate(profile.createdAt)}
                </div>
              </div>

              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <button
                  className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => void handlePreview(profile.id)}
                  disabled={previewingId === profile.id}
                  title="Preview"
                >
                  {previewingId === profile.id ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    openEdit(profile);
                  }}
                  title="Edit"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => {
                    setDeleteTarget(profile);
                  }}
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
