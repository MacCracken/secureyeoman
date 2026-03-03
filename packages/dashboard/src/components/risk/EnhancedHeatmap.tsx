/**
 * EnhancedHeatmap -- Department x Domain grid with color-coded cells.
 * Cells are colored by risk score level (green/yellow/orange/red) with a
 * warning-icon overlay on breach cells. Cells are clickable via onCellClick.
 */

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface HeatmapCell {
  departmentId: string;
  departmentName: string;
  domain: string;
  score: number;
  threshold: number;
  breached: boolean;
}

interface EnhancedHeatmapProps {
  cells: HeatmapCell[];
  onCellClick?: (cell: HeatmapCell) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 75) return 'bg-red-500';
  if (score >= 50) return 'bg-orange-400';
  if (score >= 25) return 'bg-yellow-400';
  return 'bg-green-500';
}

function scoreTextColor(score: number): string {
  if (score >= 75) return 'text-white';
  if (score >= 50) return 'text-white';
  if (score >= 25) return 'text-gray-900';
  return 'text-white';
}

function capitalize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface GridStructure {
  departments: { id: string; name: string }[];
  domains: string[];
  lookup: Map<string, HeatmapCell>;
}

function buildGrid(cells: HeatmapCell[]): GridStructure {
  const deptMap = new Map<string, string>();
  const domainSet = new Set<string>();
  const lookup = new Map<string, HeatmapCell>();

  for (const cell of cells) {
    deptMap.set(cell.departmentId, cell.departmentName);
    domainSet.add(cell.domain);
    lookup.set(`${cell.departmentId}:${cell.domain}`, cell);
  }

  const departments = Array.from(deptMap.entries()).map(([id, name]) => ({ id, name }));
  departments.sort((a, b) => a.name.localeCompare(b.name));

  const domains = Array.from(domainSet).sort();

  return { departments, domains, lookup };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EnhancedHeatmap({ cells, onCellClick }: EnhancedHeatmapProps) {
  const { departments, domains, lookup } = useMemo(() => buildGrid(cells), [cells]);

  if (cells.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-48 text-muted-foreground text-sm"
        data-testid="enhanced-heatmap"
      >
        No heatmap data available.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="enhanced-heatmap">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[140px]">
                Department
              </th>
              {domains.map((domain) => (
                <th
                  key={domain}
                  className="text-center py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[80px]"
                >
                  {capitalize(domain)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => (
              <tr key={dept.id}>
                <td
                  className="py-1 px-3 text-sm font-medium truncate max-w-[180px]"
                  title={dept.name}
                >
                  {dept.name}
                </td>
                {domains.map((domain) => {
                  const cell = lookup.get(`${dept.id}:${domain}`);
                  if (!cell) {
                    return (
                      <td key={domain} className="py-1 px-2">
                        <div className="w-full h-10 bg-muted/30 rounded flex items-center justify-center text-xs text-muted-foreground">
                          --
                        </div>
                      </td>
                    );
                  }
                  const bgColor = scoreColor(cell.score);
                  const textColor = scoreTextColor(cell.score);
                  const clickable = !!onCellClick;
                  return (
                    <td key={domain} className="py-1 px-2">
                      <button
                        type="button"
                        className={`relative w-full h-10 rounded flex items-center justify-center text-xs font-semibold transition-all ${bgColor} ${textColor} ${
                          clickable
                            ? 'cursor-pointer hover:opacity-80 hover:ring-2 hover:ring-offset-1 hover:ring-primary'
                            : 'cursor-default'
                        } ${cell.breached ? 'ring-2 ring-red-600 ring-offset-1' : ''}`}
                        onClick={() => onCellClick?.(cell)}
                        title={`${dept.name} / ${capitalize(domain)}: ${cell.score.toFixed(1)} (threshold: ${cell.threshold})${cell.breached ? ' - BREACHED' : ''}`}
                        disabled={!clickable}
                      >
                        {cell.score.toFixed(0)}
                        {cell.breached && (
                          <AlertTriangle className="absolute -top-1 -right-1 w-3.5 h-3.5 text-red-600 drop-shadow-sm" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <span className="font-medium">Score:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-green-500" /> 0-24
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-yellow-400" /> 25-49
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-orange-400" /> 50-74
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-500" /> 75-100
        </span>
        <span className="ml-2 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-red-600" /> Breach
        </span>
      </div>
    </div>
  );
}
