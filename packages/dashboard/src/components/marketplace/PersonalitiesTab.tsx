/**
 * PersonalitiesTab — Browse and install community personalities from the marketplace.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Download, Loader2, Search, FileText } from 'lucide-react';
import { fetchPersonalities, exportPersonality, importPersonality } from '../../api/client';
import type { Personality } from '../../types';

export function PersonalitiesTab() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Fetch all personalities and filter to community ones
  const { data, isLoading } = useQuery({
    queryKey: ['personalities-community'],
    queryFn: () => fetchPersonalities(),
  });

  const personalities = (data?.personalities ?? []).filter((p: Personality) =>
    p.description?.startsWith('[community]')
  );

  const filtered = query
    ? personalities.filter(
        (p: Personality) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.description?.toLowerCase().includes(query.toLowerCase())
      )
    : personalities;

  const exportMut = useMutation({
    mutationFn: async (p: Personality) => {
      const blob = await exportPersonality(p.id, 'md');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${p.name}.md`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      setToast('Personality exported');
      setTimeout(() => setToast(null), 3000);
    },
  });

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      return importPersonality(file);
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['personalities-community'] });
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      const warns = res.warnings?.length ? ` (${res.warnings.length} warnings)` : '';
      setToast(`Imported: ${res.personality.name}${warns}`);
      setTimeout(() => setToast(null), 5000);
    },
    onError: (err: Error) => {
      setToast(`Import failed: ${err.message}`);
      setTimeout(() => setToast(null), 5000);
    },
  });

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) importMut.mutate(file);
    };
    input.click();
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-card border border-border rounded-lg px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full bg-card border border-border rounded-lg pl-10 pr-3 py-2.5 text-sm"
            placeholder="Search community personalities..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className="btn btn-ghost flex items-center gap-2 text-sm"
          onClick={handleImport}
          disabled={importMut.isPending}
        >
          {importMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          Import .md
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !filtered.length ? (
        <div className="card p-12 text-center">
          <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            {query ? 'No community personalities found' : 'No community personalities synced yet'}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Run community sync to import personalities from the community repo
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p: Personality) => (
            <div key={p.id} className="card p-4 flex flex-col">
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{p.name}</h3>
                  <span className="badge badge-info text-xs">Community</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {p.description?.replace(/^\[community\]\s*/, '') || 'No description'}
                </p>
                {Object.keys(p.traits ?? {}).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.keys(p.traits).slice(0, 4).map((trait) => (
                      <span
                        key={trait}
                        className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {trait}
                      </span>
                    ))}
                    {Object.keys(p.traits).length > 4 && (
                      <span className="text-xs text-muted-foreground">
                        +{Object.keys(p.traits).length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-border flex gap-2">
                <button
                  className="btn btn-ghost flex items-center gap-2 flex-1 justify-center text-sm"
                  onClick={() => exportMut.mutate(p)}
                  disabled={exportMut.isPending}
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
