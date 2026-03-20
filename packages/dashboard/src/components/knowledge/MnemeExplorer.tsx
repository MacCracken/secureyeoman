import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  BookOpen,
  FileText,
  Tag,
  Loader2,
  ExternalLink,
  Network,
  List,
} from 'lucide-react';
import { WebGLGraph } from '../WebGLGraph';
import type { WebGLGraphNode, WebGLGraphEdge } from '../WebGLGraph';

// ── API helpers (talk directly to Mneme) ────────────────────────────────────

const MNEME_URL =
  (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__MNEME_URL__) ||
  'http://127.0.0.1:3838';

async function mnemeGet<T>(path: string): Promise<T> {
  const resp = await fetch(`${MNEME_URL}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`Mneme ${resp.status}`);
  return resp.json() as Promise<T>;
}

interface MnemeNote {
  id: string;
  title: string;
  path: string;
  content?: string;
  tags?: string[];
  backlinks?: { source_id: string; source_title: string }[];
  updated_at: string;
}

interface MnemeSearchHit {
  note_id: string;
  title: string;
  snippet: string;
  score: number;
}

interface MnemeTag {
  id: string;
  name: string;
}

// ── Component ───────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'graph';

export function MnemeExplorer() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: ['mneme-notes'],
    queryFn: () => mnemeGet<MnemeNote[]>('/v1/notes'),
    staleTime: 15000,
  });

  const { data: tags } = useQuery({
    queryKey: ['mneme-tags'],
    queryFn: () => mnemeGet<MnemeTag[]>('/v1/tags'),
    staleTime: 30000,
  });

  const { data: searchResults } = useQuery({
    queryKey: ['mneme-search', searchQuery],
    queryFn: () =>
      mnemeGet<{ results: MnemeSearchHit[] }>(`/v1/search?q=${encodeURIComponent(searchQuery)}`),
    enabled: searchQuery.length > 1,
    staleTime: 5000,
  });

  const { data: selectedNote } = useQuery({
    queryKey: ['mneme-note', selectedNoteId],
    queryFn: () => mnemeGet<MnemeNote>(`/v1/notes/${selectedNoteId}`),
    enabled: !!selectedNoteId,
    staleTime: 10000,
  });

  // ── Graph data from notes + backlinks ───────────────────────────────────

  const graphData = React.useMemo(() => {
    if (!notes?.length) return { nodes: [] as WebGLGraphNode[], edges: [] as WebGLGraphEdge[] };

    const graphNodes: WebGLGraphNode[] = notes.map((n) => ({
      id: n.id,
      label: n.title,
      size: 8,
      color: selectedNoteId === n.id ? '#3b82f6' : '#6b7280',
    }));

    const edges: WebGLGraphEdge[] = [];
    const noteIds = new Set(notes.map((n) => n.id));

    for (const note of notes) {
      for (const bl of note.backlinks ?? []) {
        if (noteIds.has(bl.source_id)) {
          edges.push({
            source: bl.source_id,
            target: note.id,
            color: '#9ca3af',
          });
        }
      }
    }

    return { nodes: graphNodes, edges };
  }, [notes, selectedNoteId]);

  const displayNotes =
    searchQuery && searchResults?.results?.length
      ? searchResults.results.map((r) => ({
          id: r.note_id,
          title: r.title,
          snippet: r.snippet,
          score: r.score,
        }))
      : (notes ?? []).map((n) => ({
          id: n.id,
          title: n.title,
          snippet: n.path,
          score: 0,
        }));

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          Mneme Knowledge Base
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setViewMode('list');
            }}
            className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setViewMode('graph');
            }}
            className={`p-1.5 rounded ${viewMode === 'graph' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Network className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
          }}
          placeholder="Search Mneme notes..."
          className="w-full bg-card border border-border rounded text-sm py-1.5 pl-8 pr-2"
        />
      </div>

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => {
                setSearchQuery(`#${tag.name}`);
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/50 text-xs text-muted-foreground hover:text-foreground"
            >
              <Tag className="w-2.5 h-2.5" />
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {/* Graph View */}
      {viewMode === 'graph' && graphData.nodes.length > 0 && (
        <div className="border border-border rounded overflow-hidden">
          <WebGLGraph
            nodes={graphData.nodes}
            edges={graphData.edges}
            height={300}
            onNodeClick={(id) => {
              setSelectedNoteId(id);
            }}
            layout="forceatlas2"
          />
        </div>
      )}

      {viewMode === 'graph' && graphData.nodes.length === 0 && !notesLoading && (
        <p className="text-xs text-muted-foreground text-center py-8">
          No notes found. Add notes in Mneme to see the knowledge graph.
        </p>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {notesLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {displayNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => {
                setSelectedNoteId(note.id);
              }}
              className={`w-full text-left px-3 py-2 rounded text-xs hover:bg-accent/50 transition-colors ${
                selectedNoteId === note.id ? 'bg-accent' : ''
              }`}
            >
              <div className="font-medium truncate">{note.title}</div>
              <div className="text-muted-foreground truncate mt-0.5">{note.snippet}</div>
            </button>
          ))}
          {!notesLoading && displayNotes.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              {searchQuery ? 'No results found.' : 'No notes in Mneme.'}
            </p>
          )}
        </div>
      )}

      {/* Note Detail */}
      {selectedNote && (
        <div className="card">
          <div className="card-header p-3">
            <div className="flex items-center justify-between">
              <h4 className="card-title text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                {selectedNote.title}
              </h4>
              <button
                onClick={() => {
                  setSelectedNoteId(null);
                }}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Close
              </button>
            </div>
            {selectedNote.tags && selectedNote.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {selectedNote.tags.map((t) => (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="card-content p-3 pt-0">
            <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground max-h-[200px] overflow-y-auto">
              {selectedNote.content}
            </pre>
            {selectedNote.backlinks && selectedNote.backlinks.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Backlinks</p>
                {selectedNote.backlinks.map((bl) => (
                  <button
                    key={bl.source_id}
                    onClick={() => {
                      setSelectedNoteId(bl.source_id);
                    }}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    {bl.source_title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
