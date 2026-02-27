import { useState } from 'react';
import { Bell, Trash2, Plus, Check } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchNotificationPrefs,
  createNotificationPref,
  updateNotificationPref,
  deleteNotificationPref,
  type CreateNotificationPrefBody,
} from '../api/client';
import type { UserNotificationPref } from '../types';

const CHANNEL_LABELS: Record<string, string> = {
  slack: 'Slack',
  telegram: 'Telegram',
  discord: 'Discord',
  email: 'Email',
};

const LEVEL_LABELS: Record<string, string> = {
  info: 'Info+',
  warn: 'Warn+',
  error: 'Error+',
  critical: 'Critical only',
};

const CHANNEL_COLORS: Record<string, string> = {
  slack: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  telegram: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  discord: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  email: 'bg-green-500/10 text-green-600 dark:text-green-400',
};

function ChannelBadge({ channel }: { channel: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CHANNEL_COLORS[channel] ?? 'bg-muted text-muted-foreground'}`}
    >
      {CHANNEL_LABELS[channel] ?? channel}
    </span>
  );
}

function QuietHoursDisplay({ start, end }: { start: number | null; end: number | null }) {
  if (start == null || end == null) return <span className="text-muted-foreground text-xs">–</span>;
  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return (
    <span className="text-xs">
      {fmt(start)}–{fmt(end)} UTC
    </span>
  );
}

interface AddPrefFormProps {
  onSave: (body: CreateNotificationPrefBody) => void;
  saving: boolean;
}

function AddPrefForm({ onSave, saving }: AddPrefFormProps) {
  const [channel, setChannel] = useState<'slack' | 'telegram' | 'discord' | 'email'>('telegram');
  const [chatId, setChatId] = useState('');
  const [integrationId, setIntegrationId] = useState('');
  const [minLevel, setMinLevel] = useState<'info' | 'warn' | 'error' | 'critical'>('info');
  const [quietStart, setQuietStart] = useState('');
  const [quietEnd, setQuietEnd] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatId.trim()) return;
    onSave({
      channel,
      chatId: chatId.trim(),
      integrationId: integrationId.trim() || null,
      minLevel,
      quietHoursStart: quietStart !== '' ? Number(quietStart) : null,
      quietHoursEnd: quietEnd !== '' ? Number(quietEnd) : null,
      enabled: true,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 border border-dashed border-border rounded-md bg-muted/30">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <Plus className="w-4 h-4" />
        Add Notification Channel
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as typeof channel)}
            className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background"
          >
            <option value="telegram">Telegram</option>
            <option value="slack">Slack</option>
            <option value="discord">Discord</option>
            <option value="email">Email</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            {channel === 'email' ? 'Email address' : 'Chat / Channel ID'}
          </label>
          <input
            type="text"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder={channel === 'email' ? 'you@example.com' : '@channelusername or -100...'}
            className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background"
            required
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Minimum level
          </label>
          <select
            value={minLevel}
            onChange={(e) => setMinLevel(e.target.value as typeof minLevel)}
            className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background"
          >
            <option value="info">Info and above</option>
            <option value="warn">Warn and above</option>
            <option value="error">Error and above</option>
            <option value="critical">Critical only</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Integration ID <span className="font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={integrationId}
            onChange={(e) => setIntegrationId(e.target.value)}
            placeholder="Leave blank to auto-select"
            className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Quiet hours start (0–23 UTC)
          </label>
          <input
            type="number"
            min={0}
            max={23}
            value={quietStart}
            onChange={(e) => setQuietStart(e.target.value)}
            placeholder="e.g. 22"
            className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Quiet hours end (0–23 UTC)
          </label>
          <input
            type="number"
            min={0}
            max={23}
            value={quietEnd}
            onChange={(e) => setQuietEnd(e.target.value)}
            placeholder="e.g. 8"
            className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !chatId.trim()}
          className="btn btn-primary btn-sm flex items-center gap-1"
        >
          <Check className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export function NotificationPrefsPanel() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: fetchNotificationPrefs,
  });

  const createMut = useMutation({
    mutationFn: (body: CreateNotificationPrefBody) => createNotificationPref(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-prefs'] });
      setShowForm(false);
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateNotificationPref(id, { enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notification-prefs'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteNotificationPref(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notification-prefs'] }),
  });

  const prefs: UserNotificationPref[] = data?.prefs ?? [];

  return (
    <div className="card">
      <div className="p-4 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Notification Channels</h3>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn btn-ghost btn-sm flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      <div className="p-4 space-y-4">
        {showForm && (
          <AddPrefForm
            onSave={(body) => createMut.mutate(body)}
            saving={createMut.isPending}
          />
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading preferences…</p>
        ) : prefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No notification channels configured. Add one to receive alerts via Telegram, Slack,
            Discord, or email.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {prefs.map((pref) => (
              <div key={pref.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ChannelBadge channel={pref.channel} />
                  <div className="min-w-0">
                    <p className="text-sm font-mono truncate">{pref.chatId}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        Min: {LEVEL_LABELS[pref.minLevel] ?? pref.minLevel}
                      </span>
                      {(pref.quietHoursStart != null || pref.quietHoursEnd != null) && (
                        <span className="text-xs text-muted-foreground">
                          · Quiet: <QuietHoursDisplay start={pref.quietHoursStart} end={pref.quietHoursEnd} />
                        </span>
                      )}
                      {pref.integrationId && (
                        <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                          · via {pref.integrationId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Enabled toggle */}
                  <button
                    onClick={() => toggleMut.mutate({ id: pref.id, enabled: !pref.enabled })}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                      pref.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                    title={pref.enabled ? 'Disable' : 'Enable'}
                    disabled={toggleMut.isPending}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                        pref.enabled ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>

                  <button
                    onClick={() => deleteMut.mutate(pref.id)}
                    disabled={deleteMut.isPending}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
