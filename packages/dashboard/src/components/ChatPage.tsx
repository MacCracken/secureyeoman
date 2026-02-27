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
  MessagesSquare,
  Pencil,
  Check,
  X,
  ImagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Wrench,
  Star,
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
} from '../api/client';
import { ModelWidget } from './ModelWidget';
import { VoiceToggle } from './VoiceToggle';
import { VoiceOverlay } from './VoiceOverlay';
import { useChatStream } from '../hooks/useChat';
import { ThinkingBlock } from './ThinkingBlock';
import { useVoice } from '../hooks/useVoice';
import { usePushToTalk } from '../hooks/usePushToTalk';
import type { Personality, BrainContext, Conversation, CreationEvent } from '../types';
import { sanitizeText } from '../utils/sanitize';
import { ChatMarkdown } from './ChatMarkdown';
import { GroupChatPage } from './GroupChatPage';
import { PersonalityAvatar } from './PersonalityEditor';
import { Link } from 'react-router-dom';

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
  const setSelectedConversationId = (id: string | null) => {
    if (id) localStorage.setItem('soul:chatConversationId', id);
    else localStorage.removeItem('soul:chatConversationId');
    setSelectedConversationIdRaw(id);
  };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeSection, setActiveSection] = useState<'personality' | 'group'>('personality');

  const queryClient = useQueryClient();

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const { data: modelInfoData } = useQuery({
    queryKey: ['model-info'],
    queryFn: fetchModelInfo,
  });

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
    refetchInterval: 30000,
  });

  const conversations = conversationsData?.conversations ?? [];

  // Validate the restored conversation ID once conversations are loaded.
  // If the stored ID is not found (different auth session, deleted conversation, etc.)
  // clear it so we start with an empty chat instead of a broken state.
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

  const personalityCapabilities = personality?.body?.capabilities ?? [];
  const hasVision = personalityCapabilities.includes('vision');
  const hasAuditory = personalityCapabilities.includes('auditory');

  const [expandedBrainIdx, setExpandedBrainIdx] = useState<number | null>(null);
  const [rememberedIndices, setRememberedIndices] = useState<Set<number>>(new Set());
  const [feedbackGiven, setFeedbackGiven] = useState<Map<number, 'positive' | 'negative'>>(
    new Map()
  );
  // Message editing state — tracks which user message is being edited
  const [editingMsgIdx, setEditingMsgIdx] = useState<number | null>(null);

  const {
    messages,
    input,
    setInput,
    handleSend,
    isPending,
    clearMessages,
    conversationId,
    streamingThinking,
    streamingContent,
    activeToolCalls,
  } = useChatStream({
    personalityId: effectivePersonalityId,
    conversationId: selectedConversationId,
    memoryEnabled,
  });

  // Track whether any tool calls occurred during the current stream so we can
  // draw a separator before the response even after the badges have cleared.
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

  const handleFeedback = useCallback(
    (msgIndex: number, feedback: 'positive' | 'negative') => {
      if (feedbackGiven.has(msgIndex)) return;
      const msgId = `msg_${msgIndex}`;
      submitFeedback(conversationId ?? 'default', msgId, feedback).catch(() => {});
      setFeedbackGiven((prev) => new Map(prev).set(msgIndex, feedback));
    },
    [conversationId, feedbackGiven]
  );

  const handleNewChat = useCallback(() => {
    setSelectedConversationId(null);
    clearMessages();
    setRememberedIndices(new Set());
    setExpandedBrainIdx(null);
    setEditingMsgIdx(null);
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
          queryClient.invalidateQueries({ queryKey: ['model-info'] });
        })
        .catch(() => {
          // Silently fail - user can manually switch if needed
        });
    }
  }, [effectivePersonalityId, queryClient]);

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

  const handleCancelEdit = useCallback(() => {
    setEditingMsgIdx(null);
    setInput('');
  }, [setInput]);

  /** Unified send: clears edit state and sends via streaming hook. */
  const doSend = useCallback(() => {
    setEditingMsgIdx(null);
    handleSend();
  }, [handleSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    },
    [doSend]
  );

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
            <>
              {/* Backdrop on mobile */}
              <div
                className="fixed inset-0 bg-black/30 z-20 sm:hidden"
                onClick={() => {
                  setSidebarOpen(false);
                }}
              />
              <div
                className="fixed left-0 top-0 bottom-0 w-72 bg-background z-30 border-r p-3 flex flex-col sm:static sm:w-64 sm:z-auto sm:p-0 sm:pr-3"
                data-testid="conversation-sidebar"
              >
                {/* Mobile header */}
                <div className="flex items-center justify-between mb-2 sm:hidden">
                  <span className="text-sm font-semibold">Conversations</span>
                  <button
                    onClick={() => {
                      setSidebarOpen(false);
                    }}
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

                <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
                  {conversationsLoading && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => {
                        handleSelectConversation(conv);
                      }}
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
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <input
                              value={editTitle}
                              onChange={(e) => {
                                setEditTitle(e.target.value);
                              }}
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
                            onClick={(e) => {
                              handleStartRename(e, conv);
                            }}
                            className="text-muted-foreground hover:text-foreground"
                            data-testid={`rename-btn-${conv.id}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              handleDeleteConversation(e, conv.id);
                            }}
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
                          // Clear conversation state so the sidebar reloads for this personality
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
                                queryClient.invalidateQueries({ queryKey: ['model-info'] });
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
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 pb-4">
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

              {messages.map((msg, i) => {
                const hasBrainContext =
                  msg.role === 'assistant' &&
                  msg.brainContext &&
                  (msg.brainContext.memoriesUsed > 0 || msg.brainContext.knowledgeUsed > 0);
                const isBeingEdited = editingMsgIdx === i;

                return (
                  <div
                    key={i}
                    className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[90%] sm:max-w-[75%] md:max-w-[70%] rounded-lg px-4 py-3 break-words ${
                        msg.role === 'user'
                          ? isBeingEdited
                            ? 'bg-primary/70 text-primary-foreground ring-2 ring-primary'
                            : 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {msg.role === 'user' ? (
                          <User className="w-3 h-3" />
                        ) : personality ? (
                          <PersonalityAvatar personality={personality} size={12} />
                        ) : (
                          <Bot className="w-3 h-3" />
                        )}
                        <span className="text-xs opacity-70">
                          {msg.role === 'user' ? 'You' : (personality?.name ?? 'Assistant')}
                        </span>
                        {msg.model && <span className="text-xs opacity-50">{msg.model}</span>}
                        {msg.timestamp != null && (
                          <span className="text-xs opacity-40 ml-auto">
                            {new Date(msg.timestamp).toLocaleDateString([], {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        )}

                        {/* Edit button on user messages */}
                        {msg.role === 'user' && !isPending && (
                          <button
                            onClick={() => {
                              setEditingMsgIdx(i);
                              setInput(msg.content);
                            }}
                            className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                            title="Edit and resend from here"
                            data-testid={`edit-msg-${i}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}

                        {/* Brain context indicator */}
                        {hasBrainContext && (
                          <button
                            onClick={() => {
                              setExpandedBrainIdx(expandedBrainIdx === i ? null : i);
                            }}
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
                            {msg.brainContext.memoriesUsed} memories,{' '}
                            {msg.brainContext.knowledgeUsed} knowledge
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

                      {/* Phase 1 — Thinking */}
                      {msg.role === 'assistant' && msg.thinkingContent && (
                        <ThinkingBlock thinking={msg.thinkingContent} />
                      )}

                      {/* Phase 2 — Tool use (badges + creation outcomes), shown before the response */}
                      {msg.role === 'assistant' &&
                        ((msg.toolCalls?.length ?? 0) > 0 ||
                          (msg.creationEvents?.length ?? 0) > 0) && (
                          <div
                            className={`space-y-1 mb-2 ${msg.thinkingContent ? 'border-t border-muted-foreground/15 pt-2 mt-1' : ''}`}
                          >
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mb-1">
                              <Wrench className="w-3 h-3 shrink-0" />
                              <span>Tools used</span>
                            </div>
                            {/* Tool call badges */}
                            {msg.toolCalls && msg.toolCalls.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {msg.toolCalls.map((tc, j) => (
                                  <span
                                    key={j}
                                    className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full"
                                  >
                                    <Sparkles className="w-2.5 h-2.5" />
                                    {tc.isMcp && tc.serverName
                                      ? `${tc.serverName}: ${tc.toolName}`
                                      : tc.label}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Creation outcomes */}
                            {msg.creationEvents?.map((ev: CreationEvent, j: number) => (
                              <div
                                key={j}
                                className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-md border border-primary/20"
                                data-testid={`creation-event-${i}-${j}`}
                              >
                                <Sparkles className="w-3 h-3 shrink-0" />
                                <span>
                                  {ev.label} {ev.action ?? 'Created'}:{' '}
                                  <strong className="font-medium">{sanitizeText(ev.name)}</strong>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                      {/* Phase 3 — Response */}
                      {msg.role === 'assistant' ? (
                        <div
                          className={
                            msg.thinkingContent ||
                            (msg.toolCalls?.length ?? 0) > 0 ||
                            (msg.creationEvents?.length ?? 0) > 0
                              ? 'border-t border-muted-foreground/15 pt-2 mt-1'
                              : ''
                          }
                        >
                          <ChatMarkdown content={sanitizeText(msg.content)} size="sm" />
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{sanitizeText(msg.content)}</p>
                      )}

                      <div className="flex items-center gap-2 mt-1">
                        {msg.tokensUsed !== undefined && (
                          <span className="text-xs opacity-50">{msg.tokensUsed} tokens</span>
                        )}

                        {/* Remember button on assistant messages */}
                        {msg.role === 'assistant' && (
                          <button
                            onClick={() => {
                              handleRemember(i, msg.content);
                            }}
                            disabled={rememberedIndices.has(i)}
                            className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors ${
                              rememberedIndices.has(i)
                                ? 'text-primary opacity-70'
                                : 'opacity-40 hover:opacity-70'
                            }`}
                            data-testid={`remember-btn-${i}`}
                            title={
                              rememberedIndices.has(i) ? 'Remembered' : 'Remember this response'
                            }
                          >
                            <Bookmark
                              className={`w-3 h-3 ${rememberedIndices.has(i) ? 'fill-current' : ''}`}
                            />
                            {rememberedIndices.has(i) ? 'Remembered' : 'Remember'}
                          </button>
                        )}

                        {/* Feedback buttons on assistant messages */}
                        {msg.role === 'assistant' && (
                          <>
                            <button
                              onClick={() => {
                                handleFeedback(i, 'positive');
                              }}
                              disabled={feedbackGiven.has(i)}
                              className={`inline-flex items-center p-0.5 rounded hover:bg-primary/10 transition-colors ${
                                feedbackGiven.get(i) === 'positive'
                                  ? 'text-green-400 opacity-90'
                                  : 'opacity-30 hover:opacity-60'
                              }`}
                              data-testid={`feedback-up-${i}`}
                              title="Good response"
                            >
                              <ThumbsUp
                                className={`w-3 h-3 ${feedbackGiven.get(i) === 'positive' ? 'fill-current' : ''}`}
                              />
                            </button>
                            <button
                              onClick={() => {
                                handleFeedback(i, 'negative');
                              }}
                              disabled={feedbackGiven.has(i)}
                              className={`inline-flex items-center p-0.5 rounded hover:bg-primary/10 transition-colors ${
                                feedbackGiven.get(i) === 'negative'
                                  ? 'text-red-400 opacity-90'
                                  : 'opacity-30 hover:opacity-60'
                              }`}
                              data-testid={`feedback-down-${i}`}
                              title="Poor response"
                            >
                              <ThumbsDown
                                className={`w-3 h-3 ${feedbackGiven.get(i) === 'negative' ? 'fill-current' : ''}`}
                              />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Live streaming response */}
              {isPending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-3 max-w-[90%] sm:max-w-[75%] break-words">
                    <div className="flex items-center gap-2 mb-1">
                      <Bot className="w-3 h-3" />
                      <span className="text-xs opacity-70">{personality?.name ?? 'Assistant'}</span>
                    </div>

                    {/* Phase 1 — Live thinking */}
                    {streamingThinking && (
                      <ThinkingBlock thinking={streamingThinking} live={true} />
                    )}

                    {/* Phase 2 — Active tool calls */}
                    {activeToolCalls.length > 0 && (
                      <div
                        className={`mb-2 ${streamingThinking ? 'border-t border-muted-foreground/15 pt-2 mt-1' : ''}`}
                      >
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mb-1.5">
                          <Wrench className="w-3 h-3 shrink-0" />
                          <span>Using tools</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {activeToolCalls.map((tc) => (
                            <span
                              key={tc.toolName}
                              className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full animate-pulse"
                            >
                              <Sparkles className="w-2.5 h-2.5" />
                              {tc.isMcp ? `${tc.serverName}: ${tc.toolName}` : tc.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Phase 3 — Response */}
                    {streamingContent ? (
                      <div
                        className={
                          streamingThinking || hadActiveTools
                            ? 'border-t border-muted-foreground/15 pt-2 mt-1'
                            : ''
                        }
                      >
                        <div className="text-sm whitespace-pre-wrap">{streamingContent}</div>
                      </div>
                    ) : (
                      !streamingThinking &&
                      activeToolCalls.length === 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-muted-foreground animate-pulse">
                            Thinking
                          </span>
                          <div className="flex gap-1">
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
                      )
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t pt-4">
              {/* Edit mode indicator */}
              {editingMsgIdx !== null && (
                <div className="flex items-center justify-between bg-primary/10 text-primary text-xs px-3 py-1.5 rounded-t-lg border border-b-0 border-primary/20 mb-0">
                  <div className="flex items-center gap-1.5">
                    <Pencil className="w-3 h-3" />
                    <span>Editing message — history from this point will be replaced</span>
                  </div>
                  <button
                    onClick={handleCancelEdit}
                    className="hover:opacity-80 transition-opacity"
                    title="Cancel edit"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
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
                  onChange={(e) => {
                    setInput(e.target.value);
                  }}
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
                  onClick={doSend}
                  disabled={!input.trim() || isPending}
                  className="btn btn-ghost px-3 py-3 rounded-lg disabled:opacity-50 h-[52px]"
                  title={editingMsgIdx !== null ? 'Update and resend' : 'Send message'}
                >
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : editingMsgIdx !== null ? (
                    <Check className="w-4 h-4" />
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
      ) : (
        <div className="flex-1 min-h-0">
          <GroupChatPage />
        </div>
      )}
    </div>
  );
}
