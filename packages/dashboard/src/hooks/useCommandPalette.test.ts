// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCommandPalette, type CommandItem } from './useCommandPalette';
import React from 'react';

const makeCommands = (): CommandItem[] => [
  {
    id: 'a',
    label: 'Alpha',
    category: 'file',
    icon: null as unknown as React.ReactNode,
    action: vi.fn(),
    keywords: ['first'],
  },
  {
    id: 'b',
    label: 'Beta',
    category: 'panel',
    icon: null as unknown as React.ReactNode,
    action: vi.fn(),
  },
  {
    id: 'c',
    label: 'Charlie',
    category: 'file',
    icon: null as unknown as React.ReactNode,
    action: vi.fn(),
    keywords: ['third'],
  },
];

describe('useCommandPalette', () => {
  let commands: CommandItem[];

  beforeEach(() => {
    commands = makeCommands();
  });

  it('starts closed with empty query', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    expect(result.current.open).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.selectedIndex).toBe(0);
  });

  it('toggle opens and closes', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
  });

  it('close resets state', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.toggle());
    act(() => result.current.setQuery('test'));
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.selectedIndex).toBe(0);
  });

  it('filters commands by label', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.setQuery('alp'));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('a');
  });

  it('filters commands by category', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.setQuery('panel'));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('b');
  });

  it('filters commands by keywords', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.setQuery('first'));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('a');
  });

  it('returns all commands for empty query', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    expect(result.current.filtered).toHaveLength(3);
  });

  it('execute calls action and closes', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.toggle());
    act(() => result.current.execute(1));
    expect(commands[1].action).toHaveBeenCalled();
    expect(result.current.open).toBe(false);
  });

  it('responds to Ctrl+K keydown', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    expect(result.current.open).toBe(true);
  });

  it('resets selectedIndex when query changes', () => {
    const { result } = renderHook(() => useCommandPalette(commands));
    act(() => result.current.setSelectedIndex(2));
    act(() => result.current.setQuery('new'));
    expect(result.current.selectedIndex).toBe(0);
  });
});
