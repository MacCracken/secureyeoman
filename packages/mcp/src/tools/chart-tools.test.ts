import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChartTools } from './chart-tools.js';
import type { ToolMiddleware } from './index.js';
import type { McpServiceConfig } from '@secureyeoman/shared';

// ── Helpers ─────────────────────────────────────────────────────────────────

type ToolHandler = (
  args: Record<string, unknown>
) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

function makeConfig(overrides: Partial<McpServiceConfig> = {}): McpServiceConfig {
  return {
    exposeCharting: true,
    ...overrides,
  } as McpServiceConfig;
}

function captureHandlers(config?: Partial<McpServiceConfig>): Record<string, ToolHandler> {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  const handlers: Record<string, ToolHandler> = {};

  vi.spyOn(server, 'tool').mockImplementation(
    (name: string, _desc: unknown, _schema: unknown, handler: unknown) => {
      handlers[name as string] = handler as ToolHandler;
      return server;
    }
  );

  registerChartTools(server, makeConfig(config), noopMiddleware());
  return handlers;
}

function parseResult(result: { content: { text: string }[] }): unknown {
  return JSON.parse(result.content[0].text);
}

// ── Registration ────────────────────────────────────────────────────────────

describe('chart-tools — registration', () => {
  it('registers without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerChartTools(server, makeConfig(), noopMiddleware())).not.toThrow();
  });

  it('registers all 8 chart tools', () => {
    const handlers = captureHandlers();
    const expected = [
      'chart_candlestick',
      'chart_line',
      'chart_bar',
      'chart_pie',
      'chart_scatter',
      'chart_waterfall',
      'chart_heatmap',
      'chart_sparkline',
    ];
    expect(Object.keys(handlers).sort()).toEqual(expected.sort());
  });
});

// ── Feature gate ────────────────────────────────────────────────────────────

describe('chart-tools — feature gate', () => {
  it('returns error when charting is disabled', async () => {
    const handlers = captureHandlers({ exposeCharting: false });
    const result = await handlers.chart_candlestick({
      data: [{ date: '3/1', open: 100, high: 110, low: 95, close: 105 }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('disabled');
  });
});

// ── chart_candlestick ───────────────────────────────────────────────────────

describe('chart-tools — chart_candlestick', () => {
  it('generates SVG with metadata', async () => {
    const handlers = captureHandlers();
    const result = await handlers.chart_candlestick({
      data: [
        { date: '3/1', open: 100, high: 110, low: 95, close: 105 },
        { date: '3/2', open: 105, high: 112, low: 100, close: 98 },
      ],
    });
    const parsed = parseResult(result) as { svg: string; data: { candleCount: number } };
    expect(parsed.svg).toContain('<svg');
    expect(parsed.data.candleCount).toBe(2);
  });
});

// ── chart_line ──────────────────────────────────────────────────────────────

describe('chart-tools — chart_line', () => {
  it('generates line chart SVG', async () => {
    const handlers = captureHandlers();
    const result = await handlers.chart_line({
      series: [
        { name: 'Price', data: [{ x: 1, y: 100 }, { x: 2, y: 110 }] },
      ],
    });
    const parsed = parseResult(result) as { svg: string; data: { seriesCount: number; pointCount: number } };
    expect(parsed.svg).toContain('<svg');
    expect(parsed.data.seriesCount).toBe(1);
    expect(parsed.data.pointCount).toBe(2);
  });
});

// ── chart_bar ───────────────────────────────────────────────────────────────

describe('chart-tools — chart_bar', () => {
  it('generates bar chart SVG', async () => {
    const handlers = captureHandlers();
    const result = await handlers.chart_bar({
      data: [
        { label: 'Q1', values: { Revenue: 100 } },
        { label: 'Q2', values: { Revenue: 120 } },
      ],
    });
    const parsed = parseResult(result) as { svg: string; data: { barCount: number; categories: string[] } };
    expect(parsed.data.barCount).toBe(2);
    expect(parsed.data.categories).toContain('Revenue');
  });
});

// ── chart_pie ───────────────────────────────────────────────────────────────

describe('chart-tools — chart_pie', () => {
  it('generates pie chart SVG with totals', async () => {
    const handlers = captureHandlers();
    const result = await handlers.chart_pie({
      slices: [
        { label: 'Stocks', value: 60 },
        { label: 'Bonds', value: 40 },
      ],
    });
    const parsed = parseResult(result) as { svg: string; data: { sliceCount: number; total: number } };
    expect(parsed.data.sliceCount).toBe(2);
    expect(parsed.data.total).toBe(100);
  });
});

// ── chart_scatter ───────────────────────────────────────────────────────────

describe('chart-tools — chart_scatter', () => {
  it('generates scatter plot SVG', async () => {
    const handlers = captureHandlers();
    const result = await handlers.chart_scatter({
      points: [
        { x: 10, y: 5 },
        { x: 20, y: 12 },
      ],
    });
    const parsed = parseResult(result) as { svg: string; data: { pointCount: number } };
    expect(parsed.data.pointCount).toBe(2);
  });
});

// ── chart_waterfall ─────────────────────────────────────────────────────────

describe('chart-tools — chart_waterfall', () => {
  it('generates waterfall SVG with net total', async () => {
    const handlers = captureHandlers();
    const result = await handlers.chart_waterfall({
      items: [
        { label: 'Revenue', value: 100 },
        { label: 'COGS', value: -40 },
        { label: 'Net', value: 0, isTotal: true },
      ],
    });
    const parsed = parseResult(result) as { svg: string; data: { itemCount: number; netTotal: number } };
    expect(parsed.data.itemCount).toBe(3);
    expect(parsed.data.netTotal).toBe(60);
  });
});

// ── chart_heatmap ───────────────────────────────────────────────────────────

describe('chart-tools — chart_heatmap', () => {
  it('generates heatmap SVG with dimensions', async () => {
    const handlers = captureHandlers();
    const result = await handlers.chart_heatmap({
      labels: ['A', 'B'],
      values: [[1, 0.5], [0.5, 1]],
    });
    const parsed = parseResult(result) as { svg: string; data: { dimensions: number[] } };
    expect(parsed.data.dimensions).toEqual([2, 2]);
  });
});

// ── chart_sparkline ─────────────────────────────────────────────────────────

describe('chart-tools — chart_sparkline', () => {
  it('generates sparkline SVG with stats', async () => {
    const handlers = captureHandlers();
    const result = await handlers.chart_sparkline({
      values: [10, 20, 15, 25, 18],
    });
    const parsed = parseResult(result) as { svg: string; data: { pointCount: number; min: number; max: number } };
    expect(parsed.data.pointCount).toBe(5);
    expect(parsed.data.min).toBe(10);
    expect(parsed.data.max).toBe(25);
  });
});
