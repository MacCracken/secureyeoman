/**
 * SearchPanel — Multi-file search & replace sidebar panel.
 *
 * Provides cross-file search with regex/case toggles, result preview
 * grouped by file, and batch replace with file-level checkbox selection.
 */

import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Search,
  Replace,
  ChevronDown,
  ChevronRight,
  FileText,
  X,
  CaseSensitive,
  Regex,
  CheckSquare,
  Square,
} from 'lucide-react';
import { searchFiles, replaceInFiles, type SearchMatch } from '../../api/client.js';

interface SearchPanelProps {
  cwd: string;
  onNavigate?: (file: string, line: number) => void;
  onClose?: () => void;
}

interface FileGroup {
  file: string;
  matches: SearchMatch[];
  expanded: boolean;
  selected: boolean;
}

export function SearchPanel({ cwd, onNavigate, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [glob, setGlob] = useState('');
  const [fileGroups, setFileGroups] = useState<FileGroup[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchMutation = useMutation({
    mutationFn: () =>
      searchFiles({
        query,
        cwd,
        glob: glob || undefined,
        regex: useRegex,
        caseSensitive,
      }),
    onSuccess: (data) => {
      // Group matches by file
      const grouped = new Map<string, SearchMatch[]>();
      for (const match of data.matches) {
        const arr = grouped.get(match.file) ?? [];
        arr.push(match);
        grouped.set(match.file, arr);
      }
      setFileGroups(
        Array.from(grouped.entries()).map(([file, matches]) => ({
          file,
          matches,
          expanded: grouped.size <= 10,
          selected: true,
        }))
      );
      setTotalMatches(data.matchCount);
      setTruncated(data.truncated);
    },
  });

  const replaceMutation = useMutation({
    mutationFn: () => {
      const selectedFiles = fileGroups.filter((g) => g.selected).map((g) => g.file);
      return replaceInFiles({
        cwd,
        search: query,
        replace: replaceText,
        files: selectedFiles,
        regex: useRegex,
        caseSensitive,
      });
    },
    onSuccess: (_data) => {
      // Re-run search to update results
      if (query) searchMutation.mutate();
    },
  });

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    searchMutation.mutate();
  }, [query, searchMutation]);

  const toggleExpand = (index: number) => {
    setFileGroups((prev) =>
      prev.map((g, i) => (i === index ? { ...g, expanded: !g.expanded } : g))
    );
  };

  const toggleSelect = (index: number) => {
    setFileGroups((prev) =>
      prev.map((g, i) => (i === index ? { ...g, selected: !g.selected } : g))
    );
  };

  const selectAll = () => {
    setFileGroups((prev) => prev.map((g) => ({ ...g, selected: true })));
  };
  const selectNone = () => {
    setFileGroups((prev) => prev.map((g) => ({ ...g, selected: false })));
  };

  return (
    <div
      className="flex flex-col h-full bg-background border-r border-border"
      data-testid="search-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="text-xs font-medium">Search</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setShowReplace((v) => !v);
            }}
            className={`p-1 rounded text-xs ${showReplace ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            title="Toggle replace"
          >
            <Replace className="w-3.5 h-3.5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Search input */}
      <div className="px-3 py-2 space-y-2 border-b border-border">
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              ref={inputRef}
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-muted/30 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Search..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              data-testid="search-input"
            />
          </div>
          <button
            onClick={() => {
              setCaseSensitive((v) => !v);
            }}
            className={`p-1 rounded text-xs ${caseSensitive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            title="Match case"
          >
            <CaseSensitive className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setUseRegex((v) => !v);
            }}
            className={`p-1 rounded text-xs ${useRegex ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            title="Use regex"
          >
            <Regex className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Replace input */}
        {showReplace && (
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Replace className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                className="w-full pl-7 pr-2 py-1.5 text-xs bg-muted/30 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Replace..."
                value={replaceText}
                onChange={(e) => {
                  setReplaceText(e.target.value);
                }}
                data-testid="replace-input"
              />
            </div>
            <button
              onClick={() => {
                replaceMutation.mutate();
              }}
              disabled={
                !query.trim() ||
                replaceMutation.isPending ||
                fileGroups.filter((g) => g.selected).length === 0
              }
              className="px-2 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              title="Replace all in selected files"
              data-testid="replace-all-btn"
            >
              Replace
            </button>
          </div>
        )}

        {/* File glob filter */}
        <input
          className="w-full px-2 py-1 text-xs bg-muted/30 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Files to include (e.g. *.ts, *.tsx)"
          value={glob}
          onChange={(e) => {
            setGlob(e.target.value);
          }}
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto text-xs">
        {searchMutation.isPending && <div className="p-3 text-muted-foreground">Searching...</div>}

        {!searchMutation.isPending && totalMatches > 0 && (
          <div className="flex items-center justify-between px-3 py-1.5 text-muted-foreground border-b border-border">
            <span>
              {totalMatches} result{totalMatches !== 1 ? 's' : ''} in {fileGroups.length} file
              {fileGroups.length !== 1 ? 's' : ''}
              {truncated && ' (truncated)'}
            </span>
            {showReplace && (
              <div className="flex gap-2">
                <button onClick={selectAll} className="hover:text-foreground">
                  All
                </button>
                <button onClick={selectNone} className="hover:text-foreground">
                  None
                </button>
              </div>
            )}
          </div>
        )}

        {replaceMutation.isSuccess && (
          <div
            className="px-3 py-1.5 text-green-600 bg-green-50 border-b border-green-200 text-xs"
            data-testid="replace-success"
          >
            Replaced {replaceMutation.data.totalReplacements} occurrence
            {replaceMutation.data.totalReplacements !== 1 ? 's' : ''} in{' '}
            {replaceMutation.data.files.length} file
            {replaceMutation.data.files.length !== 1 ? 's' : ''}
          </div>
        )}

        {fileGroups.map((group, gi) => (
          <div key={group.file}>
            <div
              className="flex items-center gap-1 px-2 py-1 hover:bg-muted/50 cursor-pointer"
              onClick={() => {
                toggleExpand(gi);
              }}
            >
              {showReplace && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(gi);
                  }}
                  className="flex-shrink-0"
                >
                  {group.selected ? (
                    <CheckSquare className="w-3 h-3 text-primary" />
                  ) : (
                    <Square className="w-3 h-3 text-muted-foreground" />
                  )}
                </button>
              )}
              {group.expanded ? (
                <ChevronDown className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
              )}
              <FileText className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{group.file}</span>
              <span className="ml-auto flex-shrink-0 text-muted-foreground">
                {group.matches.length}
              </span>
            </div>

            {group.expanded &&
              group.matches.map((match, mi) => (
                <div
                  key={`${group.file}-${match.line}-${mi}`}
                  className="flex items-start gap-2 pl-8 pr-2 py-0.5 hover:bg-muted/30 cursor-pointer"
                  onClick={() => onNavigate?.(group.file, match.line)}
                  data-testid="search-match"
                >
                  <span className="flex-shrink-0 text-muted-foreground w-8 text-right">
                    {match.line}
                  </span>
                  <span className="font-mono truncate">{match.text}</span>
                </div>
              ))}
          </div>
        ))}

        {!searchMutation.isPending && totalMatches === 0 && query && searchMutation.isSuccess && (
          <div className="p-3 text-muted-foreground">No results found.</div>
        )}
      </div>
    </div>
  );
}
