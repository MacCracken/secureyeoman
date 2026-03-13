# Simulation Engine

Run controlled agent simulations with configurable time, emotion models, spatial awareness, entity relationships, and automated experimentation.

## Overview

The Simulation Engine provides an enterprise-tier framework for testing agent behaviour under realistic conditions. It combines a tick-driven execution loop, an emotion and mood model based on Russell's circumplex, a 3D spatial and proximity engine, a persistent entity relationship graph, and an experiment runner that uses the autoresearch pattern to automatically discover optimal configurations.

All simulation data is persisted in the `simulation` PostgreSQL schema across 10 tables (migrations 018, 019, and 020). The 43+ REST endpoints live under `/api/v1/simulation/` and require an enterprise license with the `simulation` feature enabled.

A **dashboard panel** at `/simulation` provides real-time monitoring of all subsystems.

## Tick Driver

The tick driver controls simulation time. Each tick advances the simulation state, triggers mood decay, processes spatial events, evaluates proximity rules, and decays relationship scores.

### Modes

| Mode | Description |
|------|-------------|
| `realtime` | Ticks fire at wall-clock intervals (e.g. once per second) |
| `accelerated` | Ticks fire at a configurable multiplier of real time |
| `turn_based` | Ticks advance only on explicit API calls |

### Per-Personality Configuration

Each personality can have its own tick config controlling tick interval, time scale, and mode:

```bash
curl -X POST http://localhost:3000/api/v1/simulation/tick/agent-alpha \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "accelerated",
    "tickIntervalMs": 200,
    "timeScale": 5.0
  }'
```

### Pause, Resume, Advance

```bash
curl -X POST http://localhost:3000/api/v1/simulation/tick/agent-alpha/pause
curl -X POST http://localhost:3000/api/v1/simulation/tick/agent-alpha/resume
curl -X POST http://localhost:3000/api/v1/simulation/tick/agent-alpha/advance
```

## Mood Engine

The mood engine models agent emotional state using Russell's circumplex model, mapping mood to two continuous dimensions: **valence** (negative to positive, -1 to 1) and **arousal** (calm to excited, 0 to 1).

### Mood Labels

The engine classifies the valence/arousal pair into one of 10 discrete labels: `ecstatic`, `excited`, `happy`, `content`, `calm`, `neutral`, `melancholy`, `sad`, `angry`, `anxious`.

### Personality Trait Modifiers

12 personality traits influence baseline mood: `cheerful`, `serious`, `energetic`, `calm`, `empathetic`, `analytical`, `playful`, `reserved`, `passionate`, `stoic`, `anxious`, `confident`. Each trait shifts the baseline valence and arousal values.

### Mood Events and Decay

External events shift the mood state. Between events, mood decays exponentially back toward the personality's baseline:

```bash
# Push a mood event
curl -X POST http://localhost:3000/api/v1/personalities/agent-alpha/mood/event \
  -H 'Content-Type: application/json' \
  -d '{
    "eventType": "positive_feedback",
    "valenceDelta": 0.3,
    "arousalDelta": 0.1,
    "source": "user"
  }'

# Read current mood state
curl http://localhost:3000/api/v1/personalities/agent-alpha/mood

# Reset to baseline
curl -X POST http://localhost:3000/api/v1/personalities/agent-alpha/mood/reset
```

## Spatial Engine

The spatial engine tracks entity positions in 3D space, manages named zones with bounding boxes, and evaluates proximity rules to fire events when spatial conditions are met.

### Entity Locations

```bash
curl -X POST http://localhost:3000/api/v1/simulation/spatial/agent-alpha/entities \
  -H 'Content-Type: application/json' \
  -d '{
    "entityId": "npc-bob",
    "entityType": "npc",
    "zoneId": "town-square",
    "x": 10.0, "y": 20.0, "z": 0.0,
    "heading": 90, "speed": 1.5
  }'
```

### Zones

Named bounding-box regions:

```bash
curl -X POST http://localhost:3000/api/v1/simulation/spatial/agent-alpha/zones \
  -H 'Content-Type: application/json' \
  -d '{
    "zoneId": "war-room",
    "name": "War Room",
    "minX": -50, "minY": -50,
    "maxX": 50, "maxY": 50
  }'
```

### Proximity Rules

6 trigger types govern spatial events:

| Trigger | Fires when... |
|---------|---------------|
| `enter_radius` | An entity moves within a specified distance of a point or entity |
| `leave_radius` | An entity moves beyond a specified distance |
| `enter_zone` | An entity enters a named zone |
| `leave_zone` | An entity exits a named zone |
| `approach` | Two entities move closer than a threshold distance |
| `depart` | Two entities move farther apart than a threshold distance |

## Entity Relationship Graph

The relationship graph tracks persistent inter-entity relationships with affinity scores (-1 to 1), trust levels (0 to 1), and interaction counts. Relationships decay toward neutral over time via the tick handler.

### Relationship Types

8 built-in types: `ally`, `rival`, `neutral`, `mentor`, `student`, `trade_partner`, `family`, `custom`.

### CRUD

```bash
# Create a relationship
curl -X POST http://localhost:3000/api/v1/simulation/relationships/agent-alpha \
  -H 'Content-Type: application/json' \
  -d '{
    "sourceEntityId": "npc-bob",
    "targetEntityId": "npc-alice",
    "type": "ally",
    "affinity": 0.5,
    "trust": 0.7
  }'

# List relationships (optional filters: entityId, type, minAffinity)
curl "http://localhost:3000/api/v1/simulation/relationships/agent-alpha?entityId=npc-bob"

# Get specific relationship
curl http://localhost:3000/api/v1/simulation/relationships/agent-alpha/npc-bob/npc-alice

# Update relationship
curl -X PUT http://localhost:3000/api/v1/simulation/relationships/agent-alpha/npc-bob/npc-alice \
  -H 'Content-Type: application/json' \
  -d '{ "affinity": 0.8 }'
```

### Interaction Events

Recording an interaction auto-adjusts affinity and trust. If the relationship doesn't exist, it's created automatically. Interactions can optionally trigger mood effects.

```bash
curl -X POST http://localhost:3000/api/v1/simulation/relationships/agent-alpha/interact \
  -H 'Content-Type: application/json' \
  -d '{
    "sourceEntityId": "npc-bob",
    "targetEntityId": "npc-alice",
    "eventType": "helped_in_combat",
    "affinityDelta": 0.3,
    "trustDelta": 0.15,
    "moodEffect": { "valenceDelta": 0.2, "arousalDelta": 0.1 }
  }'
```

### Groups

Manage named entity groups with membership:

```bash
# Create group
curl -X POST http://localhost:3000/api/v1/simulation/groups/agent-alpha \
  -H 'Content-Type: application/json' \
  -d '{ "groupId": "faction-a", "name": "Faction Alpha", "members": ["npc-bob", "npc-alice"] }'

# Add member
curl -X POST http://localhost:3000/api/v1/simulation/groups/agent-alpha/faction-a/members \
  -H 'Content-Type: application/json' \
  -d '{ "entityId": "npc-charlie" }'

# List members
curl http://localhost:3000/api/v1/simulation/groups/agent-alpha/faction-a/members
```

### Relationship Decay

The tick handler decays relationships toward neutral each tick:
- Affinity decays toward 0
- Trust decays toward 0.5
- Configurable `decayRate` per relationship (default 0.01)

## Experiment Runner (Autoresearch)

The experiment runner applies the autoresearch pattern to simulation parameters. Given a fixed compute budget, it runs a series of experiments that each modify a single variable, measure a target metric, and retain or discard the change based on whether it improved the metric.

The winning configuration is promoted as the new baseline, and the cycle repeats until the budget is exhausted or the metric converges.

### Training Executor

The training executor bridges the experiment runner to the training infrastructure, enabling automatic LoRA/QLoRA fine-tuning runs driven by simulation results.

```bash
# Create an experiment session
curl -X POST http://localhost:3000/api/v1/simulation/experiments/agent-alpha/sessions \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "mood-decay-optimization",
    "objective": "Find optimal decay rate for mood stability",
    "metricName": "mood_stability_score",
    "baselineParams": { "decayRate": 0.05 }
  }'
```

### Domain Integrations

Three subsystems use the experiment runner for iterative optimization:

| Domain | File | Purpose |
|--------|------|---------|
| Hyperparameter search | `training/hyperparam-autoresearch.ts` | HP space narrowing + convergence detection |
| Chaos engineering | `chaos/chaos-autoresearch.ts` | Resilience improvement with fault escalation |
| Circuit breaker tuning | `resilience/circuit-breaker-autotuner.ts` | Threshold/timeout optimization |

## Dashboard Panel

The simulation dashboard (`/simulation` in the UI) provides real-time monitoring across all subsystems:

- **Tick Driver tab**: Current tick count, mode, time scale, paused state. Controls to play/pause/advance/stop.
- **Mood tab**: Valence and arousal progress bars, mood label badge, event submission form, reset control, event history.
- **Spatial tab**: Entity table with positions, zone grid with bounding boxes.
- **Relationships tab**: Relationship table with affinity/trust bars, interaction counts. Group grid with member lists.

Enable the simulation sidebar item via `allowSimulation: true` in the security policy.

## REST API Overview

All 43+ endpoints are under `/api/v1/simulation/` (and `/api/v1/personalities/`). Key groups:

| Prefix | Operations |
|--------|------------|
| `/simulation/tick/:personalityId` | CRUD + lifecycle (pause/resume/advance) |
| `/personalities/:id/mood` | Mood state, events, history, reset |
| `/simulation/spatial/:personalityId/entities` | Entity location CRUD |
| `/simulation/spatial/:personalityId/zones` | Spatial zone CRUD |
| `/simulation/spatial/:personalityId/rules` | Proximity rule CRUD |
| `/simulation/spatial/:personalityId/proximity` | Proximity event history |
| `/simulation/relationships/:personalityId` | Relationship CRUD + interactions + events |
| `/simulation/groups/:personalityId` | Group CRUD + member management |
| `/simulation/experiments/:personalityId/sessions` | Experiment session management |

## Database Schema

| Migration | Tables |
|-----------|--------|
| `018_simulation.sql` | `tick_configs`, `mood_states`, `mood_events` |
| `019_spatial.sql` | `entity_locations`, `spatial_zones`, `proximity_rules`, `proximity_events` |
| `020_relationships.sql` | `entity_relationships`, `relationship_events`, `entity_groups` |

## License Requirement

The simulation engine requires an **enterprise** license with the `simulation` feature. All routes return `403` if the license check fails. See the [Licensing guide](./licensing.md) for details on tier management.
