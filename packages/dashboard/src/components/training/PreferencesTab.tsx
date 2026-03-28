import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Download, Loader2, ThumbsUp, ThumbsDown, Filter } from 'lucide-react';
import {
  fetchPreferencePairs,
  deletePreferencePair,
  exportPreferencesAsDpo,
} from '../../api/client';

export function PreferencesTab() {
  const queryClient = useQueryClient();
  const [sourceFilter, setSourceFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['preference-pairs', sourceFilter],
    queryFn: () => fetchPreferencePairs({ source: sourceFilter || undefined, limit: 200 }),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePreferencePair,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preference-pairs'] }),
  });

  const handleExport = async () => {
    try {
      const response = await exportPreferencesAsDpo({ source: sourceFilter || undefined });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dpo-export-${new Date().toISOString().slice(0, 10)}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    }
  };

  const pairs = data?.pairs ?? [];
  const sourceCounts = pairs.reduce<Record<string, number>>((acc, p) => {
    acc[p.source] = (acc[p.source] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">Preference Pairs (DPO)</h3>
          <div className="flex gap-2 text-xs text-muted-foreground">
            {Object.entries(sourceCounts).map(([source, count]) => (
              <span key={source} className="bg-muted px-2 py-0.5 rounded">
                {source}: {count}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
              }}
              className="text-xs bg-muted border-0 rounded px-2 py-1"
            >
              <option value="">All sources</option>
              <option value="annotation">Annotation</option>
              <option value="comparison">Comparison</option>
              <option value="multi_turn">Multi-turn</option>
            </select>
          </div>
          <button
            onClick={() => void handleExport()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <Download className="w-3.5 h-3.5" />
            Export DPO
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading preferences...
        </div>
      ) : pairs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No preference pairs recorded yet. Use the side-by-side rating or annotation API.
        </p>
      ) : (
        <div className="space-y-2">
          {pairs.map((pair) => (
            <div key={pair.id} className="border rounded-lg p-3 space-y-2 text-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-1">
                  <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
                    Prompt
                  </p>
                  <p className="line-clamp-2">{pair.prompt}</p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{pair.source}</span>
                  <button
                    onClick={() => {
                      deleteMutation.mutate(pair.id);
                    }}
                    className="text-muted-foreground hover:text-destructive p-1"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 dark:bg-green-950/20 rounded p-2">
                  <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 mb-1">
                    <ThumbsUp className="w-3 h-3" /> Chosen
                  </div>
                  <p className="text-xs line-clamp-3">{pair.chosen}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/20 rounded p-2">
                  <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 mb-1">
                    <ThumbsDown className="w-3 h-3" /> Rejected
                  </div>
                  <p className="text-xs line-clamp-3">{pair.rejected}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
