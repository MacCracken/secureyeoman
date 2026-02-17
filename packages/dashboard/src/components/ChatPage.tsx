import { useRef, useEffect, useCallback, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Send,
  Loader2,
  Bot,
  User,
  ChevronDown,
  Brain,
  Bookmark,
  Plus,
  Trash2,
  MessageSquare,
  Pencil,
  Check,
  X,
  ImagePlus,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import {
  fetchPersonalities,
  switchModel,
  fetchModelInfo,
  rememberChatMessage,
  fetchConversations,
  deleteConversation,
  renameConversation,
} from '../api/client';
import { ModelWidget } from './ModelWidget';
import { VoiceToggle } from './VoiceToggle';
import { VoiceOverlay } from './VoiceOverlay';
import { useChat } from '../hooks/useChat';
import { useVoice } from '../hooks/useVoice';
import { usePushToTalk } from '../hooks/usePushToTalk';
import type { Personality, BrainContext, Conversation } from '../types';
import { sanitizeText } from '../utils/sanitize';

export function ChatPage() {
  const [showModelWidget, setShowModelWidget] = useState(false);
  const [showPersonalityPicker, setShowPersonalityPicker] = useState(false);
  const [selectedPersonalityId, setSelectedPersonalityId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const queryClient = useQueryClient();

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const { data: modelInfoData } = useQuery({
    queryKey: ['modelInfo'],
    queryFn: fetchModelInfo,
  });

  const { data: conversationsData, isLoading: conversationsLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => fetchConversations({ limit: 50 }),
    refetchInterval: 30000,
  });

  const conversations = conversationsData?.conversations ?? [];

  const currentModel = modelInfoData?.current
    ? `${modelInfoData.current.provider}/${modelInfoData.current.model}`
    : null;

  const personalities = personalitiesData?.personalities ?? [];
  const activePersonality = personalities.find((p) => p.isActive);
  const effectivePersonalityId = selectedPersonalityId ?? activePersonality?.id ?? null;
  const personality =
    personalities.find((p) => p.id === effectivePersonalityId) ?? activePersonality ?? null;

  const personalityCapabilities = personality?.body?.capabilities ?? [];
  const hasVision = personalityCapabilities.includes('vision');
  const hasAuditory = personalityCapabilities.includes('auditory');

  const [expandedBrainIdx, setExpandedBrainIdx] = useState<number | null>(null);
  const [rememberedIndices, setRememberedIndices] = useState<Set<number>>(new Set());

  const { messages, input, setInput, handleSend, isPending, clearMessages, conversationId } =
    useChat({
      personalityId: effectivePersonalityId,
      conversationId: selectedConversationId,
      memoryEnabled,
    });

  // Refresh conversation list when a new conversation is created
  useEffect(() => {
    if (conversationId && !selectedConversationId) {
      setSelectedConversationId(conversationId);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  }, [conversationId, selectedConversationId, queryClient]);

  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (selectedConversationId) {
        setSelectedConversationId(null);
        clearMessages();
      }
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameConversation(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setEditingConversationId(null);
    },
  });

  const rememberMutation = useMutation({
    mutationFn: ({ content, context }: { content: string; context?: Record<string, string> }) =>
      rememberChatMessage(content, context),
  });

  const handleRemember = useCallback(
    (msgIndex: number, content: string) => {
      rememberMutation.mutate({ content });
      setRememberedIndices((prev) => new Set(prev).add(msgIndex));
    },
    [rememberMutation]
  );

  const handleNewChat = useCallback(() => {
    setSelectedConversationId(null);
    clearMessages();
    setRememberedIndices(new Set());
    setExpandedBrainIdx(null);
  }, [clearMessages]);

  const handleSelectConversation = useCallback((conv: Conversation) => {
    setSelectedConversationId(conv.id);
    setRememberedIndices(new Set());
    setExpandedBrainIdx(null);
    setSidebarOpen(false);
  }, []);

  const handleDeleteConversation = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      deleteMutation.mutate(id);
    },
    [deleteMutation]
  );

  const handleStartRename = useCallback((e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    setEditingConversationId(conv.id);
    setEditTitle(conv.title);
  }, []);

  const handleConfirmRename = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (editingConversationId && editTitle.trim()) {
        renameMutation.mutate({ id: editingConversationId, title: editTitle.trim() });
      }
    },
    [editingConversationId, editTitle, renameMutation]
  );

  const handleCancelRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConversationId(null);
  }, []);

  const voice = useVoice();

  const ptt = usePushToTalk(
    { hotkey: 'ctrl+shift+v', maxDurationMs: 60000, silenceTimeoutMs: 2000 },
    (transcript) => {
      if (transcript) {
        setInput(input + transcript);
      }
    }
  );

  // Switch to personality's default model when personality changes
  useEffect(() => {
    if (personality?.defaultModel) {
      switchModel({
        provider: personality.defaultModel.provider,
        model: personality.defaultModel.model,
      })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['modelInfo'] });
        })
        .catch(() => {
          // Silently fail - user can manually switch if needed
        });
    }
  }, [effectivePersonalityId, queryClient]);

  // Handle model switch via ModelWidget
  const handleModelSwitch = useCallback(() => {
    // Model widget handles its own state
  }, []);

  // Feed voice transcript into input
  useEffect(() => {
    if (voice.transcript) {
      setInput((prev: string) => prev + voice.transcript);
      voice.clearTranscript();
    }
  }, [voice.transcript, setInput, voice.clearTranscript]);

  // Speak assistant messages when voice is enabled
  const lastMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length > lastMsgCount.current) {
      const latest = messages[messages.length - 1];
      if (latest.role === 'assistant' && voice.voiceEnabled) {
        voice.speak(latest.content);
      }
    }
    lastMsgCount.current = messages.length;
  }, [messages.length, voice.voiceEnabled, voice.speak, messages]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isPending]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="flex h-[calc(100vh-100px)] sm:h-[calc(100vh-140px)] gap-0 relative">
      {/* Conversation Sidebar — collapsible */}
      {sidebarOpen && (
        <>
          {/* Backdrop on mobile */}
          <div
            className="fixed inset-0 bg-black/30 z-20 sm:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div
            className="fixed left-0 top-0 bottom-0 w-72 bg-background z-30 border-r p-3 flex flex-col sm:static sm:w-64 sm:z-auto sm:p-0 sm:pr-3"
            data-testid="conversation-sidebar"
          >
            {/* Mobile header */}
            <div className="flex items-center justify-between mb-2 sm:hidden">
              <span className="text-sm font-semibold">Conversations</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded hover:bg-muted/50 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleNewChat}
              className="flex items-center gap-2 w-full px-3 py-2 mb-2 rounded-lg btn-primary text-sm"
              data-testid="new-chat-btn"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>

            <div className="flex-1 overflow-y-auto space-y-1">
              {conversationsLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}

              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                    selectedConversationId === conv.id
                      ? 'bg-primary/15 border-l-2 border-primary'
                      : 'hover:bg-muted/50'
                  }`}
                  data-testid={`conversation-item-${conv.id}`}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    {editingConversationId === conv.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="flex-1 min-w-0 text-sm bg-background border rounded px-1 py-0.5"
                          autoFocus
                          data-testid="rename-input"
                        />
                        <button
                          onClick={handleConfirmRename}
                          className="text-primary hover:text-primary/80"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={handleCancelRename}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="truncate block">{conv.title}</span>
                    )}
                  </div>
                  {editingConversationId !== conv.id && (
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button
                        onClick={(e) => handleStartRename(e, conv)}
                        className="text-muted-foreground hover:text-foreground"
                        data-testid={`rename-btn-${conv.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                        className="text-muted-foreground hover:text-destructive"
                        data-testid={`delete-btn-${conv.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {!conversationsLoading && conversations.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No conversations yet
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Sidebar toggle button - positioned to the left of the sidebar */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className={`absolute top-0 z-20 p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors ${
          sidebarOpen ? 'left-64 sm:left-64' : 'left-0'
        }`}
        data-testid="sidebar-toggle"
        title={sidebarOpen ? 'Hide conversations' : 'Show conversations'}
      >
        {sidebarOpen ? (
          <PanelLeftClose className="w-5 h-5" />
        ) : (
          <PanelLeftOpen className="w-5 h-5" />
        )}
      </button>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${sidebarOpen ? 'pl-12 sm:pl-68' : 'pl-8'}`}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b mb-4">
          <div className="relative">
            <button
              onClick={() => setShowPersonalityPicker((v) => !v)}
              className="flex items-center gap-3 hover:bg-muted/50 rounded-lg px-2 py-1.5 transition-colors"
              data-testid="personality-selector"
            >
              <Bot className="w-6 h-6 text-primary flex-shrink-0" />
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-lg font-semibold">
                    Chat{personality ? ` with ${personality.name}` : ''}
                  </h2>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
                {personality?.description && (
                  <p className="text-xs text-muted-foreground hidden sm:block">
                    {personality.description}
                  </p>
                )}
              </div>
            </button>

            {showPersonalityPicker && personalities.length > 1 && (
              <div className="absolute left-0 right-0 sm:right-auto top-full mt-1 z-50 card shadow-lg w-full sm:w-80 max-h-64 overflow-y-auto">
                {personalities.map((p: Personality) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPersonalityId(p.id);
                      setShowPersonalityPicker(false);
                      if (p.defaultModel) {
                        switchModel({
                          provider: p.defaultModel.provider,
                          model: p.defaultModel.model,
                        })
                          .then(() => {
                            queryClient.invalidateQueries({ queryKey: ['modelInfo'] });
                          })
                          .catch(() => {});
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors ${
                      p.id === effectivePersonalityId
                        ? 'bg-primary/15 border-l-2 border-primary'
                        : ''
                    }`}
                    data-testid={`personality-option-${p.id}`}
                  >
                    <Bot className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{p.name}</span>
                        {p.isActive && <span className="text-xs text-success">(active)</span>}
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setMemoryEnabled((v) => !v)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                memoryEnabled
                  ? 'bg-primary/15 border-primary text-primary'
                  : 'btn-ghost text-muted-foreground'
              }`}
              title={
                memoryEnabled
                  ? 'Memory is on — conversations are remembered and recalled'
                  : 'Memory is off — no memory access or saving'
              }
            >
              <Brain className="w-3.5 h-3.5" />
              {memoryEnabled ? 'Memory On' : 'Memory Off'}
            </button>
            <button
              onClick={() => setShowModelWidget((v) => !v)}
              className="btn-ghost text-xs px-3 py-1.5 rounded-full border"
            >
              Model
            </button>
            {showModelWidget && (
              <div className="absolute right-0 top-full mt-2 z-50">
                <ModelWidget
                  onClose={() => setShowModelWidget(false)}
                  onModelSwitch={handleModelSwitch}
                />
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  Start a conversation{personality ? ` with ${personality.name}` : ''}.
                </p>
                {currentModel && (
                  <p className="text-xs mt-1 text-primary/70">Using Model: {currentModel}</p>
                )}
                <p className="text-xs mt-1">Conversations are automatically saved.</p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const hasBrainContext =
              msg.role === 'assistant' &&
              msg.brainContext &&
              (msg.brainContext.memoriesUsed > 0 || msg.brainContext.knowledgeUsed > 0);

            return (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-lg px-4 py-3 ${
                    msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {msg.role === 'user' ? (
                      <User className="w-3 h-3" />
                    ) : (
                      <Bot className="w-3 h-3" />
                    )}
                    <span className="text-xs opacity-70">
                      {msg.role === 'user' ? 'You' : (personality?.name ?? 'Assistant')}
                    </span>
                    {msg.model && <span className="text-xs opacity-50">{msg.model}</span>}

                    {/* Brain context indicator */}
                    {hasBrainContext && (
                      <button
                        onClick={() => setExpandedBrainIdx(expandedBrainIdx === i ? null : i)}
                        className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
                        data-testid={`brain-indicator-${i}`}
                        title="Brain context was used"
                      >
                        <Brain className="w-3 h-3" />
                        <span>
                          {msg.brainContext!.memoriesUsed + msg.brainContext!.knowledgeUsed}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Brain context snippets popover */}
                  {expandedBrainIdx === i && msg.brainContext && (
                    <div
                      className="mb-2 p-2 rounded bg-background/80 border text-xs space-y-1"
                      data-testid={`brain-context-${i}`}
                    >
                      <div className="font-medium flex items-center gap-1">
                        <Brain className="w-3 h-3" /> Brain Context
                      </div>
                      <div className="text-muted-foreground">
                        {msg.brainContext.memoriesUsed} memories, {msg.brainContext.knowledgeUsed}{' '}
                        knowledge
                      </div>
                      {msg.brainContext.contextSnippets.length > 0 && (
                        <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                          {msg.brainContext.contextSnippets.map((s, j) => (
                            <li key={j}>{sanitizeText(s)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <p className="text-sm whitespace-pre-wrap">{sanitizeText(msg.content)}</p>

                  <div className="flex items-center gap-2 mt-1">
                    {msg.tokensUsed !== undefined && (
                      <span className="text-xs opacity-50">{msg.tokensUsed} tokens</span>
                    )}

                    {/* Remember button on assistant messages */}
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => handleRemember(i, msg.content)}
                        disabled={rememberedIndices.has(i)}
                        className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors ${
                          rememberedIndices.has(i)
                            ? 'text-primary opacity-70'
                            : 'opacity-40 hover:opacity-70'
                        }`}
                        data-testid={`remember-btn-${i}`}
                        title={rememberedIndices.has(i) ? 'Remembered' : 'Remember this response'}
                      >
                        <Bookmark
                          className={`w-3 h-3 ${rememberedIndices.has(i) ? 'fill-current' : ''}`}
                        />
                        {rememberedIndices.has(i) ? 'Remembered' : 'Remember'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {isPending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-3 h-3" />
                  <span className="text-xs opacity-70">{personality?.name ?? 'Assistant'}</span>
                </div>
                <div className="flex gap-1 mt-2">
                  <span
                    className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t pt-4">
          <div className="flex gap-2 sm:gap-3 items-end">
            {hasVision && (
              <button
                className="btn-ghost p-3 rounded-lg text-muted-foreground hover:text-foreground"
                title="Upload image (vision enabled)"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${personality?.name ?? 'the assistant'}...`}
              disabled={isPending}
              rows={3}
              className="flex-1 resize-none rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 min-h-[80px] max-h-[200px]"
            />
            {hasAuditory && (
              <VoiceToggle
                voiceEnabled={voice.voiceEnabled}
                isListening={voice.isListening}
                isSpeaking={voice.isSpeaking}
                supported={voice.supported}
                onToggle={voice.toggleVoice}
              />
            )}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isPending}
              className="btn-primary px-4 py-3 rounded-lg disabled:opacity-50 h-[52px]"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <VoiceOverlay
            isActive={ptt.isActive}
            audioLevel={ptt.audioLevel}
            duration={ptt.duration}
            transcript={ptt.transcript}
            error={ptt.error}
          />
        </div>
      </div>
    </div>
  );
}
