/**
 * AnalyticsTab — conversation analytics dashboard with 5 sections (Phase 96).
 * Lazy-loaded from MetricsPage.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  BarChart3,
  Hash,
  Search,
  AlertTriangle,
} from 'lucide-react';
import {
  fetchSentimentTrend,
  fetchEngagementMetrics,
  fetchKeyPhrases,
  fetchPersonalities,
} from '../../api/client';
import { SentimentTrendChart } from './SentimentTrendChart';
import { EngagementMetricsPanel } from './EngagementMetricsPanel';
import { TopicCloudWidget } from './TopicCloudWidget';
import { EntityExplorerPanel } from './EntityExplorerPanel';
import { AnomalyAlertsList } from './AnomalyAlertsList';

type SubTab = 'sentiment' | 'engagement' | 'topics' | 'entities' | 'anomalies';

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'sentiment', label: 'Sentiment', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { id: 'engagement', label: 'Engagement', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: 'topics', label: 'Topics', icon: <Hash className="w-3.5 h-3.5" /> },
  { id: 'entities', label: 'Entities', icon: <Search className="w-3.5 h-3.5" /> },
  { id: 'anomalies', label: 'Anomalies', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
];

const DAY_OPTIONS = [7, 30, 90] as const;

export default function AnalyticsTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('sentiment');
  const [days, setDays] = useState<number>(30);

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });
  const personalities = personalitiesData?.personalities ?? [];
  const activePersonalities = personalities.filter((p) => p.isActive);
  const defaultPersonality = personalities.find((p) => p.isDefault);
  const selectedPersonalityId = defaultPersonality?.id ?? activePersonalities[0]?.id ?? null;

  const { data: sentimentData = [], isLoading: sentimentLoading } = useQuery({
    queryKey: ['sentimentTrend', selectedPersonalityId, days],
    queryFn: () => (selectedPersonalityId ? fetchSentimentTrend(selectedPersonalityId, days) : Promise.resolve([])),
    enabled: activeSubTab === 'sentiment' && !!selectedPersonalityId,
  });

  const { data: engagementData, isLoading: engagementLoading } = useQuery({
    queryKey: ['engagementMetrics', selectedPersonalityId, days],
    queryFn: () => fetchEngagementMetrics(selectedPersonalityId ?? undefined, days),
    enabled: activeSubTab === 'engagement',
  });

  const { data: keyPhrases = [], isLoading: phrasesLoading } = useQuery({
    queryKey: ['keyPhrases', selectedPersonalityId],
    queryFn: () => (selectedPersonalityId ? fetchKeyPhrases(selectedPersonalityId, 60) : Promise.resolve([])),
    enabled: activeSubTab === 'topics' && !!selectedPersonalityId,
  });

  return (
    <div className="space-y-4" data-testid="analytics-tab">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 border rounded-lg p-1">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeSubTab === tab.id
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Day range toggle */}
        {(activeSubTab === 'sentiment' || activeSubTab === 'engagement') && (
          <div className="flex items-center gap-1 bg-muted/50 border rounded-lg p-1 ml-auto">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  days === d
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="bg-card border rounded-lg p-4">
        {activeSubTab === 'sentiment' && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Sentiment Trend</h3>
            <SentimentTrendChart data={sentimentData} isLoading={sentimentLoading} />
          </div>
        )}
        {activeSubTab === 'engagement' && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Engagement Metrics</h3>
            <EngagementMetricsPanel data={engagementData} isLoading={engagementLoading} />
          </div>
        )}
        {activeSubTab === 'topics' && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Key Phrases</h3>
            <TopicCloudWidget phrases={keyPhrases} isLoading={phrasesLoading} />
          </div>
        )}
        {activeSubTab === 'entities' && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Entity Explorer</h3>
            <EntityExplorerPanel personalityId={selectedPersonalityId} />
          </div>
        )}
        {activeSubTab === 'anomalies' && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Usage Anomalies</h3>
            <AnomalyAlertsList />
          </div>
        )}
      </div>
    </div>
  );
}
