import { useState, useEffect, useCallback, useMemo } from 'react';

export interface CommandItem {
  id: string;
  label: string;
  category: 'file' | 'panel' | 'navigation' | 'personality' | 'command';
  icon: React.ReactNode;
  shortcut?: string;
  keywords?: string[];
  action: () => void;
}

export function useCommandPalette(commands: CommandItem[]) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const toggle = useCallback(() => {
    setOpen((v) => {
      if (!v) {
        setQuery('');
        setSelectedIndex(0);
      }
      return !v;
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const execute = useCallback(
    (index?: number) => {
      const item = filtered[index ?? selectedIndex];
      if (item) {
        item.action();
        close();
      }
    },
    [filtered, selectedIndex, close]
  );

  // Global Cmd/Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [toggle]);

  return {
    open,
    setOpen,
    query,
    setQuery,
    filtered,
    selectedIndex,
    setSelectedIndex,
    toggle,
    close,
    execute,
  };
}
