/**
 * EntityExplorerPanel — entity type filter + search with results.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { fetchTopEntities, searchEntities } from '../../api/client';

interface EntityExplorerPanelProps {
  personalityId: string | null;
}

const ENTITY_TYPES = [
  'all',
  'person',
  'organization',
  'technology',
  'location',
  'product',
  'concept',
] as const;

export function EntityExplorerPanel({ personalityId }: EntityExplorerPanelProps) {
  const [activeType, setActiveType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: topEntities = [], isLoading } = useQuery({
    queryKey: ['topEntities', personalityId],
    queryFn: () => (personalityId ? fetchTopEntities(personalityId, 30) : Promise.resolve([])),
    enabled: !!personalityId,
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ['entitySearch', searchTerm, activeType],
    queryFn: () => searchEntities(searchTerm, activeType === 'all' ? 'concept' : activeType),
    enabled: searchTerm.length >= 2,
  });

  const filteredEntities =
    activeType === 'all' ? topEntities : topEntities.filter((e) => e.entityType === activeType);

  return (
    <div data-testid="entity-explorer">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search entities..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
            }}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border bg-background"
          />
        </div>
      </div>

      <div className="flex gap-1 mb-3 flex-wrap">
        {ENTITY_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => {
              setActiveType(type);
            }}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
              activeType === type
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading entities...</div>
      ) : searchTerm.length >= 2 ? (
        <div className="space-y-1">
          {searchResults.length === 0 ? (
            <div className="text-sm text-muted-foreground">No results found</div>
          ) : (
            searchResults.map((r) => (
              <div
                key={r.conversationId}
                className="flex justify-between text-sm py-1 border-b last:border-0"
              >
                <span className="truncate">{r.title || r.conversationId}</span>
                <span className="text-muted-foreground ml-2 shrink-0">{r.mentionCount}x</span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {filteredEntities.length === 0 ? (
            <div className="text-sm text-muted-foreground">No entities found</div>
          ) : (
            filteredEntities.map((e) => (
              <div
                key={`${e.entityType}-${e.entityValue}`}
                className="flex justify-between text-sm py-1 border-b last:border-0"
              >
                <div>
                  <span className="font-medium">{e.entityValue}</span>
                  <span className="text-xs text-muted-foreground ml-1.5 px-1.5 py-0.5 bg-muted rounded">
                    {e.entityType}
                  </span>
                </div>
                <span className="text-muted-foreground ml-2 shrink-0">
                  {e.totalMentions}x / {e.conversationCount} convs
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
