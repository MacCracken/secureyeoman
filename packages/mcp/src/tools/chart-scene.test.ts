import { describe, it, expect } from 'vitest';
import {
  escapeXml,
  hexToRgba,
  linearScale,
  bandScale,
  renderCandlestick,
  renderLineChart,
  renderBarChart,
  renderPieChart,
  renderScatterPlot,
  renderWaterfall,
  renderHeatmap,
  renderSparkline,
  type OhlcvBar,
} from './chart-scene.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const OHLCV_DATA: OhlcvBar[] = [
  { date: '3/1', open: 100, high: 110, low: 95, close: 105, volume: 1000000 },
  { date: '3/2', open: 105, high: 115, low: 100, close: 98, volume: 1500000 },
  { date: '3/3', open: 98, high: 108, low: 96, close: 106, volume: 1200000 },
];

// ── escapeXml ───────────────────────────────────────────────────────────────

describe('chart-scene — escapeXml', () => {
  it('escapes &, <, >, " and \'', () => {
    expect(escapeXml('a & b < c > "d" \'e\'')).toBe(
      'a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;'
    );
  });

  it('passes through safe strings unchanged', () => {
    expect(escapeXml('Hello World 123')).toBe('Hello World 123');
  });
});

// ── hexToRgba ───────────────────────────────────────────────────────────────

describe('chart-scene — hexToRgba', () => {
  it('converts hex to rgba with opacity', () => {
    expect(hexToRgba('#3b82f6', 0.5)).toBe('rgba(59,130,246,0.5)');
  });

  it('handles full opacity', () => {
    expect(hexToRgba('#ffffff', 1)).toBe('rgba(255,255,255,1)');
  });

  it('handles black', () => {
    expect(hexToRgba('#000000', 0.3)).toBe('rgba(0,0,0,0.3)');
  });
});

// ── linearScale ─────────────────────────────────────────────────────────────

describe('chart-scene — linearScale', () => {
  it('maps domain to range linearly', () => {
    const s = linearScale([0, 100], [0, 200]);
    expect(s(0)).toBe(0);
    expect(s(50)).toBe(100);
    expect(s(100)).toBe(200);
  });

  it('handles inverted range', () => {
    const s = linearScale([0, 100], [200, 0]);
    expect(s(0)).toBe(200);
    expect(s(100)).toBe(0);
  });

  it('handles equal domain by returning midpoint', () => {
    const s = linearScale([50, 50], [0, 200]);
    expect(s(50)).toBe(100);
  });

  it('exposes domain and range', () => {
    const s = linearScale([10, 20], [100, 200]);
    expect(s.domain).toEqual([10, 20]);
    expect(s.range).toEqual([100, 200]);
  });
});

// ── bandScale ───────────────────────────────────────────────────────────────

describe('chart-scene — bandScale', () => {
  it('maps labels to positions with padding', () => {
    const s = bandScale(['A', 'B', 'C'], [0, 300], 0);
    expect(s('A')).toBe(0);
    expect(s('B')).toBe(100);
    expect(s.bandwidth).toBe(100);
    expect(s.labels).toEqual(['A', 'B', 'C']);
  });

  it('returns range start for unknown label', () => {
    const s = bandScale(['X'], [50, 150], 0.1);
    expect(s('UNKNOWN')).toBe(50);
  });
});

// ── renderCandlestick ───────────────────────────────────────────────────────

describe('chart-scene — renderCandlestick', () => {
  it('returns valid SVG for OHLCV data', () => {
    const svg = renderCandlestick(OHLCV_DATA);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('#22c55e'); // green for up candles
    expect(svg).toContain('#ef4444'); // red for down candles
  });

  it('returns empty SVG for empty data', () => {
    const svg = renderCandlestick([]);
    expect(svg).toContain('No data');
  });

  it('includes title when provided', () => {
    const svg = renderCandlestick(OHLCV_DATA, { title: 'AAPL' });
    expect(svg).toContain('AAPL');
  });

  it('shows volume bars when enabled', () => {
    const svg = renderCandlestick(OHLCV_DATA, { showVolume: true });
    expect(svg).toContain('rgba('); // volume bars use rgba
  });

  it('renders moving averages when specified', () => {
    const data: OhlcvBar[] = Array.from({ length: 10 }, (_, i) => ({
      date: `d${i}`,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 102 + i,
    }));
    const svg = renderCandlestick(data, { movingAverages: [{ period: 3 }] });
    expect(svg).toContain('polyline');
  });

  it('supports dark mode', () => {
    const svg = renderCandlestick(OHLCV_DATA, { darkMode: true });
    expect(svg).toContain('#1f2937'); // dark background
  });
});

// ── renderLineChart ─────────────────────────────────────────────────────────

describe('chart-scene — renderLineChart', () => {
  it('renders a single series', () => {
    const svg = renderLineChart([
      {
        name: 'Price',
        data: [
          { x: 1, y: 10 },
          { x: 2, y: 20 },
          { x: 3, y: 15 },
        ],
      },
    ]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('polyline');
  });

  it('handles categorical x values', () => {
    const svg = renderLineChart([
      {
        name: 'A',
        data: [
          { x: 'Jan', y: 10 },
          { x: 'Feb', y: 20 },
        ],
      },
    ]);
    expect(svg).toContain('Jan');
    expect(svg).toContain('Feb');
  });

  it('returns empty SVG when no series', () => {
    const svg = renderLineChart([]);
    expect(svg).toContain('No data');
  });

  it('shows legend for multiple series', () => {
    const svg = renderLineChart([
      { name: 'S1', data: [{ x: 1, y: 1 }] },
      { name: 'S2', data: [{ x: 1, y: 2 }] },
    ]);
    expect(svg).toContain('S1');
    expect(svg).toContain('S2');
  });
});

// ── renderBarChart ──────────────────────────────────────────────────────────

describe('chart-scene — renderBarChart', () => {
  const barData = [
    { label: 'Q1', values: { Revenue: 100, Cost: 60 } },
    { label: 'Q2', values: { Revenue: 120, Cost: 70 } },
  ];

  it('renders grouped bars by default', () => {
    const svg = renderBarChart(barData);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Q1');
    expect(svg).toContain('Q2');
  });

  it('renders stacked bars', () => {
    const svg = renderBarChart(barData, { stacked: true });
    expect(svg).toContain('<rect');
  });

  it('renders horizontal bars', () => {
    const svg = renderBarChart(barData, { horizontal: true });
    expect(svg).toContain('<rect');
  });

  it('returns empty SVG for empty data', () => {
    const svg = renderBarChart([]);
    expect(svg).toContain('No data');
  });
});

// ── renderPieChart ──────────────────────────────────────────────────────────

describe('chart-scene — renderPieChart', () => {
  const slices = [
    { label: 'Stocks', value: 60 },
    { label: 'Bonds', value: 30 },
    { label: 'Cash', value: 10 },
  ];

  it('renders pie slices as SVG paths', () => {
    const svg = renderPieChart(slices);
    expect(svg).toContain('<path');
    expect(svg).toContain('Stocks');
    expect(svg).toContain('60.0%');
  });

  it('renders donut variant', () => {
    const svg = renderPieChart(slices, { donut: true });
    expect(svg).toContain('Total');
  });

  it('returns empty SVG for empty slices', () => {
    const svg = renderPieChart([]);
    expect(svg).toContain('No data');
  });

  it('uses custom slice colors', () => {
    const svg = renderPieChart([{ label: 'A', value: 100, color: '#abcdef' }]);
    expect(svg).toContain('#abcdef');
  });
});

// ── renderScatterPlot ───────────────────────────────────────────────────────

describe('chart-scene — renderScatterPlot', () => {
  const points = [
    { x: 10, y: 5, label: 'AAPL' },
    { x: 15, y: 8, label: 'MSFT' },
    { x: 20, y: 12 },
  ];

  it('renders circles for data points', () => {
    const svg = renderScatterPlot(points);
    expect(svg).toContain('<circle');
    expect(svg).toContain('AAPL');
    expect(svg).toContain('MSFT');
  });

  it('includes axis labels', () => {
    const svg = renderScatterPlot(points, { xLabel: 'Risk', yLabel: 'Return' });
    expect(svg).toContain('Risk');
    expect(svg).toContain('Return');
  });

  it('renders trend line when requested', () => {
    const svg = renderScatterPlot(points, { showTrendLine: true });
    expect(svg).toContain('stroke-dasharray="5 3"');
  });

  it('returns empty SVG for empty points', () => {
    const svg = renderScatterPlot([]);
    expect(svg).toContain('No data');
  });
});

// ── renderWaterfall ─────────────────────────────────────────────────────────

describe('chart-scene — renderWaterfall', () => {
  const items = [
    { label: 'Revenue', value: 100 },
    { label: 'COGS', value: -40 },
    { label: 'SGA', value: -20 },
    { label: 'Net', value: 0, isTotal: true },
  ];

  it('renders waterfall bars with connectors', () => {
    const svg = renderWaterfall(items);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Revenue');
    expect(svg).toContain('#6366f1'); // total bar color
    expect(svg).toContain('#22c55e'); // positive bar
    expect(svg).toContain('#ef4444'); // negative bar
  });

  it('renders connector lines between bars', () => {
    const svg = renderWaterfall(items);
    expect(svg).toContain('stroke-dasharray="3 2"');
  });

  it('returns empty SVG for empty items', () => {
    const svg = renderWaterfall([]);
    expect(svg).toContain('No data');
  });
});

// ── renderHeatmap ───────────────────────────────────────────────────────────

describe('chart-scene — renderHeatmap', () => {
  it('renders cells with color gradient', () => {
    const svg = renderHeatmap({
      labels: ['A', 'B'],
      values: [
        [1, 0.5],
        [0.5, 1],
      ],
    });
    expect(svg).toContain('<rect');
    expect(svg).toContain('rgb(');
    expect(svg).toContain('1.00'); // cell value
  });

  it('hides values when showValues is false', () => {
    const svg = renderHeatmap(
      {
        labels: ['X', 'Y'],
        values: [
          [1, 0],
          [0, 1],
        ],
      },
      { showValues: false }
    );
    // Should NOT contain cell value text (only label text)
    const matches = svg.match(/<text[^>]*>[\d.]+<\/text>/g);
    expect(matches).toBeNull();
  });

  it('returns empty SVG for empty labels', () => {
    const svg = renderHeatmap({ labels: [], values: [] });
    expect(svg).toContain('No data');
  });
});

// ── renderSparkline ─────────────────────────────────────────────────────────

describe('chart-scene — renderSparkline', () => {
  it('renders a compact SVG line', () => {
    const svg = renderSparkline([10, 20, 15, 25, 18]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('polyline');
    expect(svg).toContain('circle'); // endpoint dot
  });

  it('fills area when requested', () => {
    const svg = renderSparkline([5, 10, 8], { fillArea: true });
    expect(svg).toContain('polygon');
  });

  it('uses custom dimensions', () => {
    const svg = renderSparkline([1, 2, 3], { width: 200, height: 50 });
    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="50"');
  });

  it('uses custom color', () => {
    const svg = renderSparkline([1, 2], { color: '#ff0000' });
    expect(svg).toContain('#ff0000');
  });

  it('handles empty values', () => {
    const svg = renderSparkline([]);
    expect(svg).toContain('<svg');
    // Just an empty SVG, no polyline
    expect(svg).not.toContain('polyline');
  });
});
