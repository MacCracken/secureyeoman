import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Play, X, Loader2, ExternalLink } from 'lucide-react';
import { replayConversation } from '../../api/client';

interface ReplayDialogProps {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  onReplayCreated?: (replayConversationId: string) => void;
}

export function ReplayDialog({
  conversationId,
  open,
  onClose,
  onReplayCreated,
}: ReplayDialogProps) {
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('');
  const [personalityId, setPersonalityId] = useState('');

  const replayMutation = useMutation({
    mutationFn: () =>
      replayConversation(conversationId, {
        model,
        provider,
        personalityId: personalityId || undefined,
      }),
    onSuccess: (data) => {
      onReplayCreated?.(data.replayConversationId);
    },
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      data-testid="replay-dialog"
    >
      <div className="bg-card border rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Replay Conversation</h3>
          <button onClick={onClose} className="btn-ghost p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
              }}
              placeholder="e.g., gpt-4, claude-3-opus"
              className="w-full border rounded px-3 py-2 text-sm bg-background"
              data-testid="replay-model-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Provider</label>
            <input
              type="text"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
              }}
              placeholder="e.g., openai, anthropic"
              className="w-full border rounded px-3 py-2 text-sm bg-background"
              data-testid="replay-provider-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Personality ID (optional)</label>
            <input
              type="text"
              value={personalityId}
              onChange={(e) => {
                setPersonalityId(e.target.value);
              }}
              placeholder="Leave empty to use original"
              className="w-full border rounded px-3 py-2 text-sm bg-background"
            />
          </div>

          {replayMutation.isError && (
            <div className="text-sm text-destructive" data-testid="replay-error">
              {replayMutation.error instanceof Error
                ? replayMutation.error.message
                : 'Replay failed'}
            </div>
          )}

          {replayMutation.isSuccess && (
            <div
              className="text-sm text-success flex items-center gap-2"
              data-testid="replay-success"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Replay started — conversation created
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-muted/50">
            Cancel
          </button>
          <button
            onClick={() => {
              replayMutation.mutate();
            }}
            disabled={!model || !provider || replayMutation.isPending}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            data-testid="replay-submit"
          >
            {replayMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Start Replay
          </button>
        </div>
      </div>
    </div>
  );
}
