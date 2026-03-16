import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export function EvalResultRadarCard({
  metrics,
}: {
  metrics: {
    tool_name_accuracy?: number;
    tool_arg_match?: number;
    semantic_similarity?: number;
    char_similarity?: number;
  };
}) {
  const data = [
    { subject: 'Tool Name', value: (metrics.tool_name_accuracy ?? 0) * 100 },
    { subject: 'Tool Args', value: (metrics.tool_arg_match ?? 0) * 100 },
    { subject: 'Semantic Sim', value: (metrics.semantic_similarity ?? 0) * 100 },
    { subject: 'Char Sim', value: (metrics.char_similarity ?? 0) * 100 },
  ];

  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-sm font-medium mb-3">Evaluation Metrics</h3>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
          <Radar
            name="Score"
            dataKey="value"
            fill="var(--color-primary, #6366f1)"
            fillOpacity={0.3}
            stroke="var(--color-primary, #6366f1)"
            strokeWidth={2}
          />
          <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
