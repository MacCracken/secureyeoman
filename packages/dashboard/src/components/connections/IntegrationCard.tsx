import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe,
  MessageSquare,
  CheckCircle,
  XCircle,
  Loader2,
  Pencil,
  X,
  Save,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { updateIntegration } from '../../api/client';
import type { IntegrationInfo } from '../../types';
import { sanitizeText } from '../../utils/sanitize';
import { PLATFORM_META, BASE_FIELDS, STATUS_CONFIG, formatRelativeTime } from './platformMetadata';

export function IntegrationCard({
  integration,
  onStart,
  onStop,
  onDelete,
  isStarting,
  isStopping,
  isDeleting,
  onTest,
  isTesting,
  testResult,
}: {
  integration: IntegrationInfo;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  isStarting: boolean;
  isStopping: boolean;
  isDeleting: boolean;
  onTest?: (id: string) => void;
  isTesting?: boolean;
  testResult?: { ok: boolean; message: string } | null;
}) {
  const meta = PLATFORM_META[integration.platform] ?? {
    name: integration.platform,
    description: '',
    icon: <Globe className="w-6 h-6" />,
    fields: BASE_FIELDS,
  };
  const statusConfig = STATUS_CONFIG[integration.status];
  const isConnected = integration.status === 'connected';
  const isLoading = isStarting || isStopping || isDeleting;

  const accountEmail = integration.config?.email as string | undefined;
  const isEmailPlatform = integration.platform === 'gmail' || integration.platform === 'email';

  const [isEditing, setIsEditing] = useState(false);
  const [editEnabled, setEditEnabled] = useState(integration.enabled);
  const [editRead, setEditRead] = useState((integration.config?.enableRead as boolean) ?? true);
  const [editSend, setEditSend] = useState((integration.config?.enableSend as boolean) ?? false);

  const queryClient = useQueryClient();
  const saveMut = useMutation({
    mutationFn: () =>
      updateIntegration(integration.id, {
        enabled: editEnabled,
        config: isEmailPlatform
          ? { ...integration.config, enableRead: editRead, enableSend: editSend }
          : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setIsEditing(false);
    },
  });

  return (
    <div
      className={`card overflow-hidden transition-colors ${
        isConnected
          ? 'border-green-500/50 bg-green-500/5'
          : integration.status === 'error'
            ? 'border-red-500/50 bg-red-500/5'
            : ''
      }`}
    >
      {/* Status bar across top */}
      <div
        className={`h-1 w-full ${
          isConnected ? 'bg-green-500' : integration.status === 'error' ? 'bg-red-500' : 'bg-border'
        }`}
      />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div
            className={`p-2.5 rounded-xl shrink-0 ${
              isConnected
                ? 'bg-green-500/15 text-green-500'
                : integration.status === 'error'
                  ? 'bg-red-500/15 text-red-500'
                  : 'bg-muted/50 text-muted-foreground'
            }`}
          >
            {meta.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm leading-tight truncate">
                  {integration.displayName}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{meta.name}</p>
              </div>
              <span
                className={`text-xs flex items-center gap-1 shrink-0 px-2 py-1 rounded-full font-medium border ${
                  isConnected
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30'
                    : integration.status === 'error'
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                      : 'bg-muted/50 text-muted-foreground border-border'
                }`}
              >
                {statusConfig.icon}
                <span>{statusConfig.label}</span>
              </span>
            </div>

            {/* Account email */}
            {accountEmail && (
              <p className="text-xs text-foreground/70 mt-1.5 font-mono truncate">{accountEmail}</p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{integration.messageCount} messages</span>
          </div>
          {integration.lastMessageAt && (
            <div className="flex items-center gap-1.5">
              <span className="text-border">&middot;</span>
              <span>Last activity {formatRelativeTime(integration.lastMessageAt)}</span>
            </div>
          )}
        </div>

        {/* Error message */}
        {integration.errorMessage && (
          <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-600 dark:text-red-400 break-words">
              {sanitizeText(integration.errorMessage)}
            </p>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div
            className={`flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-md text-xs border ${
              testResult.ok
                ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
                : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
            }`}
          >
            {testResult.ok ? (
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <XCircle className="w-3.5 h-3.5 shrink-0" />
            )}
            {testResult.message}
          </div>
        )}

        {/* Inline edit form */}
        {isEditing && (
          <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
            {/* Enabled toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Account enabled</p>
                <p className="text-xs text-muted-foreground">Disable to pause without deleting</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditEnabled((v) => !v);
                }}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${editEnabled ? 'text-green-500' : 'text-muted-foreground'}`}
              >
                {editEnabled ? (
                  <ToggleRight className="w-7 h-7" />
                ) : (
                  <ToggleLeft className="w-7 h-7" />
                )}
                {editEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            {/* Read / Send permissions (email platforms only) */}
            {isEmailPlatform && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Permissions
                </p>
                <label className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div>
                    <span className="text-sm font-medium block">Read emails</span>
                    <span className="text-xs text-muted-foreground">
                      Poll inbox for new messages
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editRead}
                    onChange={(e) => {
                      setEditRead(e.target.checked);
                    }}
                    className="w-4 h-4 rounded accent-primary"
                  />
                </label>
                <label className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div>
                    <span className="text-sm font-medium block">Send emails</span>
                    <span className="text-xs text-muted-foreground">
                      Allow sending and replying
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editSend}
                    onChange={(e) => {
                      setEditSend(e.target.checked);
                    }}
                    className="w-4 h-4 rounded accent-primary"
                  />
                </label>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  saveMut.mutate();
                }}
                disabled={saveMut.isPending}
                className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {saveMut.isPending ? 'Saving\u2026' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                }}
                className="btn btn-ghost text-xs px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60">
          {isConnected ? (
            <button
              onClick={() => {
                onStop(integration.id);
              }}
              disabled={isLoading}
              className="btn btn-ghost text-xs px-3 py-1.5"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => {
                onStart(integration.id);
              }}
              disabled={isLoading}
              className="btn btn-ghost text-xs px-3 py-1.5"
            >
              {integration.status === 'error' ? 'Retry' : 'Start'}
            </button>
          )}
          {onTest && (
            <button
              onClick={() => {
                onTest(integration.id);
              }}
              disabled={isLoading || isTesting}
              className="btn btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Test
            </button>
          )}
          <button
            onClick={() => {
              setIsEditing((v) => !v);
            }}
            className={`btn btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 ${isEditing ? 'text-primary' : ''}`}
            title="Edit settings"
          >
            {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {isEditing ? 'Close' : 'Edit'}
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete ${integration.displayName}?`)) onDelete(integration.id);
            }}
            disabled={isLoading}
            className="btn btn-ghost text-xs px-3 py-1.5 text-destructive hover:bg-destructive/10 ml-auto"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
