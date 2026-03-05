import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import type { CommandItem } from '../../hooks/useCommandPalette';

interface Props {
  open: boolean;
  query: string;
  setQuery: (q: string) => void;
  filtered: CommandItem[];
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  execute: (index?: number) => void;
  close: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  file: 'File',
  panel: 'Panel',
  navigation: 'Navigation',
  personality: 'Personality',
  command: 'Command',
};

export function CommandPalette({
  open,
  query,
  setQuery,
  filtered,
  selectedIndex,
  setSelectedIndex,
  execute,
  close,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(Math.min(selectedIndex + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(Math.max(selectedIndex - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        execute();
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  };

  // Group by category
  const groups: { category: string; items: (CommandItem & { globalIndex: number })[] }[] = [];
  const categoryMap = new Map<string, (CommandItem & { globalIndex: number })[]>();
  filtered.forEach((item, i) => {
    const arr = categoryMap.get(item.category) ?? [];
    arr.push({ ...item, globalIndex: i });
    categoryMap.set(item.category, arr);
  });
  for (const [category, items] of categoryMap) {
    groups.push({ category, items });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={close}
      data-testid="command-palette-overlay"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Palette */}
      <div
        className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            data-testid="command-palette-input"
          />
          <kbd className="hidden sm:inline text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[300px] overflow-y-auto py-1"
          data-testid="command-palette-list"
        >
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching commands
            </div>
          )}
          {groups.map((group) => (
            <div key={group.category}>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {CATEGORY_LABELS[group.category] ?? group.category}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    execute(item.globalIndex);
                  }}
                  onMouseEnter={() => {
                    setSelectedIndex(item.globalIndex);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                    item.globalIndex === selectedIndex
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted/50'
                  }`}
                  data-testid={`command-item-${item.id}`}
                >
                  <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.shortcut && (
                    <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border">
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
