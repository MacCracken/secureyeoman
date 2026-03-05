/**
 * Financial Charting MCP Tools (Phase 125)
 *
 * Eight tools for generating SVG chart visualizations:
 * candlestick, line, bar, pie, scatter, waterfall, heatmap, sparkline.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';
import {
  renderCandlestick,
  renderLineChart,
  renderBarChart,
  renderPieChart,
  renderScatterPlot,
  renderWaterfall,
  renderHeatmap,
  renderSparkline,
} from './chart-scene.js';

function disabled(): { content: { type: 'text'; text: string }[]; isError: boolean } {
  return {
    content: [
      {
        type: 'text',
        text: 'Charting tools are disabled. Enable exposeCharting in MCP config to use chart_* tools.',
      },
    ],
    isError: true,
  };
}

// ─── Shared Zod fragments ───────────────────────────────────────────────────

const ChartConfigSchema = {
  width: z.number().int().min(100).max(4000).optional().describe('Chart width in pixels (default 800)'),
  height: z.number().int().min(100).max(4000).optional().describe('Chart height in pixels (default 500)'),
  title: z.string().max(200).optional().describe('Chart title displayed at top'),
  darkMode: z.boolean().optional().describe('Use dark background theme (default false)'),
  colors: z.array(z.string()).max(16).optional().describe('Custom color palette (hex values)'),
  gridLines: z.boolean().optional().describe('Show grid lines (default true)'),
  showLegend: z.boolean().optional().describe('Show legend (default true)'),
};

const OhlcvBarSchema = z.object({
  date: z.string().describe('Date label (e.g. "2026-03-04")'),
  open: z.number().describe('Opening price'),
  high: z.number().describe('Highest price'),
  low: z.number().describe('Lowest price'),
  close: z.number().describe('Closing price'),
  volume: z.number().optional().describe('Trading volume'),
});

// ─── Registration ───────────────────────────────────────────────────────────

export function registerChartTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware,
): void {
  // ── chart_candlestick ───────────────────────────────────────────────────
  server.tool(
    'chart_candlestick',
    'Generate an OHLCV candlestick chart as SVG with optional volume bars and moving averages',
    {
      data: z.array(OhlcvBarSchema).min(1).describe('OHLCV price bars'),
      movingAverages: z.array(z.object({
        period: z.number().int().min(2).describe('Moving average period (e.g. 20)'),
        color: z.string().optional().describe('Line color (hex)'),
      })).max(5).optional().describe('Simple moving average overlays'),
      showVolume: z.boolean().optional().describe('Show volume bars at bottom (default false)'),
      ...ChartConfigSchema,
    },
    wrapToolHandler('chart_candlestick', middleware, async (args) => {
      if (!config.exposeCharting) return disabled();
      const svg = renderCandlestick(args.data, {
        movingAverages: args.movingAverages,
        showVolume: args.showVolume,
        width: args.width,
        height: args.height,
        title: args.title,
        darkMode: args.darkMode,
        colors: args.colors,
        gridLines: args.gridLines,
      });
      const dates = args.data.map(d => d.date);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            svg,
            data: {
              candleCount: args.data.length,
              dateRange: [dates[0], dates[dates.length - 1]],
              priceRange: [Math.min(...args.data.map(d => d.low)), Math.max(...args.data.map(d => d.high))],
            },
          }, null, 2),
        }],
      };
    }),
  );

  // ── chart_line ──────────────────────────────────────────────────────────
  server.tool(
    'chart_line',
    'Generate a multi-series line chart as SVG for price trends and time series',
    {
      series: z.array(z.object({
        name: z.string().describe('Series name'),
        data: z.array(z.object({
          x: z.union([z.number(), z.string()]).describe('X value (numeric or category label)'),
          y: z.number().describe('Y value'),
        })).min(1).describe('Data points'),
        color: z.string().optional().describe('Line color (hex)'),
      })).min(1).describe('One or more data series'),
      ...ChartConfigSchema,
    },
    wrapToolHandler('chart_line', middleware, async (args) => {
      if (!config.exposeCharting) return disabled();
      const svg = renderLineChart(args.series, {
        width: args.width,
        height: args.height,
        title: args.title,
        darkMode: args.darkMode,
        colors: args.colors,
        gridLines: args.gridLines,
        showLegend: args.showLegend,
      });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            svg,
            data: { seriesCount: args.series.length, pointCount: args.series.reduce((a, s) => a + s.data.length, 0) },
          }, null, 2),
        }],
      };
    }),
  );

  // ── chart_bar ───────────────────────────────────────────────────────────
  server.tool(
    'chart_bar',
    'Generate a grouped or stacked bar chart as SVG for comparisons and allocations',
    {
      data: z.array(z.object({
        label: z.string().describe('Category label'),
        values: z.record(z.string(), z.number()).describe('Named values (keys become series)'),
      })).min(1).describe('Bar data grouped by category'),
      stacked: z.boolean().optional().describe('Stack bars instead of grouping (default false)'),
      horizontal: z.boolean().optional().describe('Horizontal bars (default false)'),
      ...ChartConfigSchema,
    },
    wrapToolHandler('chart_bar', middleware, async (args) => {
      if (!config.exposeCharting) return disabled();
      const svg = renderBarChart(args.data, {
        stacked: args.stacked,
        horizontal: args.horizontal,
        width: args.width,
        height: args.height,
        title: args.title,
        darkMode: args.darkMode,
        colors: args.colors,
        gridLines: args.gridLines,
        showLegend: args.showLegend,
      });
      const categories = [...new Set(args.data.flatMap(d => Object.keys(d.values)))];
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            svg,
            data: { barCount: args.data.length, categories },
          }, null, 2),
        }],
      };
    }),
  );

  // ── chart_pie ───────────────────────────────────────────────────────────
  server.tool(
    'chart_pie',
    'Generate a pie or donut chart as SVG for portfolio allocation and distributions',
    {
      slices: z.array(z.object({
        label: z.string().describe('Slice label'),
        value: z.number().positive().describe('Slice value'),
        color: z.string().optional().describe('Slice color (hex)'),
      })).min(1).describe('Pie slices'),
      donut: z.boolean().optional().describe('Render as donut (hollow center, default false)'),
      donutWidth: z.number().min(10).max(200).optional().describe('Donut ring width in pixels (default 40)'),
      ...ChartConfigSchema,
    },
    wrapToolHandler('chart_pie', middleware, async (args) => {
      if (!config.exposeCharting) return disabled();
      const svg = renderPieChart(args.slices, {
        donut: args.donut,
        donutWidth: args.donutWidth,
        width: args.width,
        height: args.height,
        title: args.title,
        darkMode: args.darkMode,
        colors: args.colors,
      });
      const total = args.slices.reduce((a, s) => a + s.value, 0);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            svg,
            data: { sliceCount: args.slices.length, total },
          }, null, 2),
        }],
      };
    }),
  );

  // ── chart_scatter ───────────────────────────────────────────────────────
  server.tool(
    'chart_scatter',
    'Generate a scatter plot as SVG for risk vs return and correlation analysis',
    {
      points: z.array(z.object({
        x: z.number().describe('X-axis value (e.g. risk/volatility)'),
        y: z.number().describe('Y-axis value (e.g. return)'),
        label: z.string().optional().describe('Point label (e.g. ticker symbol)'),
        size: z.number().min(1).max(30).optional().describe('Circle radius (default 5)'),
        color: z.string().optional().describe('Point color (hex)'),
      })).min(1).describe('Data points'),
      xLabel: z.string().max(100).optional().describe('X-axis label'),
      yLabel: z.string().max(100).optional().describe('Y-axis label'),
      showTrendLine: z.boolean().optional().describe('Show linear regression trend line (default false)'),
      ...ChartConfigSchema,
    },
    wrapToolHandler('chart_scatter', middleware, async (args) => {
      if (!config.exposeCharting) return disabled();
      const svg = renderScatterPlot(args.points, {
        xLabel: args.xLabel,
        yLabel: args.yLabel,
        showTrendLine: args.showTrendLine,
        width: args.width,
        height: args.height,
        title: args.title,
        darkMode: args.darkMode,
        colors: args.colors,
        gridLines: args.gridLines,
      });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            svg,
            data: { pointCount: args.points.length },
          }, null, 2),
        }],
      };
    }),
  );

  // ── chart_waterfall ─────────────────────────────────────────────────────
  server.tool(
    'chart_waterfall',
    'Generate a waterfall chart as SVG for P&L breakdown and synergy bridges',
    {
      items: z.array(z.object({
        label: z.string().describe('Item label (e.g. "Revenue", "COGS")'),
        value: z.number().describe('Delta value (positive=gain, negative=loss)'),
        isTotal: z.boolean().optional().describe('Mark as total bar (renders from zero)'),
      })).min(1).describe('Waterfall items in order'),
      ...ChartConfigSchema,
    },
    wrapToolHandler('chart_waterfall', middleware, async (args) => {
      if (!config.exposeCharting) return disabled();
      const svg = renderWaterfall(args.items, {
        width: args.width,
        height: args.height,
        title: args.title,
        darkMode: args.darkMode,
        colors: args.colors,
        gridLines: args.gridLines,
      });
      const netTotal = args.items.filter(i => !i.isTotal).reduce((a, i) => a + i.value, 0);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            svg,
            data: { itemCount: args.items.length, netTotal },
          }, null, 2),
        }],
      };
    }),
  );

  // ── chart_heatmap ───────────────────────────────────────────────────────
  server.tool(
    'chart_heatmap',
    'Generate a correlation matrix heatmap as SVG for asset correlations',
    {
      labels: z.array(z.string()).min(2).describe('Row and column labels'),
      values: z.array(z.array(z.number())).min(2).describe('2D matrix of values (rows × columns)'),
      colorLow: z.string().optional().describe('Color for lowest value (hex, default "#dbeafe")'),
      colorHigh: z.string().optional().describe('Color for highest value (hex, default "#1d4ed8")'),
      showValues: z.boolean().optional().describe('Show numeric values in cells (default true)'),
      ...ChartConfigSchema,
    },
    wrapToolHandler('chart_heatmap', middleware, async (args) => {
      if (!config.exposeCharting) return disabled();
      const svg = renderHeatmap({ labels: args.labels, values: args.values }, {
        colorLow: args.colorLow,
        colorHigh: args.colorHigh,
        showValues: args.showValues,
        width: args.width,
        height: args.height,
        title: args.title,
        darkMode: args.darkMode,
      });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            svg,
            data: { dimensions: [args.values.length, args.values[0]?.length ?? 0] },
          }, null, 2),
        }],
      };
    }),
  );

  // ── chart_sparkline ─────────────────────────────────────────────────────
  server.tool(
    'chart_sparkline',
    'Generate a compact inline sparkline as SVG for quick trend indicators',
    {
      values: z.array(z.number()).min(2).describe('Numeric values in time order'),
      width: z.number().int().min(40).max(800).optional().describe('Sparkline width (default 120)'),
      height: z.number().int().min(10).max(200).optional().describe('Sparkline height (default 30)'),
      color: z.string().optional().describe('Line color (hex, default "#3b82f6")'),
      fillArea: z.boolean().optional().describe('Fill area under line (default false)'),
    },
    wrapToolHandler('chart_sparkline', middleware, async (args) => {
      if (!config.exposeCharting) return disabled();
      const svg = renderSparkline(args.values, {
        width: args.width,
        height: args.height,
        color: args.color,
        fillArea: args.fillArea,
      });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            svg,
            data: { pointCount: args.values.length, min: Math.min(...args.values), max: Math.max(...args.values) },
          }, null, 2),
        }],
      };
    }),
  );
}
