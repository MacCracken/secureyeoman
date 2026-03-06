// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useChat, useChatStream } from './useChat';

vi.mock('../api/client', () => ({
  sendChatMessage: vi.fn().mockResolvedValue({
    content: 'Hello!',
    model: 'test-model',
    provider: 'test',
    tokensUsed: 10,
  }),
  createConversation: vi.fn().mockResolvedValue({ id: 'conv-1' }),
  fetchConversation: vi.fn().mockResolvedValue({
    messages: [
      { role: 'user', content: 'Hi', createdAt: 1000 },
      { role: 'assistant', content: 'Hello', createdAt: 1001 },
    ],
  }),
  getAccessToken: vi.fn().mockReturnValue('tok'),
}));

import * as api from '../api/client';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => useChat(), { wrapper: createWrapper() });

    expect(result.current.messages).toEqual([]);
    expect(result.current.input).toBe('');
    expect(result.current.isPending).toBe(false);
    expect(result.current.conversationId).toBeNull();
    expect(result.current.isLoadingConversation).toBe(false);
  });

  it('should update input', () => {
    const { result } = renderHook(() => useChat(), { wrapper: createWrapper() });

    act(() => {
      result.current.setInput('Hello');
    });

    expect(result.current.input).toBe('Hello');
  });

  it('should not send empty message', async () => {
    const { result } = renderHook(() => useChat(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.handleSend();
    });

    expect(result.current.messages).toEqual([]);
    expect(api.sendChatMessage).not.toHaveBeenCalled();
  });

  it('should send message and receive response', async () => {
    const { result } = renderHook(() => useChat(), { wrapper: createWrapper() });

    act(() => {
      result.current.setInput('Hello there');
    });

    await act(async () => {
      result.current.handleSend();
    });

    // User message should be added immediately
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'Hello there',
    });

    // Wait for mutation to complete
    await waitFor(() => {
      expect(result.current.messages.length).toBe(2);
    });

    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Hello!',
    });
  });

  it('should auto-create conversation on first send', async () => {
    const { result } = renderHook(() => useChat(), { wrapper: createWrapper() });

    act(() => {
      result.current.setInput('Start chat');
    });

    await act(async () => {
      result.current.handleSend();
    });

    await waitFor(() => {
      expect(api.createConversation).toHaveBeenCalled();
    });
  });

  it('should clear messages', async () => {
    const { result } = renderHook(() => useChat(), { wrapper: createWrapper() });

    act(() => {
      result.current.setInput('Test');
    });

    await act(async () => {
      result.current.handleSend();
    });

    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.conversationId).toBeNull();
  });

  it('should handle send error', async () => {
    vi.mocked(api.sendChatMessage).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useChat(), { wrapper: createWrapper() });

    act(() => {
      result.current.setInput('Hello');
    });

    await act(async () => {
      result.current.handleSend();
    });

    await waitFor(() => {
      expect(result.current.messages.length).toBe(2);
    });

    expect(result.current.messages[1].content).toContain('Error');
  });

  it('should load existing conversation', async () => {
    const { result } = renderHook(
      () => useChat({ conversationId: 'existing-1' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoadingConversation).toBe(false);
    });

    expect(api.fetchConversation).toHaveBeenCalledWith('existing-1');
    expect(result.current.messages.length).toBe(2);
  });

  it('should handle conversation load error', async () => {
    vi.mocked(api.fetchConversation).mockRejectedValueOnce(new Error('Not found'));

    const { result } = renderHook(
      () => useChat({ conversationId: 'bad-id' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoadingConversation).toBe(false);
    });

    expect(result.current.messages).toEqual([]);
  });

  it('should resendFrom a message index', async () => {
    const { result } = renderHook(() => useChat(), { wrapper: createWrapper() });

    // Add some messages first
    act(() => {
      result.current.setInput('First');
    });
    await act(async () => {
      result.current.handleSend();
    });

    await waitFor(() => {
      expect(result.current.messages.length).toBe(2);
    });

    // Resend from index 0
    await act(async () => {
      result.current.resendFrom(0, 'Edited first');
    });

    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'Edited first',
    });
  });

  it('should not resend empty content', async () => {
    const { result } = renderHook(() => useChat(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.resendFrom(0, '   ');
    });

    expect(result.current.messages).toEqual([]);
  });

  it('should pass personalityId option', async () => {
    const { result } = renderHook(
      () => useChat({ personalityId: 'p1' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.setInput('Test with personality');
    });

    await act(async () => {
      result.current.handleSend();
    });

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThanOrEqual(1);
    });

    // Verify the mutation was called with personalityId
    expect(api.sendChatMessage).toHaveBeenCalled();
    const callArgs = vi.mocked(api.sendChatMessage).mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.personalityId).toBe('p1');
  });

  it('should truncate long titles for conversation creation', async () => {
    const longMessage = 'A'.repeat(100);

    const { result } = renderHook(() => useChat(), { wrapper: createWrapper() });

    act(() => {
      result.current.setInput(longMessage);
    });

    await act(async () => {
      result.current.handleSend();
    });

    await waitFor(() => {
      expect(api.createConversation).toHaveBeenCalledWith(
        expect.stringMatching(/\.\.\.$/),
        undefined
      );
    });
  });
});

describe('useChatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => useChatStream(), { wrapper: createWrapper() });

    expect(result.current.messages).toEqual([]);
    expect(result.current.isPending).toBe(false);
    expect(result.current.conversationId).toBeNull();
    expect(result.current.streamingThinking).toBe('');
    expect(result.current.streamingContent).toBe('');
    expect(result.current.activeToolCalls).toEqual([]);
  });

  it('should clear messages', () => {
    const { result } = renderHook(() => useChatStream(), { wrapper: createWrapper() });

    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.streamingThinking).toBe('');
    expect(result.current.streamingContent).toBe('');
    expect(result.current.activeToolCalls).toEqual([]);
  });

  it('should not send empty message', async () => {
    const { result } = renderHook(() => useChatStream(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.sendMessage('   ');
    });

    expect(result.current.messages).toEqual([]);
  });

  it('should load existing conversation', async () => {
    const { result } = renderHook(
      () => useChatStream({ conversationId: 'existing-1' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoadingConversation).toBe(false);
    });

    expect(api.fetchConversation).toHaveBeenCalledWith('existing-1');
  });

  it('should handle stream request error', async () => {
    // Mock fetch to return error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Internal Server Error'),
    });

    const { result } = renderHook(() => useChatStream(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.sendMessage('Hello');
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    // Should have error message
    const lastMsg = result.current.messages[result.current.messages.length - 1];
    expect(lastMsg?.content).toContain('Error');

    globalThis.fetch = originalFetch;
  });
});
