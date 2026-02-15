import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendChatMessage, createConversation, fetchConversation } from '../api/client';
import type { ChatMessage } from '../types';

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
  isPending: boolean;
  clearMessages: () => void;
  conversationId: string | null;
  isLoadingConversation: boolean;
}

export function useChat(options?: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    options?.conversationId ?? null,
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
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.createdAt,
            model: m.model ?? undefined,
            provider: m.provider ?? undefined,
            tokensUsed: m.tokensUsed ?? undefined,
            brainContext: m.brainContext ?? undefined,
          })),
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
        const conv = await createConversation(
          title,
          options?.personalityId ?? undefined,
        );
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

  return {
    messages,
    input,
    setInput,
    handleSend,
    isPending: chatMutation.isPending,
    clearMessages,
    conversationId: activeConversationId,
    isLoadingConversation,
  };
}
