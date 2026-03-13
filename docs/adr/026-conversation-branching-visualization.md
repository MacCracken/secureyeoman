# ADR 026 — Conversation Branching Visualization

**Status**: Accepted
**Date**: 2026-03-06

## Context

SecureYeoman's conversation branching system (Phase 99) provides the ability to fork conversations from any message, replay with different models, and compare results via pairwise scoring. The backend infrastructure and basic tree view were complete, but the visualization layer lacked the depth needed for users to effectively explore and analyze complex branch hierarchies.

Users with deep branch trees (5+ levels) and multiple replay experiments needed:
- Aggregate statistics across the entire tree
- A chronological view of branch creation
- The ability to compare any two arbitrary branches
- A unified exploration interface combining all views

## Decision

Extend the conversation branching visualization with four new dashboard components, unified under a tabbed Branch Explorer panel.

### New components

1. **BranchExplorer** — Tabbed container with Tree, Timeline, Stats, and Compare tabs. Replaces the standalone BranchTreeView in ChatPage. Fetches the branch tree once and shares it across all tabs.

2. **BranchStatsPanel** — Aggregate statistics including total branches, max depth, leaf count, average quality, quality distribution histogram (5 buckets with color coding), and model usage breakdown.

3. **BranchTimeline** — Vertical timeline showing all branches in depth-first order with color-coded depth indicators, quality scores, model badges, branch labels, and fork indices. Click to navigate.

4. **BranchCompareSelector** — Two dropdowns populated from the tree allowing selection of any two branches for side-by-side comparison. Branches are indented by depth and show quality scores.

### Integration

The existing `BranchTreeView` and `ReplayDiffView` components are preserved unchanged. The new `BranchExplorer` wraps `BranchTreeView` as its "Tree" tab and adds Timeline, Stats, and Compare as peer tabs. The ChatPage side panel was widened from `w-80` to `w-96` to accommodate the richer content.

## Consequences

**Benefits**:
- Users can analyze branch quality distribution at a glance (histogram)
- Timeline view reveals the chronological structure of experiments
- Compare selector enables ad-hoc comparison of any two branches without navigating through the tree
- Tabbed interface keeps the panel organized despite increased functionality

**Trade-offs**:
- Wider side panel reduces main chat area slightly
- Single tree query shared across tabs — efficient but shows same staleness across views

## Files

| Path | Purpose |
|------|---------|
| `packages/dashboard/src/components/chat/BranchExplorer.tsx` | Tabbed container component |
| `packages/dashboard/src/components/chat/BranchStatsPanel.tsx` | Tree statistics and quality histogram |
| `packages/dashboard/src/components/chat/BranchTimeline.tsx` | Chronological branch timeline |
| `packages/dashboard/src/components/chat/BranchCompareSelector.tsx` | Branch pair comparison selector |
| `packages/dashboard/src/components/chat/BranchExplorer.test.tsx` | Explorer tests (6) |
| `packages/dashboard/src/components/chat/BranchStatsPanel.test.tsx` | Stats tests (6) |
| `packages/dashboard/src/components/chat/BranchTimeline.test.tsx` | Timeline tests (8) |
| `packages/dashboard/src/components/chat/BranchCompareSelector.test.tsx` | Compare tests (6) |
| `packages/dashboard/src/components/ChatPage.tsx` | Integration (BranchExplorer replaces BranchTreeView) |
| `docs/guides/platform-features/conversation-branching.md` | User guide |
