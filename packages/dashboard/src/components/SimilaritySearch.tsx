/**
 * SimilaritySearch — Semantic similarity search for brain memories and knowledge.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Search, Loader2, Brain, BookOpen, SlidersHorizontal } from 'lucide-react';
import { searchSimilar } from '../api/client';
import { sanitizeText } from '../utils/sanitize';

interface VectorResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export function SimilaritySearch() {
  const [query, setQuery] = useState('');
  const [threshold, setThreshold] = useState(0.7);
  const [typeFilter, setTypeFilter] = useState<'all' | 'memories' | 'knowledge'>('all');
  const [showSettings, setShowSettings] = useState(false);

  const searchMutation = useMutation({
    mutationFn: () => searchSimilar({ query, threshold, type: typeFilter, limit: 20 }),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      searchMutation.mutate();
    }
  };

  const results = searchMutation.data?.results ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Search className="w-4 h-4" />
          Semantic Search
        </h3>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {showSettings && (
        <div className="bg-muted/30 rounded-lg p-3 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Similarity Threshold: {threshold.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="w-full text-xs bg-background border rounded px-2 py-1"
            >
              <option value="all">All</option>
              <option value="memories">Memories</option>
              <option value="knowledge">Knowledge</option>
            </select>
          </div>
        </div>
      )}

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search memories and knowledge semantically..."
          className="flex-1 text-sm bg-background border rounded-lg px-3 py-2 placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={!query.trim() || searchMutation.isPending}
          className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
        >
          {searchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </form>

      {searchMutation.isError && (
        <p className="text-xs text-destructive">
          {searchMutation.error instanceof Error ? searchMutation.error.message : 'Search failed'}
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{results.length} results</p>
          {results.map((result: VectorResult) => (
            <div key={result.id} className="bg-muted/20 rounded-lg p-3 border">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {result.id.startsWith('memory:') ? (
                    <Brain className="w-3 h-3" />
                  ) : (
                    <BookOpen className="w-3 h-3" />
                  )}
                  <span>{result.metadata?.type === 'memory' ? 'Memory' : 'Knowledge'}</span>
                  {result.metadata?.memoryType != null && (
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                      {sanitizeText(String(result.metadata.memoryType))}
                    </span>
                  )}
                  {result.metadata?.topic != null && (
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                      {sanitizeText(String(result.metadata.topic))}
                    </span>
                  )}
                </div>
                <ScoreIndicator score={result.score} />
              </div>
              <p className="text-xs font-mono">{sanitizeText(result.id)}</p>
            </div>
          ))}
        </div>
      )}

      {searchMutation.isSuccess && results.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No results found. Try adjusting the threshold or query.
        </p>
      )}
    </div>
  );
}

function ScoreIndicator({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.9 ? 'text-green-400' : score >= 0.7 ? 'text-yellow-400' : 'text-muted-foreground';

  return (
    <div className={`text-xs font-mono ${color}`}>
      {pct}%
    </div>
  );
}
