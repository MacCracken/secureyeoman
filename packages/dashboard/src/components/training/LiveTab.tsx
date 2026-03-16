import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Loader2,
  Zap,
  Activity,
} from 'lucide-react';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  fetchTrainingStream,
  fetchQualityScores,
  triggerQualityScoring,
  type QualityScore,
} from '../../api/client';

interface StreamPoint {
  ts: number;
  value: number;
}

export function LiveTab() {
  const [lossSeries, setLossSeries] = useState<StreamPoint[]>([]);
  const [throughput, setThroughput] = useState<number>(0);
  const [agreement, setAgreement] = useState<number>(0);
  const [rewardSeries, setRewardSeries] = useState<StreamPoint[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const {
    data: qualityData,
    isLoading: qualityLoading,
    refetch: refetchQuality,
  } = useQuery({
    queryKey: ['training-quality'],
    queryFn: () => fetchQualityScores(50),
    staleTime: 30_000,
  });

  const scoreMut = useMutation({
    mutationFn: triggerQualityScoring,
    onSuccess: () => void refetchQuality(),
  });

  useEffect(() => {
    const es = fetchTrainingStream();
    esRef.current = es;

    es.addEventListener('message', (evt: MessageEvent<string>) => {
      try {
        const data = JSON.parse(evt.data) as {
          type: string;
          value: number;
          ts: number;
        };
        const point: StreamPoint = { ts: data.ts, value: data.value };
        if (data.type === 'loss') {
          setLossSeries((prev) => [...prev.slice(-199), point]);
        } else if (data.type === 'throughput') {
          setThroughput(data.value);
        } else if (data.type === 'agreement') {
          setAgreement(data.value);
        } else if (data.type === 'reward') {
          setRewardSeries((prev) => [...prev.slice(-199), point]);
        }
      } catch {
        // skip malformed
      }
    });

    return () => {
      es.close();
    };
  }, []);

  const qualityConvs = qualityData?.conversations ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Live Training Stream</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time telemetry from active distillation and fine-tuning jobs.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Zap className="w-3 h-3" /> Throughput
          </div>
          <div className="text-2xl font-semibold mt-1">{throughput.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">samples / min</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Activity className="w-3 h-3" /> Agreement Rate
          </div>
          <div className="text-2xl font-semibold mt-1">{(agreement * 100).toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground">avg char-Jaccard</div>
        </div>
      </div>

      {/* Loss chart */}
      {lossSeries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Loss</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={lossSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" hide />
              <YAxis domain={['auto', 'auto']} width={40} />
              <Tooltip formatter={(v: number) => v.toFixed(4)} />
              <Line
                type="monotone"
                dataKey="value"
                dot={false}
                strokeWidth={2}
                stroke="var(--color-primary, #6366f1)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Reward trend */}
      {rewardSeries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Reward Trend</h3>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={rewardSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" hide />
              <YAxis domain={['auto', 'auto']} width={40} />
              <Tooltip formatter={(v: number) => v.toFixed(3)} />
              <Line
                type="monotone"
                dataKey="value"
                dot={false}
                strokeWidth={2}
                stroke="var(--color-success, #22c55e)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quality heatmap */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Conversation Quality Coverage</h3>
          <button
            onClick={() => {
              scoreMut.mutate();
            }}
            disabled={scoreMut.isPending}
            className="btn btn-ghost text-xs flex items-center gap-1"
          >
            {scoreMut.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Activity className="w-3 h-3" />
            )}
            Score now
          </button>
        </div>
        {qualityLoading ? (
          <div className="text-sm text-muted-foreground">Loading quality scores…</div>
        ) : qualityConvs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No quality scores yet. Click "Score now".</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {qualityConvs.map((q: QualityScore) => {
              const pct = q.qualityScore;
              // Red = 0.0 (needs training), green = 1.0 (well covered)
              const hue = Math.round(pct * 120); // 0=red, 120=green
              return (
                <div
                  key={q.conversationId}
                  title={`${q.conversationId.slice(0, 8)} — score: ${pct.toFixed(2)} (${q.signalSource})`}
                  style={{ backgroundColor: `hsl(${hue}, 60%, 45%)` }}
                  className="w-4 h-4 rounded-sm cursor-default"
                />
              );
            })}
          </div>
        )}
        {scoreMut.data && (
          <p className="text-xs text-muted-foreground mt-1">
            Scored {scoreMut.data.scored} conversation(s)
          </p>
        )}
      </div>
    </div>
  );
}
