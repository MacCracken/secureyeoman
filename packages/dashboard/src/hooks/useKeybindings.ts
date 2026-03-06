import { useState, useEffect, useCallback, useMemo } from 'react';

export interface KeyBinding {
  id: string;
  label: string;
  category: 'file' | 'editor' | 'panel' | 'navigation' | 'terminal';
  /** Display string, e.g. "Ctrl+K" */
  shortcut: string;
  /** Default shortcut (used for reset) */
  defaultShortcut: string;
}

const STORAGE_KEY = 'editor:keybindings';

/** Canonical default keybindings for the standard editor. */
export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  { id: 'command-palette', label: 'Command Palette', category: 'editor', shortcut: 'Ctrl+K', defaultShortcut: 'Ctrl+K' },
  { id: 'run-code', label: 'Run Code', category: 'file', shortcut: 'Ctrl+Enter', defaultShortcut: 'Ctrl+Enter' },
  { id: 'save-file', label: 'Save File', category: 'file', shortcut: 'Ctrl+S', defaultShortcut: 'Ctrl+S' },
  { id: 'new-file', label: 'New File', category: 'file', shortcut: 'Ctrl+Shift+N', defaultShortcut: 'Ctrl+Shift+N' },
  { id: 'toggle-explorer', label: 'Toggle Explorer', category: 'panel', shortcut: 'Ctrl+B', defaultShortcut: 'Ctrl+B' },
  { id: 'toggle-chat', label: 'Toggle Chat', category: 'panel', shortcut: 'Ctrl+Shift+C', defaultShortcut: 'Ctrl+Shift+C' },
  { id: 'toggle-git', label: 'Toggle Git Panel', category: 'panel', shortcut: 'Ctrl+Shift+G', defaultShortcut: 'Ctrl+Shift+G' },
  { id: 'toggle-terminal', label: 'Focus Terminal', category: 'terminal', shortcut: 'Ctrl+`', defaultShortcut: 'Ctrl+`' },
  { id: 'toggle-settings', label: 'Editor Settings', category: 'panel', shortcut: 'Ctrl+,', defaultShortcut: 'Ctrl+,' },
  { id: 'toggle-split', label: 'Toggle Split View', category: 'editor', shortcut: 'Ctrl+\\', defaultShortcut: 'Ctrl+\\' },
  { id: 'close-tab', label: 'Close Tab', category: 'file', shortcut: 'Ctrl+W', defaultShortcut: 'Ctrl+W' },
  { id: 'go-dashboard', label: 'Go to Dashboard', category: 'navigation', shortcut: '', defaultShortcut: '' },
];

function loadOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOverrides(overrides: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

/** Parse a display shortcut into the parts a KeyboardEvent check needs. */
export function parseShortcut(shortcut: string): { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; key: string } | null {
  if (!shortcut) return null;
  const parts = shortcut.split('+').map((p) => p.trim());
  const ctrl = parts.includes('Ctrl');
  const shift = parts.includes('Shift');
  const alt = parts.includes('Alt');
  const meta = parts.includes('Meta') || parts.includes('Cmd');
  const key = parts.filter((p) => !['Ctrl', 'Shift', 'Alt', 'Meta', 'Cmd'].includes(p)).pop() ?? '';
  return { ctrl, shift, alt, meta, key };
}

/** Check if a KeyboardEvent matches a shortcut string. */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed || !parsed.key) return false;
  const modMatch =
    (parsed.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey) &&
    parsed.shift === e.shiftKey &&
    parsed.alt === e.altKey;
  const keyMatch = e.key.toLowerCase() === parsed.key.toLowerCase() ||
    e.key === parsed.key;
  return modMatch && keyMatch;
}

/** Convert a KeyboardEvent to a display shortcut string. */
export function eventToShortcut(e: KeyboardEvent | React.KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');

  const key = e.key;
  // Ignore modifier-only keypresses
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return '';

  // Normalize special keys
  const normalized =
    key === ' ' ? 'Space' :
    key === 'Escape' ? 'Escape' :
    key === 'Enter' ? 'Enter' :
    key === 'Backspace' ? 'Backspace' :
    key === 'Delete' ? 'Delete' :
    key === 'Tab' ? 'Tab' :
    key === 'ArrowUp' ? 'Up' :
    key === 'ArrowDown' ? 'Down' :
    key === 'ArrowLeft' ? 'Left' :
    key === 'ArrowRight' ? 'Right' :
    key.length === 1 ? key.toUpperCase() : key;

  parts.push(normalized);
  return parts.join('+');
}

export function useKeybindings() {
  const [overrides, setOverrides] = useState<Record<string, string>>(loadOverrides);

  const bindings = useMemo<KeyBinding[]>(() => {
    return DEFAULT_KEYBINDINGS.map((kb) => ({
      ...kb,
      shortcut: overrides[kb.id] ?? kb.shortcut,
    }));
  }, [overrides]);

  const setBinding = useCallback((id: string, shortcut: string) => {
    setOverrides((prev) => {
      const next = { ...prev, [id]: shortcut };
      saveOverrides(next);
      return next;
    });
  }, []);

  const resetBinding = useCallback((id: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      saveOverrides(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setOverrides({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  /** Get the current shortcut for a binding by id. */
  const getShortcut = useCallback(
    (id: string): string => {
      return overrides[id] ?? DEFAULT_KEYBINDINGS.find((kb) => kb.id === id)?.shortcut ?? '';
    },
    [overrides]
  );

  /** Check for duplicate shortcuts. Returns the conflicting binding id or null. */
  const findConflict = useCallback(
    (id: string, shortcut: string): string | null => {
      if (!shortcut) return null;
      const existing = bindings.find((kb) => kb.id !== id && kb.shortcut === shortcut);
      return existing?.id ?? null;
    },
    [bindings]
  );

  return { bindings, setBinding, resetBinding, resetAll, getShortcut, findConflict };
}
