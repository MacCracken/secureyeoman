# ADR 198 — Advanced Financial Charting (Phase 125-C)

**Status:** Accepted
**Date:** 2026-03-04

## Context

The trading and financial skills in SecureYeoman generate textual analysis but lack the ability to produce visual chart outputs. Financial analysis benefits significantly from candlestick charts, portfolio allocation pies, risk-return scatter plots, and P&L waterfall charts. Users need both server-side SVG generation (for MCP tool responses) and interactive dashboard components.

## Decision

Implement a dual-layer charting system:

1. **Server-side SVG engine** (`chart-scene.ts`) — Pure functions with no DOM dependencies, generating SVG strings for 8 chart types. This runs in Node.js, Docker, and Bun compiled binary environments.

2. **MCP tools** (`chart-tools.ts`) — 8 tools that wrap the SVG engine, gated by `exposeCharting` feature flag. Each tool returns SVG + metadata JSON.

3. **Dashboard components** — Recharts-based interactive components for the dashboard canvas and Mission Control.

### Chart types

| Type | MCP Tool | Dashboard Component |
|------|----------|-------------------|
| Candlestick (OHLCV) | `chart_candlestick` | `CandlestickChart.tsx` |
| Line (multi-series) | `chart_line` | — (recharts native) |
| Bar (grouped/stacked) | `chart_bar` | — (recharts native) |
| Pie/Donut | `chart_pie` | `PortfolioAllocationChart.tsx` |
| Scatter | `chart_scatter` | `RiskReturnScatter.tsx` |
| Waterfall | `chart_waterfall` | `WaterfallChart.tsx` |
| Heatmap | `chart_heatmap` | — |
| Sparkline | `chart_sparkline` | — |

### Feature gating

- `McpFeaturesSchema.exposeCharting` (per-personality, default false)
- `McpServiceConfigSchema.exposeCharting` (global, default true)

## Consequences

- Financial skills can now generate visual chart outputs via MCP tools
- Dashboard gains a new `trading-dashboard` canvas widget and `financial-charts` Mission Control card
- 24 total builtin marketplace skills (was 23)
- 55 new tests covering SVG rendering and tool handlers
