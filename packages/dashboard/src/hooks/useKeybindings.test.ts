// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useKeybindings,
  parseShortcut,
  matchesShortcut,
  eventToShortcut,
  DEFAULT_KEYBINDINGS,
} from './useKeybindings';

beforeEach(() => {
  localStorage.clear();
});

describe('parseShortcut', () => {
  it('parses Ctrl+K', () => {
    const result = parseShortcut('Ctrl+K');
    expect(result).toEqual({ ctrl: true, shift: false, alt: false, meta: false, key: 'K' });
  });

  it('parses Ctrl+Shift+N', () => {
    const result = parseShortcut('Ctrl+Shift+N');
    expect(result).toEqual({ ctrl: true, shift: true, alt: false, meta: false, key: 'N' });
  });

  it('returns null for empty string', () => {
    expect(parseShortcut('')).toBeNull();
  });

  it('parses Ctrl+Enter', () => {
    const result = parseShortcut('Ctrl+Enter');
    expect(result?.key).toBe('Enter');
    expect(result?.ctrl).toBe(true);
  });
});

describe('matchesShortcut', () => {
  it('matches Ctrl+S', () => {
    const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true });
    expect(matchesShortcut(e, 'Ctrl+S')).toBe(true);
  });

  it('does not match without modifier', () => {
    const e = new KeyboardEvent('keydown', { key: 's' });
    expect(matchesShortcut(e, 'Ctrl+S')).toBe(false);
  });

  it('matches Ctrl+Shift+G', () => {
    const e = new KeyboardEvent('keydown', { key: 'G', ctrlKey: true, shiftKey: true });
    expect(matchesShortcut(e, 'Ctrl+Shift+G')).toBe(true);
  });

  it('returns false for empty shortcut', () => {
    const e = new KeyboardEvent('keydown', { key: 'a' });
    expect(matchesShortcut(e, '')).toBe(false);
  });
});

describe('eventToShortcut', () => {
  it('converts ctrl+a to Ctrl+A', () => {
    const e = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true });
    expect(eventToShortcut(e)).toBe('Ctrl+A');
  });

  it('returns empty for modifier-only', () => {
    const e = new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true });
    expect(eventToShortcut(e)).toBe('');
  });

  it('converts special keys', () => {
    const e = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true });
    expect(eventToShortcut(e)).toBe('Ctrl+Enter');
  });

  it('includes shift', () => {
    const e = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, shiftKey: true });
    expect(eventToShortcut(e)).toBe('Ctrl+Shift+N');
  });
});

describe('useKeybindings', () => {
  it('returns default bindings', () => {
    const { result } = renderHook(() => useKeybindings());
    expect(result.current.bindings.length).toBe(DEFAULT_KEYBINDINGS.length);
    expect(result.current.getShortcut('command-palette')).toBe('Ctrl+K');
  });

  it('setBinding overrides and persists', () => {
    const { result } = renderHook(() => useKeybindings());

    act(() => {
      result.current.setBinding('command-palette', 'Ctrl+P');
    });

    expect(result.current.getShortcut('command-palette')).toBe('Ctrl+P');
    expect(result.current.bindings.find((b) => b.id === 'command-palette')?.shortcut).toBe('Ctrl+P');

    // Persisted to localStorage
    const stored = JSON.parse(localStorage.getItem('editor:keybindings') ?? '{}');
    expect(stored['command-palette']).toBe('Ctrl+P');
  });

  it('resetBinding restores default', () => {
    const { result } = renderHook(() => useKeybindings());

    act(() => {
      result.current.setBinding('run-code', 'Ctrl+R');
    });
    expect(result.current.getShortcut('run-code')).toBe('Ctrl+R');

    act(() => {
      result.current.resetBinding('run-code');
    });
    expect(result.current.getShortcut('run-code')).toBe('Ctrl+Enter');
  });

  it('resetAll clears all overrides', () => {
    const { result } = renderHook(() => useKeybindings());

    act(() => {
      result.current.setBinding('run-code', 'Ctrl+R');
      result.current.setBinding('save-file', 'Ctrl+Shift+S');
    });

    act(() => {
      result.current.resetAll();
    });

    expect(result.current.getShortcut('run-code')).toBe('Ctrl+Enter');
    expect(result.current.getShortcut('save-file')).toBe('Ctrl+S');
    expect(localStorage.getItem('editor:keybindings')).toBeNull();
  });

  it('findConflict detects duplicate shortcuts', () => {
    const { result } = renderHook(() => useKeybindings());

    // Ctrl+S is already used by save-file
    const conflict = result.current.findConflict('run-code', 'Ctrl+S');
    expect(conflict).toBe('save-file');
  });

  it('findConflict returns null for unique shortcut', () => {
    const { result } = renderHook(() => useKeybindings());
    const conflict = result.current.findConflict('run-code', 'Ctrl+Shift+X');
    expect(conflict).toBeNull();
  });

  it('loads overrides from localStorage on init', () => {
    localStorage.setItem('editor:keybindings', JSON.stringify({ 'command-palette': 'Ctrl+P' }));
    const { result } = renderHook(() => useKeybindings());
    expect(result.current.getShortcut('command-palette')).toBe('Ctrl+P');
  });
});
