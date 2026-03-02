import { useRef, useEffect, useCallback, useState, memo, lazy, Suspense } from 'react';
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
import { VoiceToggle } from './VoiceToggle';
import { VoiceOverlay } from './VoiceOverlay';
import { useChatStream } from '../hooks/useChat';
import { ThinkingBlock } from './ThinkingBlock';
import { useVoice } from '../hooks/useVoice';
import { usePushToTalk } from '../hooks/usePushToTalk';
import type { Personality, Conversation, CreationEvent } from '../types';
import type { ChatMessage } from '../types';
import { sanitizeText } from '../utils/sanitize';
import { ChatMarkdown } from './ChatMarkdown';
import { GroupChatPage } from './GroupChatPage';

const ReplayDialog = lazy(() => import('./chat/ReplayDialog').then((m) => ({ default: m.ReplayDialog })));
const BranchTreeView = lazy(() => import('./chat/BranchTreeView').then((m) => ({ default: m.BranchTreeView })));
import { PersonalityAvatar } from './PersonalityEditor';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';

// ── MessageBubble ─────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: ChatMessage;
  index: number;
  personality: Personality | undefined;
  isExpanded: boolean;
  isRemembered: boolean;
  feedbackValue: 'positive' | 'negative' | undefined;
  isBeingEdited: boolean;
  isPending: boolean;
  onToggleBrain: (i: number) => void;
  onRemember: (i: number) => void;
  onFeedback: (i: number, type: 'positive' | 'negative') => void;
  onEditStart: (i: number) => void;
  onBranch?: (i: number) => void;
}

const MessageBubble = memo(function MessageBubble({
  msg,
  index,
  personality,
  isExpanded,
  isRemembered,
  feedbackValue,
  isBeingEdited,
  isPending,
  onToggleBrain,
  onRemember,
  onFeedback,
  onEditStart,
  onBranch,
}: MessageBubbleProps) {
  const hasBrainContext =
    msg.role === 'assistant' &&
    msg.brainContext &&
    (msg.brainContext.memoriesUsed > 0 || msg.brainContext.knowledgeUsed > 0);

  return (
    <div className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                onEditStart(index);
              }}
              className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
              title="Edit and resend from here"
              data-testid={`edit-msg-${index}`}
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}

          {/* Branch button */}
          {!isPending && onBranch && (
            <button
              onClick={() => {
                onBranch(index);
              }}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
              title="Branch from this message"
              data-testid={`branch-msg-${index}`}
            >
              <GitBranch className="w-3 h-3" />
            </button>
          )}

          {/* Brain context indicator */}
          {hasBrainContext && (
            <button
              onClick={() => {
                onToggleBrain(index);
              }}
              className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
              data-testid={`brain-indicator-${index}`}
              title="Brain context was used"
            >
              <Brain className="w-3 h-3" />
              <span>{msg.brainContext!.memoriesUsed + msg.brainContext!.knowledgeUsed}</span>
            </button>
          )}
        </div>

        {/* Brain context snippets popover */}
        {isExpanded && msg.brainContext && (
          <div
            className="mb-2 p-2 rounded bg-background/80 border text-xs space-y-1"
            data-testid={`brain-context-${index}`}
          >
            <div className="font-medium flex items-center gap-1">
              <Brain className="w-3 h-3" /> Brain Context
            </div>
            <div className="text-muted-foreground">
              {msg.brainContext.memoriesUsed} memories, {msg.brainContext.knowledgeUsed} knowledge
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
          ((msg.toolCalls?.length ?? 0) > 0 || (msg.creationEvents?.length ?? 0) > 0) && (
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
                      {tc.isMcp && tc.serverName ? `${tc.serverName}: ${tc.toolName}` : tc.label}
                    </span>
                  ))}
                </div>
              )}
              {/* Creation outcomes */}
              {msg.creationEvents?.map((ev: CreationEvent, j: number) => (
                <div
                  key={j}
                  className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-md border border-primary/20"
                  data-testid={`creation-event-${index}-${j}`}
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
                onRemember(index);
              }}
              disabled={isRemembered}
              className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors ${
                isRemembered ? 'text-primary opacity-70' : 'opacity-40 hover:opacity-70'
              }`}
              data-testid={`remember-btn-${index}`}
              title={isRemembered ? 'Remembered' : 'Remember this response'}
            >
              <Bookmark className={`w-3 h-3 ${isRemembered ? 'fill-current' : ''}`} />
              {isRemembered ? 'Remembered' : 'Remember'}
            </button>
          )}

          {/* Feedback buttons on assistant messages */}
          {msg.role === 'assistant' && (
            <>
              <button
                onClick={() => {
                  onFeedback(index, 'positive');
                }}
                disabled={feedbackValue !== undefined}
                className={`inline-flex items-center p-0.5 rounded hover:bg-primary/10 transition-colors ${
                  feedbackValue === 'positive'
                    ? 'text-green-400 opacity-90'
                    : 'opacity-30 hover:opacity-60'
                }`}
                data-testid={`feedback-up-${index}`}
                title="Good response"
              >
                <ThumbsUp
                  className={`w-3 h-3 ${feedbackValue === 'positive' ? 'fill-current' : ''}`}
                />
              </button>
              <button
                onClick={() => {
                  onFeedback(index, 'negative');
                }}
                disabled={feedbackValue !== undefined}
                className={`inline-flex items-center p-0.5 rounded hover:bg-primary/10 transition-colors ${
                  feedbackValue === 'negative'
                    ? 'text-red-400 opacity-90'
                    : 'opacity-30 hover:opacity-60'
                }`}
                data-testid={`feedback-down-${index}`}
                title="Poor response"
              >
                <ThumbsDown
                  className={`w-3 h-3 ${feedbackValue === 'negative' ? 'fill-current' : ''}`}
                />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

// ── ChatInputArea ─────────────────────────────────────────────────────────────

interface ChatInputAreaProps {
  onSend: (text: string) => void;
  isPending: boolean;
  disabled?: boolean;
  editValue: string;
  onCancelEdit: () => void;
  isEditing: boolean;
  voice: ReturnType<typeof useVoice>;
  ptt: ReturnType<typeof usePushToTalk>;
  hasVision: boolean;
  hasAuditory: boolean;
  personalityName: string | undefined;
  onTyping: () => void;
}

const ChatInputArea = memo(function ChatInputArea({
  onSend,
  isPending,
  disabled,
  editValue,
  onCancelEdit,
  isEditing,
  voice,
  ptt,
  hasVision,
  hasAuditory,
  personalityName,
  onTyping,
}: ChatInputAreaProps) {
  const [localInput, setLocalInput] = useState('');

  // Seed localInput from editValue when editing starts or the message changes
  useEffect(() => {
    setLocalInput(editValue);
  }, [editValue]);

  // Append voice transcript
  useEffect(() => {
    if (voice.transcript) {
      setLocalInput((prev) => prev + voice.transcript);
      voice.clearTranscript();
    }
  }, [voice.transcript]); // eslint-disable-line react-hooks/exhaustive-deps

  // Append PTT transcript (detect new transcript via value change)
  const prevPttTranscript = useRef('');
  useEffect(() => {
    if (ptt.transcript && ptt.transcript !== prevPttTranscript.current) {
      setLocalInput((prev) => prev + ptt.transcript);
      prevPttTranscript.current = ptt.transcript;
    }
  }, [ptt.transcript]);

  const handleSend = () => {
    const trimmed = localInput.trim();
    if (!trimmed || isPending) return;
    onSend(trimmed);
    setLocalInput('');
  };

  const handleCancel = () => {
    setLocalInput('');
    onCancelEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t pt-4">
      {/* Edit mode indicator */}
      {isEditing && (
        <div className="flex items-center justify-between bg-primary/10 text-primary text-xs px-3 py-1.5 rounded-t-lg border border-b-0 border-primary/20 mb-0">
          <div className="flex items-center gap-1.5">
            <Pencil className="w-3 h-3" />
            <span>Editing message — history from this point will be replaced</span>
          </div>
          <button
            onClick={handleCancel}
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
          value={localInput}
          onChange={(e) => {
            setLocalInput(e.target.value);
            onTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? 'No AI provider keys configured. Add one in Administration > Secrets.'
              : `Message ${personalityName ?? 'the assistant'}...`
          }
          disabled={isPending || disabled}
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
          disabled={!localInput.trim() || isPending || disabled}
          className="btn btn-ghost px-3 py-3 rounded-lg disabled:opacity-50 h-[52px]"
          title={isEditing ? 'Update and resend' : 'Send message'}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isEditing ? (
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
  );
});

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
  const [rememberedIndices, setRememberedIndices] = useState<Set<number>>(new Set());
  const [feedbackGiven, setFeedbackGiven] = useState<Map<number, 'positive' | 'negative'>>(
    new Map()
  );
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
      sendMessage(text);
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
          queryClient.invalidateQueries({ queryKey: ['model-info'] });
        })
        .catch(() => {
          // Silently fail - user can manually switch if needed
        });
    }
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
                      {personality ? (
                        <div className="w-4 h-4 flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-muted text-muted-foreground">
                          <PersonalityAvatar personality={personality} size={16} />
                        </div>
                      ) : (
                        <MessageSquare className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      )}
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

                {/* Strategy picker */}
                <div className="relative">
                  <button
                    onClick={() => setShowStrategyPicker((v) => !v)}
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
                      onClick={() => setShowReplayDialog(true)}
                      className="btn-ghost text-xs px-2 py-1.5 rounded-full border"
                      title="Replay with different model"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setShowBranchTree((v) => !v)}
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
                          onBranch={handleBranch}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live streaming response */}
              {isPending && (
                <div className="flex justify-start mb-4">
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

      {/* Branch tree side panel */}
      {showBranchTree && selectedConversationId && (
        <Suspense fallback={null}>
          <div className="w-80 flex-shrink-0">
            <BranchTreeView
              conversationId={selectedConversationId}
              activeConversationId={selectedConversationId}
              onNavigate={(id) => {
                setSelectedConversationId(id);
                setShowBranchTree(false);
              }}
              onClose={() => setShowBranchTree(false)}
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
            onClose={() => setShowReplayDialog(false)}
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
