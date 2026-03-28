import { useRef, useEffect, useCallback, useState, lazy, Suspense } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Bot,
  ChevronDown,
  Brain,
  MessageSquare,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Star,
  AlertTriangle,
  GitBranch,
  RotateCcw,
} from 'lucide-react';
import {
  fetchPersonalities,
  switchModel,
  fetchModelInfo,
  rememberChatMessage,
  submitFeedback,
  fetchConversations,
  deleteConversation,
  renameConversation,
  branchFromMessage,
  fetchStrategies,
} from '../api/client';
import { ModelWidget } from './ModelWidget';
import { useChatStream } from '../hooks/useChat';
import { useVoice } from '../hooks/useVoice';
import { usePushToTalk } from '../hooks/usePushToTalk';
import type { Personality, Conversation } from '../types';
import { GroupChatPage } from './GroupChatPage';

const ReplayDialog = lazy(() =>
  import('./chat/ReplayDialog').then((m) => ({ default: m.ReplayDialog }))
);
const BranchExplorer = lazy(() =>
  import('./chat/BranchExplorer').then((m) => ({ default: m.BranchExplorer }))
);
import { PersonalityAvatar } from './PersonalitiesPage';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageBubble } from './chat/MessageBubble';
import { ChatInputArea } from './chat/ChatInputArea';
import { StreamingResponse } from './chat/StreamingResponse';
import { ConversationSidebar } from './chat/ConversationSidebar';

// ── ChatPage ──────────────────────────────────────────────────────────────────

export function ChatPage() {
  const [showModelWidget, setShowModelWidget] = useState(false);
  const [showPersonalityPicker, setShowPersonalityPicker] = useState(false);
  const [selectedPersonalityId, setSelectedPersonalityIdRaw] = useState<string | null>(() =>
    localStorage.getItem('soul:chatPersonalityId')
  );
  const setSelectedPersonalityId = (id: string | null) => {
    if (id) localStorage.setItem('soul:chatPersonalityId', id);
    else localStorage.removeItem('soul:chatPersonalityId');
    setSelectedPersonalityIdRaw(id);
  };
  const [selectedConversationId, setSelectedConversationIdRaw] = useState<string | null>(() =>
    localStorage.getItem('soul:chatConversationId')
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setSelectedConversationId = (id: string | null) => {
    if (id) localStorage.setItem('soul:chatConversationId', id);
    else localStorage.removeItem('soul:chatConversationId');
    setSelectedConversationIdRaw(id);
  };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showReplayDialog, setShowReplayDialog] = useState(false);
  const [showBranchTree, setShowBranchTree] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [selectedStrategyId, setSelectedStrategyIdRaw] = useState<string | null>(() =>
    localStorage.getItem('soul:chatStrategyId')
  );
  const setSelectedStrategyId = (id: string | null) => {
    if (id) localStorage.setItem('soul:chatStrategyId', id);
    else localStorage.removeItem('soul:chatStrategyId');
    setSelectedStrategyIdRaw(id);
  };
  const [showStrategyPicker, setShowStrategyPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Track whether the initial batch of messages has been scrolled to instantly.
  const initialScrollDone = useRef(false);
  const [activeSection, setActiveSection] = useState<'personality' | 'group'>('personality');

  // ── Typing detection refs (Fix 3) ────────────────────────────────────────
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTyping = useCallback(() => {
    isTypingRef.current = true;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 3000);
  }, []);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const queryClient = useQueryClient();

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const { data: modelInfoData } = useQuery({
    queryKey: ['model-info'],
    queryFn: fetchModelInfo,
  });

  const { data: strategiesData } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => fetchStrategies(),
  });

  const strategies = strategiesData?.items ?? [];
  const selectedStrategy = strategies.find((s) => s.id === selectedStrategyId) ?? null;

  const personalities = personalitiesData?.personalities ?? [];
  const defaultPersonality =
    personalities.find((p) => p.isDefault) ??
    [...personalities].sort((a, b) => a.name.localeCompare(b.name))[0];
  const effectivePersonalityId = selectedPersonalityId ?? defaultPersonality?.id ?? null;
  const personality =
    personalities.find((p) => p.id === effectivePersonalityId) ?? defaultPersonality ?? null;

  const { data: conversationsData, isLoading: conversationsLoading } = useQuery({
    queryKey: ['conversations', effectivePersonalityId],
    queryFn: () =>
      fetchConversations({ limit: 50, personalityId: effectivePersonalityId ?? undefined }),
    refetchInterval: () => (isTypingRef.current ? false : 30_000),
  });

  const conversations = conversationsData?.conversations ?? [];

  // Validate the restored conversation ID once conversations are loaded.
  useEffect(() => {
    if (!conversationsLoading && conversationsData && selectedConversationId) {
      const found = conversations.some((c) => c.id === selectedConversationId);
      if (!found) {
        setSelectedConversationId(null);
      }
    }
  }, [conversationsLoading, conversationsData]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentModel = modelInfoData?.current
    ? `${modelInfoData.current.provider}/${modelInfoData.current.model}`
    : null;

  const noModelsAvailable =
    modelInfoData !== undefined && Object.keys(modelInfoData.available ?? {}).length === 0;

  const personalityCapabilities = personality?.body?.capabilities ?? [];
  const hasVision = personalityCapabilities.includes('vision');
  const hasAuditory = personalityCapabilities.includes('auditory');

  const [expandedBrainIdx, setExpandedBrainIdx] = useState<number | null>(null);
  const [rememberedIndices, setRememberedIndices] = useState(new Set());
  const [feedbackGiven, setFeedbackGiven] = useState(new Map());
  const [editingMsgIdx, setEditingMsgIdx] = useState<number | null>(null);

  const {
    messages,
    sendMessage,
    isPending,
    clearMessages,
    conversationId,
    streamingThinking,
    streamingContent,
    activeToolCalls,
  } = useChatStream({
    personalityId: effectivePersonalityId,
    strategyId: selectedStrategyId,
    conversationId: selectedConversationId,
    memoryEnabled,
  });

  // Derive editValue from editingMsgIdx for ChatInputArea
  const editValue = editingMsgIdx !== null ? (messages[editingMsgIdx]?.content ?? '') : '';

  // Refs for stable callbacks
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const feedbackGivenRef = useRef(feedbackGiven);
  feedbackGivenRef.current = feedbackGiven;
  const rememberMutationRef = useRef<typeof rememberMutation | null>(null);

  // Track whether any tool calls occurred during the current stream
  const [hadActiveTools, setHadActiveTools] = useState(false);
  useEffect(() => {
    if (activeToolCalls.length > 0) setHadActiveTools(true);
  }, [activeToolCalls.length]);
  useEffect(() => {
    if (!isPending) setHadActiveTools(false);
  }, [isPending]);

  // Refresh conversation list when a new conversation is created
  useEffect(() => {
    if (conversationId && !selectedConversationId) {
      setSelectedConversationId(conversationId);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  }, [conversationId, selectedConversationId, queryClient]);

  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (selectedConversationId) {
        setSelectedConversationId(null);
        clearMessages();
      }
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameConversation(id, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setEditingConversationId(null);
    },
  });

  const rememberMutation = useMutation({
    mutationFn: ({ content, context }: { content: string; context?: Record<string, string> }) =>
      rememberChatMessage(content, context),
  });
  // Keep ref updated for use in stable callbacks
  rememberMutationRef.current = rememberMutation;

  // ── Stable callbacks for MessageBubble (memo-safe) ────────────────────────

  const handleToggleBrain = useCallback((i: number) => {
    setExpandedBrainIdx((prev) => (prev === i ? null : i));
  }, []);

  const handleRemember = useCallback((msgIndex: number) => {
    const content = messagesRef.current[msgIndex]?.content ?? '';
    rememberMutationRef.current?.mutate({ content });
    setRememberedIndices((prev) => new Set(prev).add(msgIndex));
  }, []);

  const handleFeedback = useCallback((msgIndex: number, feedback: 'positive' | 'negative') => {
    if (feedbackGivenRef.current.has(msgIndex)) return;
    const msgId = `msg_${msgIndex}`;
    submitFeedback(conversationIdRef.current ?? 'default', msgId, feedback).catch(() => {});
    setFeedbackGiven((prev) => new Map(prev).set(msgIndex, feedback));
  }, []);

  const handleEditStart = useCallback((i: number) => {
    setEditingMsgIdx(i);
  }, []);

  const handleBranch = useCallback(
    async (messageIndex: number) => {
      const cid = conversationIdRef.current;
      if (!cid) return;
      try {
        const branch = await branchFromMessage(cid, messageIndex);
        setSelectedConversationId(branch.id);
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } catch {
        // branch creation failed — silent for now
      }
    },
    [queryClient, setSelectedConversationId]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMsgIdx(null);
  }, []);

  const handleSendWrapper = useCallback(
    (text: string) => {
      setEditingMsgIdx(null);
      void sendMessage(text);
    },
    [sendMessage]
  );

  // ── Conversation management callbacks ────────────────────────────────────

  const handleNewChat = useCallback(() => {
    initialScrollDone.current = false;
    setSelectedConversationId(null);
    clearMessages();
    setRememberedIndices(new Set());
    setExpandedBrainIdx(null);
    setEditingMsgIdx(null);
  }, [clearMessages]);

  const handleSelectConversation = useCallback((conv: Conversation) => {
    initialScrollDone.current = false;
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
    () => {
      // Transcript is handled inside ChatInputArea via ptt.transcript prop
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
          void queryClient.invalidateQueries({ queryKey: ['model-info'] });
        })
        .catch(() => {
          // Silently fail - user can manually switch if needed
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePersonalityId, queryClient]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, voice.voiceEnabled, voice.speak, messages]);

  // Auto-scroll on new messages / streaming
  useEffect(() => {
    if (!messagesEndRef.current || typeof messagesEndRef.current.scrollIntoView !== 'function')
      return;
    if (!initialScrollDone.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'instant' });
      if (messages.length > 0) initialScrollDone.current = true;
    } else {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isPending]);

  // ── Virtual scrolling (Fix 6) ─────────────────────────────────────────────

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 120,
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] sm:h-[calc(100vh-140px)]">
      {/* Page header */}
      <div className="pb-2 shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Chat</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Converse with your AI personalities — switch agents, recall memory, or go hands-free with
          voice
        </p>
      </div>
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => {
            setActiveSection('personality');
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeSection === 'personality'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Personality Chat
        </button>
        <button
          onClick={() => {
            setActiveSection('group');
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeSection === 'group'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessagesSquare className="w-4 h-4" />
          Group Chat
        </button>
      </div>
      {activeSection === 'personality' ? (
        <div className="flex flex-1 min-h-0 gap-0 relative">
          {/* Conversation Sidebar — collapsible */}
          {sidebarOpen && (
            <ConversationSidebar
              conversations={conversations}
              conversationsLoading={conversationsLoading}
              selectedConversationId={selectedConversationId}
              editingConversationId={editingConversationId}
              editTitle={editTitle}
              personality={personality}
              onNewChat={handleNewChat}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
              onStartRename={handleStartRename}
              onConfirmRename={handleConfirmRename}
              onCancelRename={handleCancelRename}
              onEditTitleChange={setEditTitle}
              onClose={() => {
                setSidebarOpen(false);
              }}
            />
          )}

          {/* Sidebar toggle button */}
          <button
            onClick={() => {
              setSidebarOpen((v) => !v);
            }}
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
          <div
            className={`flex-1 flex flex-col min-w-0 ${sidebarOpen ? 'pl-12 sm:pl-64' : 'pl-8'}`}
          >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b mb-4">
              <div className="relative">
                <button
                  onClick={() => {
                    setShowPersonalityPicker((v) => !v);
                  }}
                  className="flex items-center gap-3 hover:bg-muted/50 rounded-lg px-2 py-1.5 transition-colors"
                  data-testid="personality-selector"
                >
                  {personality ? (
                    <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-muted text-primary">
                      <PersonalityAvatar personality={personality} size={24} />
                    </div>
                  ) : (
                    <Bot className="w-6 h-6 text-primary flex-shrink-0" />
                  )}
                  <div className="text-left">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-lg font-semibold">
                        Chat{personality ? ` with ${personality.name}` : ''}
                      </h2>
                      {personality?.isDefault && (
                        <span title="Default personality">
                          <Star className="w-3.5 h-3.5 fill-current text-primary flex-shrink-0" />
                        </span>
                      )}
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
                          setSelectedConversationId(null);
                          clearMessages();
                          setRememberedIndices(new Set());
                          setExpandedBrainIdx(null);
                          if (p.defaultModel) {
                            switchModel({
                              provider: p.defaultModel.provider,
                              model: p.defaultModel.model,
                            })
                              .then(() => {
                                void queryClient.invalidateQueries({ queryKey: ['model-info'] });
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
                        <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-muted text-primary">
                          <PersonalityAvatar personality={p} size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">{p.name}</span>
                            {p.isActive && <span className="text-xs text-success">(active)</span>}
                            {p.isDefault && <span className="text-xs text-primary">(default)</span>}
                          </div>
                          {p.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {p.description}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative flex items-center gap-2">
                <button
                  onClick={() => {
                    setMemoryEnabled((v) => !v);
                  }}
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
                  onClick={() => {
                    setShowModelWidget((v) => !v);
                  }}
                  className="btn-ghost text-xs px-3 py-1.5 rounded-full border font-mono max-w-[10rem] truncate"
                  title={currentModel ?? 'Select model'}
                >
                  {modelInfoData?.current.model ?? 'Model'}
                </button>
                {showModelWidget && (
                  <div className="absolute right-0 top-full mt-2 z-50">
                    <ModelWidget
                      onClose={() => {
                        setShowModelWidget(false);
                      }}
                    />
                  </div>
                )}

                {/* Strategy picker */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowStrategyPicker((v) => !v);
                    }}
                    className={`btn-ghost text-xs px-3 py-1.5 rounded-full border max-w-[10rem] truncate ${
                      selectedStrategy ? 'bg-primary/15 border-primary text-primary' : ''
                    }`}
                    title={selectedStrategy?.name ?? 'Select reasoning strategy'}
                  >
                    {selectedStrategy?.name ?? 'Strategy'}
                  </button>
                  {showStrategyPicker && (
                    <div className="absolute right-0 top-full mt-2 z-50 card p-2 shadow-lg min-w-[14rem] max-h-60 overflow-y-auto">
                      <button
                        onClick={() => {
                          setSelectedStrategyId(null);
                          setShowStrategyPicker(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs rounded hover:bg-muted ${
                          !selectedStrategyId ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        None (default)
                      </button>
                      {strategies.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSelectedStrategyId(s.id);
                            setShowStrategyPicker(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs rounded hover:bg-muted ${
                            selectedStrategyId === s.id ? 'bg-muted font-medium' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{s.name}</span>
                            <span className="text-muted-foreground text-[10px] px-1 py-0.5 rounded bg-muted">
                              {s.category}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Replay & Branches — only visible on existing conversations */}
                {selectedConversationId && (
                  <>
                    <button
                      onClick={() => {
                        setShowReplayDialog(true);
                      }}
                      className="btn-ghost text-xs px-2 py-1.5 rounded-full border"
                      title="Replay with different model"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setShowBranchTree((v) => !v);
                      }}
                      className={`btn-ghost text-xs px-2 py-1.5 rounded-full border ${showBranchTree ? 'bg-primary/15 border-primary text-primary' : ''}`}
                      title="View branch tree"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Messages — virtualised list */}
            <div
              ref={containerRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-4"
            >
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    {personalitiesData && personalities.length === 0 ? (
                      <>
                        <p className="text-sm font-medium">No personalities configured.</p>
                        <p className="text-xs mt-1">
                          <Link to="/personality" className="text-primary hover:underline">
                            Create a personality
                          </Link>{' '}
                          to start chatting.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm">
                          Start a conversation{personality ? ` with ${personality.name}` : ''}.
                        </p>
                        {currentModel && (
                          <p className="text-xs mt-1 text-primary/70">
                            Using Model: {currentModel}
                          </p>
                        )}
                        <p className="text-xs mt-1">Conversations are automatically saved.</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Virtualised message rows */}
              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const msg = messages[virtualRow.index];
                  const i = virtualRow.index;
                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="pb-4">
                        <MessageBubble
                          msg={msg}
                          index={i}
                          personality={personality ?? undefined}
                          isExpanded={expandedBrainIdx === i}
                          isRemembered={rememberedIndices.has(i)}
                          feedbackValue={feedbackGiven.get(i)}
                          isBeingEdited={editingMsgIdx === i}
                          isPending={isPending}
                          onToggleBrain={handleToggleBrain}
                          onRemember={handleRemember}
                          onFeedback={handleFeedback}
                          onEditStart={handleEditStart}
                          onBranch={(idx) => void handleBranch(idx)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live streaming response */}
              {isPending && (
                <StreamingResponse
                  personality={personality}
                  streamingThinking={streamingThinking}
                  streamingContent={streamingContent}
                  activeToolCalls={activeToolCalls}
                  hadActiveTools={hadActiveTools}
                />
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* No provider key warning */}
            {noModelsAvailable && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  No AI provider API keys configured. Add one in{' '}
                  <a href="/settings" className="underline font-medium">
                    Administration &gt; Secrets
                  </a>{' '}
                  to enable chat.
                </span>
              </div>
            )}

            {/* Input area — decoupled local state */}
            <ChatInputArea
              onSend={handleSendWrapper}
              isPending={isPending}
              disabled={noModelsAvailable}
              editValue={editValue}
              onCancelEdit={handleCancelEdit}
              isEditing={editingMsgIdx !== null}
              voice={voice}
              ptt={ptt}
              hasVision={hasVision}
              hasAuditory={hasAuditory}
              personalityName={personality?.name}
              onTyping={handleTyping}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <GroupChatPage />
        </div>
      )}

      {/* Branch explorer side panel */}
      {showBranchTree && selectedConversationId && (
        <Suspense fallback={null}>
          <div className="w-96 flex-shrink-0">
            <BranchExplorer
              conversationId={selectedConversationId}
              activeConversationId={selectedConversationId}
              onNavigate={(id) => {
                setSelectedConversationId(id);
              }}
              onCompare={(sourceId, targetId) => {
                setSelectedConversationId(sourceId);
                void queryClient.invalidateQueries({ queryKey: ['conversation', targetId] });
              }}
              onClose={() => {
                setShowBranchTree(false);
              }}
            />
          </div>
        </Suspense>
      )}

      {/* Replay dialog modal */}
      {showReplayDialog && selectedConversationId && (
        <Suspense fallback={null}>
          <ReplayDialog
            conversationId={selectedConversationId}
            open={showReplayDialog}
            onClose={() => {
              setShowReplayDialog(false);
            }}
            onReplayCreated={(replayId) => {
              setSelectedConversationId(replayId);
              setShowReplayDialog(false);
              void queryClient.invalidateQueries({ queryKey: ['conversations'] });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
