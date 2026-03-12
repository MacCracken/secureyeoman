# ADR 038: Simulation Engine — Complete Core Infrastructure

**Status**: Accepted
**Date**: 2026-03-12

## Context

The simulation engine was introduced as an enterprise-tier feature providing a general-purpose live simulation framework. The initial implementation (2026-03-12, first batch) delivered 5 of 7 core infrastructure items: tick driver, mood engine, spatial engine, experiment runner, and training executor.

Two items remained to complete the core infrastructure:

1. **Entity relationship graph** — inter-entity relationship tracking with affinity, trust, and group membership
2. **Simulation dashboard panel** — real-time monitoring UI for all simulation subsystems

## Decision

### Entity Relationship Graph

`RelationshipGraph` (`simulation/relationship-graph.ts`) provides persistent relationship tracking between simulation entities:

- **Relationships** have affinity (-1 to 1) and trust (0 to 1) scores with 8 types (`ally`, `rival`, `neutral`, `mentor`, `student`, `trade_partner`, `family`, `custom`)
- **Interactions** auto-adjust affinity/trust via delta values; auto-create relationships on first interaction; optionally trigger mood effects via MoodEngine
- **Groups** are named entity collections with membership management
- **Tick-driven decay** moves affinity toward 0 and trust toward 0.5 at configurable `decayRate` per relationship

Database: 3 tables in migration `020_relationships.sql` (`entity_relationships`, `relationship_events`, `entity_groups`).

REST API: 14 endpoints under `/api/v1/simulation/relationships/` and `/api/v1/simulation/groups/`.

### Simulation Dashboard Panel

`SimulationPanel.tsx` provides a 4-tab monitoring interface:

| Tab | Content |
|-----|---------|
| Tick Driver | Current tick, mode, time scale, paused state. Play/Pause/Advance/Stop controls. Start form. |
| Mood | Valence/arousal progress bars, mood label badge, event submission, reset, history. |
| Spatial | Entity position table, zone grid with bounding boxes. |
| Relationships | Relationship table with affinity/trust bars, interaction counts. Group grid. |

Gated by `allowSimulation` in the security policy. Lazy-loaded at `/simulation`.

15 API client functions added for the dashboard to communicate with all simulation endpoints.

## Consequences

- Simulation core infrastructure is now **7/7 complete**
- Total simulation surface: 10 database tables across 3 migrations, 43+ REST endpoints, 7 subsystem classes, 252 tests
- Future simulation domain features (Game NPCs, Digital Twins, Training Simulations, etc.) build on this complete foundation
- Dashboard provides operational visibility without requiring API calls for monitoring

## Migration

- `020_relationships.sql` is enterprise-tier and applied automatically on startup for enterprise licenses
- No breaking changes to existing simulation APIs

## Test Coverage

| Component | Tests |
|-----------|-------|
| Relationship graph | 40 |
| Dashboard panel | 20 |
| **Previous** | **192** |
| **Total simulation** | **252** |
