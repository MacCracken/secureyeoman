/**
 * GroupChatPage — Unified Group Chat View (ADR 086)
 *
 * Three-pane layout:
 * 1. Channel list — all (integrationId, chatId) pairs with last-message preview
 * 2. Message thread — paginated messages for the selected channel
 * 3. Reply box — text input + personality selector to send a reply
 */

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, RefreshCw, ChevronLeft, Hash, Clock, User, Bot } from 'lucide-react';
import {
  fetchGroupChatChannels,
  fetchGroupChatMessages,
  sendGroupChatMessage,
  fetchPersonalities,
  type GroupChatChannel,
  type GroupChatMessage,
} from '../api/client';

const PLATFORM_ICONS: Record<string, string> = {
  telegram: '✈',
  discord: '🎮',
  slack: '🟪',
  whatsapp: '📱',
  signal: '🔒',
  teams: '🟦',
  gmail: '📧',
  email: '📨',
  github: '⚡',
  twitter: '🐦',
};

function platformIcon(platform: string): string {
  return PLATFORM_ICONS[platform.toLowerCase()] ?? '💬';
}

function timeAgo(ts: number | null): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

interface ChannelKey {
  integrationId: string;
  chatId: string;
}

export function GroupChatPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ChannelKey | null>(null);
  const [replyText, setReplyText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Channel list ─────────────────────────────────────────────────────────
  const {
    data: channelsData,
    isLoading: channelsLoading,
    refetch: refetchChannels,
  } = useQuery({
    queryKey: ['group-chat-channels'],
    queryFn: () => fetchGroupChatChannels({ limit: 100 }),
    refetchInterval: 15_000,
  });

  const channels = channelsData?.channels ?? [];

  // ── Message thread ───────────────────────────────────────────────────────
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['group-chat-messages', selected?.integrationId, selected?.chatId],
    queryFn: () =>
      selected
        ? fetchGroupChatMessages(selected.integrationId, selected.chatId, { limit: 50 })
        : Promise.resolve({ messages: [], total: 0 }),
    enabled: selected !== null,
    refetchInterval: 5_000,
  });

  const messages = (messagesData?.messages ?? []).slice().reverse(); // show oldest first

  // ── Personalities ────────────────────────────────────────────────────────
  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: () => fetchPersonalities(),
  });
  const personalities = personalitiesData?.personalities ?? [];

  // ── Send mutation ─────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: ({ text }: { text: string }) =>
      sendGroupChatMessage(selected!.integrationId, selected!.chatId, text),
    onSuccess: () => {
      setReplyText('');
      void qc.invalidateQueries({
        queryKey: ['group-chat-messages', selected?.integrationId, selected?.chatId],
      });
      void qc.invalidateQueries({ queryKey: ['group-chat-channels'] });
    },
  });

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = replyText.trim();
    if (!text || !selected || sendMutation.isPending) return;
    sendMutation.mutate({ text });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectedChannel = selected
    ? channels.find(
        (c) => c.integrationId === selected.integrationId && c.chatId === selected.chatId
      )
    : null;

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* ── Channel list pane ──────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-sm">Group Chat</h2>
          </div>
          <button
            onClick={() => void refetchChannels()}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {channelsLoading && (
            <div className="p-4 text-sm text-muted-foreground text-center">Loading channels…</div>
          )}
          {!channelsLoading && channels.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No conversations yet. Connect an integration to start receiving messages.
            </div>
          )}
          {channels.map((ch) => {
            const isActive =
              selected?.integrationId === ch.integrationId && selected?.chatId === ch.chatId;
            return (
              <button
                key={`${ch.integrationId}:${ch.chatId}`}
                onClick={() => {
                  setSelected({ integrationId: ch.integrationId, chatId: ch.chatId });
                }}
                className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted transition-colors ${
                  isActive ? 'bg-muted' : ''
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{platformIcon(ch.platform)}</span>
                  <span className="font-medium text-sm truncate flex-1">{ch.integrationName}</span>
                  {ch.unrepliedCount > 0 && (
                    <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                      {ch.unrepliedCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Hash className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate flex-1">{ch.chatId}</span>
                  <Clock className="w-3 h-3 flex-shrink-0 ml-1" />
                  <span className="flex-shrink-0">{timeAgo(ch.lastMessageAt)}</span>
                </div>
                {ch.lastMessageText && (
                  <p className="text-xs text-muted-foreground truncate mt-1">
                    {ch.lastMessageText}
                  </p>
                )}
                {ch.personalityName && (
                  <p className="text-xs text-primary truncate mt-0.5">🤖 {ch.personalityName}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main content pane ──────────────────────────────────────────── */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a conversation to view messages</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center gap-3">
            <button
              onClick={() => {
                setSelected(null);
              }}
              className="md:hidden p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-base">{platformIcon(selectedChannel?.platform ?? '')}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">
                {selectedChannel?.integrationName ?? selected.integrationId}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {selected.chatId}
                {selectedChannel?.personalityName && (
                  <span className="ml-2 text-primary">🤖 {selectedChannel.personalityName}</span>
                )}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {selectedChannel?.messageCount ?? 0} messages
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messagesLoading && (
              <div className="text-sm text-muted-foreground text-center">Loading messages…</div>
            )}
            {!messagesLoading && messages.length === 0 && (
              <div className="text-sm text-muted-foreground text-center">No messages yet.</div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply box */}
          <div className="p-4 border-t border-border">
            {personalities.length > 0 && (
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Bot className="w-3.5 h-3.5" />
                <span>Replying as: </span>
                <span className="text-primary font-medium">
                  {personalities.find((p) => p.isActive)?.name ??
                    personalities[0]?.name ??
                    'Default'}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                value={replyText}
                onChange={(e) => {
                  setReplyText(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type a reply… (Enter to send, Shift+Enter for newline)"
                rows={2}
                className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={handleSend}
                disabled={!replyText.trim() || sendMutation.isPending}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {sendMutation.isPending ? 'Sending…' : 'Send'}
              </button>
            </div>
            {sendMutation.isError && (
              <p className="mt-1 text-xs text-destructive">
                Failed to send:{' '}
                {sendMutation.error instanceof Error ? sendMutation.error.message : 'Unknown error'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: GroupChatMessage }) {
  const isOutbound = message.direction === 'outbound';
  return (
    <div className={`flex gap-2 ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${
          isOutbound ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        }`}
      >
        {isOutbound ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
      </div>
      <div className={`max-w-[70%] ${isOutbound ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`flex items-center gap-2 mb-0.5 ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}
        >
          <span className="text-xs font-medium text-foreground">{message.senderName}</span>
          {message.personalityName && (
            <span className="text-xs text-primary">🤖 {message.personalityName}</span>
          )}
          <span className="text-xs text-muted-foreground">{timeAgo(message.timestamp)}</span>
        </div>
        <div
          className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
            isOutbound
              ? 'bg-primary text-primary-foreground rounded-tr-none'
              : 'bg-muted text-foreground rounded-tl-none'
          }`}
        >
          {message.text}
        </div>
      </div>
    </div>
  );
}
