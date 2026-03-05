// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAiCommitMessage } from './useAiCommitMessage';

vi.mock('../api/client', () => ({
  executeTerminalCommand: vi.fn(),
  sendChatMessage: vi.fn(),
}));

import { executeTerminalCommand, sendChatMessage } from '../api/client';

const mockExec = vi.mocked(executeTerminalCommand);
const mockSend = vi.mocked(sendChatMessage);

describe('useAiCommitMessage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('starts with empty message and not generating', () => {
    const { result } = renderHook(() => useAiCommitMessage('/tmp'));
    expect(result.current.message).toBe('');
    expect(result.current.isGenerating).toBe(false);
  });

  it('generates commit message from diff', async () => {
    mockExec
      .mockResolvedValueOnce({
        output: ' 1 file changed, 3 insertions(+)',
        error: '',
        exitCode: 0,
        cwd: '/tmp',
      })
      .mockResolvedValueOnce({ output: '+const x = 1;', error: '', exitCode: 0, cwd: '/tmp' });

    mockSend.mockResolvedValue({
      role: 'assistant',
      content: 'feat(core): add variable initialization',
      model: 'test',
      provider: 'test',
    });

    const { result } = renderHook(() => useAiCommitMessage('/tmp', 'pers-1'));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.message).toBe('feat(core): add variable initialization');
    expect(result.current.isGenerating).toBe(false);
  });

  it('passes personalityId to sendChatMessage', async () => {
    mockExec
      .mockResolvedValueOnce({ output: 'stats', error: '', exitCode: 0, cwd: '/tmp' })
      .mockResolvedValueOnce({ output: 'diff', error: '', exitCode: 0, cwd: '/tmp' });

    mockSend.mockResolvedValue({
      role: 'assistant',
      content: 'fix: something',
      model: 'test',
      provider: 'test',
    });

    const { result } = renderHook(() => useAiCommitMessage('/tmp', 'my-personality'));

    await act(async () => {
      await result.current.generate();
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ personalityId: 'my-personality' })
    );
  });

  it('constructs prompt with diff stats and diff content', async () => {
    mockExec
      .mockResolvedValueOnce({ output: 'stat output', error: '', exitCode: 0, cwd: '/tmp' })
      .mockResolvedValueOnce({ output: 'diff content', error: '', exitCode: 0, cwd: '/tmp' });

    mockSend.mockResolvedValue({
      role: 'assistant',
      content: 'test: msg',
      model: 'test',
      provider: 'test',
    });

    const { result } = renderHook(() => useAiCommitMessage('/tmp'));

    await act(async () => {
      await result.current.generate();
    });

    const prompt = mockSend.mock.calls[0][0].message;
    expect(prompt).toContain('stat output');
    expect(prompt).toContain('diff content');
    expect(prompt).toContain('conventional commit');
  });

  it('strips code fences from response', async () => {
    mockExec
      .mockResolvedValueOnce({ output: 'stats', error: '', exitCode: 0, cwd: '/tmp' })
      .mockResolvedValueOnce({ output: 'diff', error: '', exitCode: 0, cwd: '/tmp' });

    mockSend.mockResolvedValue({
      role: 'assistant',
      content: '```\nfeat: wrapped message\n```',
      model: 'test',
      provider: 'test',
    });

    const { result } = renderHook(() => useAiCommitMessage('/tmp'));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.message).toBe('feat: wrapped message');
  });

  it('strips surrounding quotes', async () => {
    mockExec
      .mockResolvedValueOnce({ output: 'stats', error: '', exitCode: 0, cwd: '/tmp' })
      .mockResolvedValueOnce({ output: 'diff', error: '', exitCode: 0, cwd: '/tmp' });

    mockSend.mockResolvedValue({
      role: 'assistant',
      content: '"fix: quoted message"',
      model: 'test',
      provider: 'test',
    });

    const { result } = renderHook(() => useAiCommitMessage('/tmp'));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.message).toBe('fix: quoted message');
  });

  it('handles empty diff gracefully', async () => {
    mockExec
      .mockResolvedValueOnce({ output: '', error: '', exitCode: 0, cwd: '/tmp' })
      .mockResolvedValueOnce({ output: '', error: '', exitCode: 0, cwd: '/tmp' });

    const { result } = renderHook(() => useAiCommitMessage('/tmp'));

    await act(async () => {
      await result.current.generate();
    });

    expect(mockSend).not.toHaveBeenCalled();
    expect(result.current.message).toBe('');
  });

  it('handles API error gracefully', async () => {
    mockExec
      .mockResolvedValueOnce({ output: 'stats', error: '', exitCode: 0, cwd: '/tmp' })
      .mockResolvedValueOnce({ output: 'diff', error: '', exitCode: 0, cwd: '/tmp' });

    mockSend.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useAiCommitMessage('/tmp'));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.message).toBe('');
    expect(result.current.isGenerating).toBe(false);
  });

  it('allows manual message setting', () => {
    const { result } = renderHook(() => useAiCommitMessage('/tmp'));
    act(() => result.current.setMessage('manual message'));
    expect(result.current.message).toBe('manual message');
  });
});
