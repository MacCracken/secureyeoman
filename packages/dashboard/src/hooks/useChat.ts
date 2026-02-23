import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendChatMessage, createConversation, fetchConversation, getAccessToken } from '../api/client';
import type { ChatMessage, CreationEvent } from '../types';

export interface UseChatOptions {
  personalityId?: string | null;
  editorContent?: string;
  conversationId?: string | null;
  memoryEnabled?: boolean;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  handleSend: () => void;
  /** Re-send from a specific message index, discarding later messages. */
  resendFrom: (messageIndex: number, newContent: string) => void;
  isPending: boolean;
  clearMessages: () => void;
  conversationId: string | null;
  isLoadingConversation: boolean;
}

export function useChat(options?: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    options?.conversationId ?? null
  );
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const prevExternalId = useRef<string | null | undefined>(undefined);
  // Track IDs we auto-created so we don't re-fetch them
  const autoCreatedIds = useRef(new Set<string>());
  const queryClient = useQueryClient();

  // Load existing conversation when the external conversationId changes
  useEffect(() => {
    const newId = options?.conversationId ?? null;
    if (prevExternalId.current === newId) return;
    prevExternalId.current = newId;

    setActiveConversationId(newId);

    if (!newId) {
      setMessages([]);
      return;
    }

    // Skip fetch for conversations we just created (messages already in state)
    if (autoCreatedIds.current.has(newId)) {
      return;
    }

    setIsLoadingConversation(true);
    fetchConversation(newId)
      .then((detail) => {
        setMessages(
          detail.messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.createdAt,
            model: m.model ?? undefined,
            provider: m.provider ?? undefined,
            tokensUsed: m.tokensUsed ?? undefined,
            brainContext: m.brainContext ?? undefined,
            creationEvents: m.creationEvents ?? undefined,
          }))
        );
      })
      .catch(() => {
        setMessages([]);
      })
      .finally(() => {
        setIsLoadingConversation(false);
      });
  }, [options?.conversationId]);

  const chatMutation = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: (response) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.content,
          timestamp: Date.now(),
          model: response.model,
          provider: response.provider,
          tokensUsed: response.tokensUsed,
          brainContext: response.brainContext,
          creationEvents: response.creationEvents,
        },
      ]);
      // Refresh conversation list so sidebar shows updated message counts / ordering
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${error.message}`,
          timestamp: Date.now(),
        },
      ]);
    },
  });

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    // Auto-create conversation on first send if none exists
    let convId = activeConversationId;
    if (!convId) {
      try {
        const title = trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed;
        const conv = await createConversation(title, options?.personalityId ?? undefined);
        convId = conv.id;
        autoCreatedIds.current.add(convId);
        setActiveConversationId(convId);
        // Immediately refresh conversation list so the new conversation appears in the sidebar
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } catch {
        // Failed to create conversation — continue without persistence
      }
    }

    const history = [...messages, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const memoryOn = options?.memoryEnabled ?? true;
    chatMutation.mutate({
      message: trimmed,
      history: history.slice(0, -1),
      editorContent: options?.editorContent,
      ...(options?.personalityId ? { personalityId: options.personalityId } : {}),
      ...(convId ? { conversationId: convId } : {}),
      memoryEnabled: memoryOn,
      saveAsMemory: memoryOn,
    });
  }, [input, messages, chatMutation, options, activeConversationId, queryClient]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setActiveConversationId(null);
    autoCreatedIds.current.clear();
  }, []);

  /**
   * Truncate the message history to `messageIndex` (exclusive) and resend
   * `newContent` as a fresh user message.  The edited branch is NOT persisted
   * to the existing conversation so the stored history stays intact.
   */
  const resendFrom = useCallback(
    (messageIndex: number, newContent: string) => {
      const trimmed = newContent.trim();
      if (!trimmed || chatMutation.isPending) return;

      const historyBefore = messages.slice(0, messageIndex);
      const userMessage: ChatMessage = {
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      setMessages([...historyBefore, userMessage]);
      setInput('');

      const history = [...historyBefore, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const memoryOn = options?.memoryEnabled ?? true;
      chatMutation.mutate({
        message: trimmed,
        history: history.slice(0, -1),
        ...(options?.personalityId ? { personalityId: options.personalityId } : {}),
        // No conversationId — edited branch stored separately to avoid ghost messages
        memoryEnabled: memoryOn,
        saveAsMemory: false,
      });
    },
    [messages, chatMutation, options, setInput]
  );

  return {
    messages,
    input,
    setInput,
    handleSend,
    resendFrom,
    isPending: chatMutation.isPending,
    clearMessages,
    conversationId: activeConversationId,
    isLoadingConversation,
  };
}

// ── useChatStream ──────────────────────────────────────────────────────────────

export interface ActiveToolCall {
  toolName: string;
  label: string;
  serverName?: string;
  isMcp: boolean;
}

export interface UseChatStreamOptions {
  personalityId?: string | null;
  conversationId?: string | null;
  memoryEnabled?: boolean;
}

export interface UseChatStreamReturn {
  messages: ChatMessage[];
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  handleSend: () => void;
  isPending: boolean;
  clearMessages: () => void;
  conversationId: string | null;
  isLoadingConversation: boolean;
  streamingThinking: string;
  streamingContent: string;
  activeToolCalls: ActiveToolCall[];
}

export function useChatStream(options?: UseChatStreamOptions): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    options?.conversationId ?? null
  );
  const [streamingThinking, setStreamingThinking] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [activeToolCalls, setActiveToolCalls] = useState<ActiveToolCall[]>([]);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const prevExternalId = useRef<string | null | undefined>(undefined);
  const autoCreatedIds = useRef(new Set<string>());
  const queryClient = useQueryClient();

  // Load existing conversation when the external conversationId changes
  useEffect(() => {
    const newId = options?.conversationId ?? null;
    if (prevExternalId.current === newId) return;
    prevExternalId.current = newId;

    setActiveConversationId(newId);

    if (!newId) {
      setMessages([]);
      return;
    }

    // Skip fetch for conversations we just created (messages already in state)
    if (autoCreatedIds.current.has(newId)) {
      return;
    }

    setIsLoadingConversation(true);
    fetchConversation(newId)
      .then((detail) => {
        setMessages(
          detail.messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.createdAt,
            model: m.model ?? undefined,
            provider: m.provider ?? undefined,
            tokensUsed: m.tokensUsed ?? undefined,
            brainContext: m.brainContext ?? undefined,
            creationEvents: m.creationEvents ?? undefined,
          }))
        );
      })
      .catch(() => {
        setMessages([]);
      })
      .finally(() => {
        setIsLoadingConversation(false);
      });
  }, [options?.conversationId]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setActiveConversationId(null);
    setStreamingThinking('');
    setStreamingContent('');
    setActiveToolCalls([]);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isPending) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsPending(true);
    setStreamingThinking('');
    setStreamingContent('');
    setActiveToolCalls([]);

    // Auto-create conversation on first send
    let convId = activeConversationId;
    if (!convId) {
      try {
        const title = trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed;
        const conv = await createConversation(title, options?.personalityId ?? undefined);
        convId = conv.id;
        autoCreatedIds.current.add(convId);
        setActiveConversationId(convId);
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } catch {
        // Continue without persistence
      }
    }

    const history = [...messages, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const memoryOn = options?.memoryEnabled ?? true;

    try {
      const streamToken = getAccessToken();
      const res = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(streamToken ? { Authorization: `Bearer ${streamToken}` } : {}),
        },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          message: trimmed,
          history: history.slice(0, -1),
          ...(options?.personalityId ? { personalityId: options.personalityId } : {}),
          ...(convId ? { conversationId: convId } : {}),
          memoryEnabled: memoryOn,
          saveAsMemory: memoryOn,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Stream request failed (${res.status}): ${errText}`);
      }
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let thinkingAcc = '';
      let contentAcc = '';
      const pendingEvents: CreationEvent[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(json); } catch { continue; }

          const type = event.type as string;

          if (type === 'thinking_delta') {
            thinkingAcc += event.thinking as string;
            setStreamingThinking(thinkingAcc);
          } else if (type === 'content_delta') {
            contentAcc += event.content as string;
            setStreamingContent(contentAcc);
          } else if (type === 'tool_start') {
            setActiveToolCalls((prev) => [
              ...prev,
              { toolName: event.toolName as string, label: event.label as string, isMcp: false },
            ]);
          } else if (type === 'tool_result') {
            setActiveToolCalls((prev) => prev.filter((t) => t.toolName !== (event.toolName as string)));
          } else if (type === 'mcp_tool_start') {
            setActiveToolCalls((prev) => [
              ...prev,
              { toolName: event.toolName as string, label: event.toolName as string, serverName: event.serverName as string, isMcp: true },
            ]);
          } else if (type === 'mcp_tool_result') {
            setActiveToolCalls((prev) => prev.filter((t) => t.toolName !== (event.toolName as string)));
          } else if (type === 'creation_event') {
            pendingEvents.push(event.event as CreationEvent);
          } else if (type === 'done') {
            const doneEvent = event as {
              content: string; model: string; provider: string;
              tokensUsed?: number; thinkingContent?: string; creationEvents: CreationEvent[];
              brainContext?: ChatMessage['brainContext'];
            };
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: doneEvent.content,
                timestamp: Date.now(),
                model: doneEvent.model,
                provider: doneEvent.provider,
                tokensUsed: doneEvent.tokensUsed,
                thinkingContent: doneEvent.thinkingContent,
                brainContext: doneEvent.brainContext,
                creationEvents: doneEvent.creationEvents.length > 0 ? doneEvent.creationEvents : undefined,
              },
            ]);
            setStreamingThinking('');
            setStreamingContent('');
            setActiveToolCalls([]);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
          } else if (type === 'error') {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: `Error: ${event.message as string}`, timestamp: Date.now() },
            ]);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() },
      ]);
    } finally {
      setIsPending(false);
      setStreamingThinking('');
      setStreamingContent('');
      setActiveToolCalls([]);
    }
  }, [input, isPending, messages, activeConversationId, options, queryClient]);

  return {
    messages,
    input,
    setInput,
    handleSend,
    isPending,
    clearMessages,
    conversationId: activeConversationId,
    isLoadingConversation,
    streamingThinking,
    streamingContent,
    activeToolCalls,
  };
}
