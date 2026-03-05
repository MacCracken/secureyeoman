/**
 * Financial Charting Skill (Phase 125)
 *
 * Generate financial charts and visualizations as SVG using the
 * chart_* MCP tools: candlestick, line, bar, pie, scatter,
 * waterfall, heatmap, and sparkline.
 */

import type { MarketplaceSkill } from '@secureyeoman/shared';

export const financialChartingSkill: Partial<MarketplaceSkill> = {
  name: 'Financial Charting',
  description:
    'Generate financial charts and visualizations as SVG. Create candlestick charts, line charts, pie charts for allocation, waterfall P&L, scatter plots for risk/return, heatmaps for correlations, and sparklines for trend indicators.',
  category: 'finance',
  author: 'YEOMAN',
  authorInfo: {
    name: 'YEOMAN',
    github: 'MacCracken',
    website: 'https://secureyeoman.ai',
  },
  version: '2026.3.5',
  instructions: [
    'Role: You are a financial visualization specialist who creates clear, accurate charts from data.',
    '',
    '## Tool Selection Guide',
    '',
    '| Use case | Tool | Key options |',
    '|----------|------|-------------|',
    '| Price history with OHLCV | `chart_candlestick` | movingAverages, showVolume |',
    '| Trends over time | `chart_line` | Multiple series, gridLines |',
    '| Category comparison | `chart_bar` | stacked, horizontal |',
    '| Allocation / distribution | `chart_pie` | donut mode, donutWidth |',
    '| Risk vs return | `chart_scatter` | xLabel, yLabel, showTrendLine |',
    '| P&L bridge / waterfall | `chart_waterfall` | isTotal markers |',
    '| Correlation matrix | `chart_heatmap` | colorLow, colorHigh, showValues |',
    '| Quick inline trend | `chart_sparkline` | fillArea, compact dimensions |',
    '',
    '## Best Practices',
    '',
    '1. Always set a descriptive `title` on charts.',
    '2. Use `darkMode: true` when the user requests dark theme.',
    '3. For candlesticks, add `movingAverages: [{period: 20}, {period: 50}]` for context.',
    '4. For portfolio allocation, prefer `donut: true` with sector labels.',
    '5. For risk/return, set `xLabel: "Risk (Volatility %)"` and `yLabel: "Return %"` and `showTrendLine: true`.',
    '6. For P&L waterfalls, mark the final total with `isTotal: true`.',
    '7. For correlation heatmaps, use symmetric square matrices.',
    '8. Sparklines are ideal for inline trend indicators — keep width ~120, height ~30.',
    '',
    '## Workflow Patterns',
    '',
    '- **Quick Visualization**: User provides data → select appropriate chart type → generate.',
    '- **Market Analysis**: Use `market_historical` to fetch OHLCV → pipe to `chart_candlestick`.',
    '- **Portfolio Review**: Collect allocation weights → `chart_pie` (donut) + `chart_scatter` (risk/return).',
    '- **Earnings Analysis**: Build P&L items → `chart_waterfall` with revenue, costs, net income.',
  ].join('\n'),
  tags: [
    'finance',
    'charting',
    'visualization',
    'svg',
    'candlestick',
    'portfolio',
    'trading',
    'analysis',
  ],
  triggerPatterns: [
    '\\b(chart|graph|plot|visualiz)\\b.{0,30}\\b(stock|price|portfolio|allocation|return|risk|P&?L|correlation)',
    '(candlestick|ohlc|sparkline|heatmap|waterfall|scatter).{0,20}(chart|graph|plot|generate|create|draw)',
    '(show|draw|create|generate|make).{0,20}(chart|graph|plot|visualization)',
  ],
  useWhen:
    'User asks for financial charts, visualizations, or graphical analysis of market, portfolio, or financial data',
  doNotUseWhen:
    'User needs purely textual analysis without visual output, or wants interactive web-based dashboards',
  successCriteria:
    'SVG chart generated with correct data representation, properly labeled axes, title, and legend where applicable',
  routing: 'fuzzy',
  autonomyLevel: 'L1',
  mcpToolsAllowed: [
    'chart_candlestick',
    'chart_line',
    'chart_bar',
    'chart_pie',
    'chart_scatter',
    'chart_waterfall',
    'chart_heatmap',
    'chart_sparkline',
  ],
};
