import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Brain,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Database,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import {
  fetchMemories,
  fetchKnowledge,
  searchSimilar,
  addMemory,
  deleteMemory,
  deleteKnowledge,
  reindexBrain,
} from '../api/client';
import type { Memory, KnowledgeEntry } from '../types';

interface VectorResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

const MEMORY_TYPE_LABELS: Record<string, string> = {
  episodic: 'Episodic',
  semantic: 'Semantic',
  procedural: 'Procedural',
  preference: 'Preference',
};

export function VectorMemoryExplorerPage({ embedded }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchThreshold, setSearchThreshold] = useState(0.7);
  const [searchType, setSearchType] = useState<'all' | 'memories' | 'knowledge'>('all');
  const [searchResults, setSearchResults] = useState<VectorResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'search' | 'memories' | 'knowledge' | 'add'>('search');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add memory form
  const [newType, setNewType] = useState<'episodic' | 'semantic' | 'procedural' | 'preference'>('semantic');
  const [newContent, setNewContent] = useState('');
  const [newSource, setNewSource] = useState('manual');
  const [newImportance, setNewImportance] = useState(0.5);

  const { data: memoriesData, isLoading: memoriesLoading } = useQuery({
    queryKey: ['memories'],
    queryFn: () => fetchMemories(),
    refetchInterval: 10000,
  });

  const { data: knowledgeData, isLoading: knowledgeLoading } = useQuery({
    queryKey: ['knowledge'],
    queryFn: fetchKnowledge,
    refetchInterval: 10000,
  });

  const addMutation = useMutation({
    mutationFn: addMemory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      setNewContent('');
      setNewSource('manual');
      setNewImportance(0.5);
      setActiveTab('memories');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMemory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memories'] }),
  });

  const deleteKnowledgeMutation = useMutation({
    mutationFn: deleteKnowledge,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge'] }),
  });

  const reindexMutation = useMutation({ mutationFn: reindexBrain });

  const memories = memoriesData?.memories ?? [];
  const knowledge = knowledgeData?.knowledge ?? [];

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const result = await searchSimilar({
        query: searchQuery,
        threshold: searchThreshold,
        type: searchType === 'all' ? undefined : searchType,
        limit: 20,
      });
      setSearchResults(result.results);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Semantic search failed. Ensure vector memory is enabled.');
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }

  function handleAddMemory() {
    if (!newContent.trim()) return;
    addMutation.mutate({
      type: newType,
      content: newContent.trim(),
      source: newSource || 'manual',
      importance: newImportance,
    });
  }

  const tabs = [
    { id: 'search' as const, label: 'Semantic Search', icon: <Search className="w-4 h-4" /> },
    { id: 'memories' as const, label: `Memories (${memories.length})`, icon: <Brain className="w-4 h-4" /> },
    { id: 'knowledge' as const, label: `Knowledge (${knowledge.length})`, icon: <BookOpen className="w-4 h-4" /> },
    { id: 'add' as const, label: 'Add Entry', icon: <Plus className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
      {!embedded && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold truncate">Vector Memory Explorer</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Semantic search, similarity scores, and manual memory management
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <StatCard label="Memories" value={memories.length} />
        <StatCard label="Knowledge" value={knowledge.length} />
        <StatCard label="Search Results" value={searchResults?.length ?? '-'} />
        <div className="card p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Reindex</p>
          <button
            className="text-xs mt-1 text-primary hover:underline disabled:opacity-50"
            onClick={() => reindexMutation.mutate()}
            disabled={reindexMutation.isPending}
          >
            {reindexMutation.isPending ? 'Reindexing...' : 'Reindex All'}
          </button>
          {reindexMutation.isSuccess && (
            <p className="text-xs text-green-500 mt-0.5">Done</p>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex overflow-x-auto scrollbar-hide gap-0.5 sm:gap-1 border-b border-border -mx-1 px-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Semantic Search */}
      {activeTab === 'search' && (
        <div className="card">
          <div className="card-header flex flex-row items-center gap-2 p-3 sm:p-4">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <h2 className="card-title text-sm sm:text-base">Semantic Search</h2>
          </div>
          <div className="card-content space-y-3 p-3 sm:p-4 pt-0 sm:pt-0">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for similar memories..."
                className="w-full sm:flex-1 bg-card border border-border rounded-lg text-sm py-1.5 px-3"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value as 'all' | 'memories' | 'knowledge')}
                className="bg-card border border-border rounded-lg text-sm py-1.5 px-2 w-full sm:w-32"
              >
                <option value="all">All</option>
                <option value="memories">Memories</option>
                <option value="knowledge">Knowledge</option>
              </select>
              <div className="flex items-center gap-1 w-full sm:w-auto">
                <label className="text-xs text-muted-foreground">Min:</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={searchThreshold}
                  onChange={(e) => setSearchThreshold(parseFloat(e.target.value) || 0.7)}
                  className="bg-card border border-border rounded-lg text-sm py-1.5 px-2 w-16"
                />
              </div>
              <button
                className="btn-ghost text-xs px-3 py-1.5 flex items-center justify-center gap-1 bg-primary/10 text-primary w-full sm:w-auto"
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
              >
                {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Search
              </button>
            </div>

            {searchError && (
              <div className="border border-destructive/30 bg-destructive/10 rounded-lg p-3 text-sm text-destructive">
                {searchError}
              </div>
            )}

            {searchResults && searchResults.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No similar entries found above threshold {searchThreshold}.
              </div>
            )}

            {searchResults && searchResults.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3">ID</th>
                      <th className="py-2 pr-3">Similarity</th>
                      <th className="py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((result) => (
                      <tr key={result.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 pr-3 font-mono text-xs">
                          {result.id.length > 12 ? `${result.id.slice(0, 12)}...` : result.id}
                        </td>
                        <td className="py-2 pr-3">
                          <SimilarityBar score={result.score} />
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {result.metadata ? JSON.stringify(result.metadata).slice(0, 100) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Memories List */}
      {activeTab === 'memories' && (
        <div className="card">
          <div className="card-header flex flex-row items-center gap-2 p-3 sm:p-4">
            <Database className="w-4 h-4 text-muted-foreground" />
            <h2 className="card-title text-sm sm:text-base">Memories</h2>
          </div>
          <div className="card-content p-3 sm:p-4 pt-0 sm:pt-0">
            {memoriesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : memories.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No memories stored.</div>
            ) : (
              <div className="space-y-0">
                {memories.slice(0, 50).map((mem: Memory) => {
                  const expanded = expandedId === mem.id;
                  return (
                    <React.Fragment key={mem.id}>
                      <div
                        className="flex items-center gap-2 py-2 px-1 border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => setExpandedId(expanded ? null : mem.id)}
                      >
                        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          {MEMORY_TYPE_LABELS[mem.type] ?? mem.type}
                        </span>
                        <span className="text-sm flex-1 truncate">{mem.content.slice(0, 80)}</span>
                        <span className="text-xs text-muted-foreground">{mem.importance.toFixed(2)}</span>
                      </div>
                      {expanded && (
                        <div className="bg-muted/20 p-3 border-b text-xs space-y-1">
                          <div><span className="font-medium">ID:</span> {mem.id}</div>
                          <div><span className="font-medium">Source:</span> {mem.source}</div>
                          <div><span className="font-medium">Importance:</span> {mem.importance}</div>
                          <div><span className="font-medium">Created:</span> {new Date(mem.createdAt).toLocaleString()}</div>
                          <div><span className="font-medium">Content:</span></div>
                          <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-40 whitespace-pre-wrap break-words">{mem.content}</pre>
                          <button
                            className="btn-ghost text-xs px-2 py-1 mt-1 flex items-center gap-1 text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(mem.id); }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
                {memories.length > 50 && (
                  <div className="text-center py-2 text-xs text-muted-foreground">
                    Showing 50 of {memories.length} memories
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Knowledge List */}
      {activeTab === 'knowledge' && (
        <div className="card">
          <div className="card-header flex flex-row items-center gap-2 p-3 sm:p-4">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <h2 className="card-title text-sm sm:text-base">Knowledge</h2>
          </div>
          <div className="card-content p-3 sm:p-4 pt-0 sm:pt-0">
            {knowledgeLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : knowledge.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No knowledge entries stored.</div>
            ) : (
              <div className="space-y-0">
                {knowledge.slice(0, 50).map((entry: KnowledgeEntry) => {
                  const expanded = expandedId === entry.id;
                  return (
                    <React.Fragment key={entry.id}>
                      <div
                        className="flex items-center gap-2 py-2 px-1 border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => setExpandedId(expanded ? null : entry.id)}
                      >
                        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className="text-xs bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded">
                          {entry.topic}
                        </span>
                        <span className="text-sm flex-1 truncate">{entry.content.slice(0, 80)}</span>
                        <span className="text-xs text-muted-foreground">{entry.confidence.toFixed(2)}</span>
                      </div>
                      {expanded && (
                        <div className="bg-muted/20 p-3 border-b text-xs space-y-1">
                          <div><span className="font-medium">ID:</span> {entry.id}</div>
                          <div><span className="font-medium">Source:</span> {entry.source}</div>
                          <div><span className="font-medium">Confidence:</span> {entry.confidence}</div>
                          <div><span className="font-medium">Created:</span> {new Date(entry.createdAt).toLocaleString()}</div>
                          <div><span className="font-medium">Content:</span></div>
                          <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-40 whitespace-pre-wrap break-words">{entry.content}</pre>
                          <button
                            className="btn-ghost text-xs px-2 py-1 mt-1 flex items-center gap-1 text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); deleteKnowledgeMutation.mutate(entry.id); }}
                            disabled={deleteKnowledgeMutation.isPending}
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
                {knowledge.length > 50 && (
                  <div className="text-center py-2 text-xs text-muted-foreground">
                    Showing 50 of {knowledge.length} knowledge entries
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Memory */}
      {activeTab === 'add' && (
        <div className="card">
          <div className="card-header flex flex-row items-center gap-2 p-3 sm:p-4">
            <Plus className="w-4 h-4 text-muted-foreground" />
            <h2 className="card-title text-sm sm:text-base">Add Memory Entry</h2>
          </div>
          <div className="card-content space-y-3 p-3 sm:p-4 pt-0 sm:pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as typeof newType)}
                  className="bg-card border border-border rounded-lg text-sm py-1.5 px-2 w-full"
                >
                  <option value="semantic">Semantic</option>
                  <option value="episodic">Episodic</option>
                  <option value="procedural">Procedural</option>
                  <option value="preference">Preference</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Source</label>
                <input
                  type="text"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  className="bg-card border border-border rounded-lg text-sm py-1.5 px-3 w-full"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Importance (0-1)</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={newImportance}
                  onChange={(e) => setNewImportance(parseFloat(e.target.value) || 0.5)}
                  className="bg-card border border-border rounded-lg text-sm py-1.5 px-3 w-full"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Content</label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Enter memory content..."
                rows={4}
                className="w-full bg-card border border-border rounded-lg text-sm py-2 px-3 resize-y"
              />
            </div>
            <div className="flex justify-end">
              <button
                className="btn-ghost text-sm px-4 py-2 flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20"
                onClick={handleAddMemory}
                disabled={addMutation.isPending || !newContent.trim()}
              >
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Memory
              </button>
            </div>
            {addMutation.isError && (
              <div className="border border-destructive/30 bg-destructive/10 rounded-lg p-2 text-xs text-destructive">
                Failed to add memory: {addMutation.error instanceof Error ? addMutation.error.message : 'Unknown error'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SimilarityBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.9 ? 'bg-green-500' : score >= 0.7 ? 'bg-blue-500' : score >= 0.5 ? 'bg-yellow-500' : 'bg-muted-foreground';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono">{score.toFixed(3)}</span>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg sm:text-xl font-bold mt-0.5 ${color ?? ''}`}>{value}</p>
    </div>
  );
}
