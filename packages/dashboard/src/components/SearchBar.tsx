/**
 * Global Search Bar
 *
 * Searches across tasks, security events, and audit logs.
 * Keyboard shortcut: Ctrl+K / Cmd+K to focus.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Clock, Shield, FileText, Loader2 } from 'lucide-react';
import { fetchTasks, fetchSecurityEvents } from '../api/client';
import type { Task, SecurityEvent } from '../types';

interface SearchResult {
  id: string;
  category: 'task' | 'security';
  title: string;
  subtitle?: string;
  route: string;
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const navigate = useNavigate();

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search
  const search = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [tasksData, eventsData] = await Promise.all([
        fetchTasks({ limit: 5 }),
        fetchSecurityEvents({ limit: 5 }),
      ]);

      const lowerTerm = term.toLowerCase();
      const matched: SearchResult[] = [];

      // Filter tasks by name/description
      for (const task of tasksData.tasks) {
        if (
          task.name.toLowerCase().includes(lowerTerm) ||
          (task.description?.toLowerCase().includes(lowerTerm))
        ) {
          matched.push({
            id: task.id,
            category: 'task',
            title: task.name,
            subtitle: `${task.status} - ${task.type}`,
            route: '/tasks',
          });
        }
      }

      // Filter security events by message/type
      for (const event of eventsData.events) {
        if (
          event.message.toLowerCase().includes(lowerTerm) ||
          event.type.toLowerCase().includes(lowerTerm)
        ) {
          matched.push({
            id: event.id,
            category: 'security',
            title: event.type.replace(/_/g, ' '),
            subtitle: event.message,
            route: '/security',
          });
        }
      }

      setResults(matched.slice(0, 10));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      void search(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    navigate(result.route);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  const categoryIcon = (cat: string) => {
    switch (cat) {
      case 'task': return <Clock className="w-4 h-4 text-muted-foreground" />;
      case 'security': return <Shield className="w-4 h-4 text-muted-foreground" />;
      default: return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const groupedResults = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    task: 'Tasks',
    security: 'Security Events',
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-background text-sm">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search... (Ctrl+K)"
          className="bg-transparent outline-none w-32 sm:w-48 placeholder:text-muted-foreground"
          aria-label="Global search"
          role="combobox"
          aria-expanded={open && (results.length > 0 || loading)}
          aria-haspopup="listbox"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {open && (query.trim()) && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-md shadow-lg z-50 max-h-80 overflow-y-auto"
          role="listbox"
        >
          {loading && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching...
            </div>
          )}

          {!loading && results.length === 0 && query.trim() && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No results found
            </div>
          )}

          {Object.entries(groupedResults).map(([category, items]) => (
            <div key={category}>
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/30">
                {categoryLabels[category] ?? category}
              </div>
              {items.map((result, idx) => {
                const flatIndex = results.indexOf(result);
                return (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/50 transition-colors ${
                      flatIndex === selectedIndex ? 'bg-muted/50' : ''
                    }`}
                    role="option"
                    aria-selected={flatIndex === selectedIndex}
                  >
                    {categoryIcon(result.category)}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{result.title}</p>
                      {result.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
