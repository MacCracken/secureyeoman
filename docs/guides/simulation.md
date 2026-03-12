# Simulation Engine

Run controlled agent simulations with configurable time, emotion models, spatial awareness, and automated experimentation.

## Overview

The Simulation Engine provides an enterprise-tier framework for testing agent behaviour under realistic conditions. It combines a tick-driven execution loop, an emotion and mood model based on Russell's circumplex, a 3D spatial and proximity engine, and an experiment runner that uses the autoresearch pattern to automatically discover optimal configurations.

All simulation data is persisted in the `simulation` PostgreSQL schema across 7 tables (migrations 018 and 019). The 29 REST endpoints live under `/api/v1/simulation/` and require an enterprise license with the `simulation` feature enabled.

## Tick Driver

The tick driver controls simulation time. Each tick advances the simulation state, triggers mood decay, processes spatial events, and evaluates proximity rules.

### Modes

| Mode | Description |
|------|-------------|
| `realtime` | Ticks fire at wall-clock intervals (e.g. once per second) |
| `accelerated` | Ticks fire at a configurable multiplier of real time |
| `turn_based` | Ticks advance only on explicit API calls |

### Per-Personality Configuration

Each personality can have its own tick config controlling tick interval, active hours, and processing priority:

```bash
curl -X POST http://localhost:3000/api/v1/simulation/tick-configs \
  -H 'Content-Type: application/json' \
  -d '{
    "personalityId": "agent-alpha",
    "mode": "accelerated",
    "tickIntervalMs": 200,
    "timeMultiplier": 5.0
  }'
```

### Pause and Resume

```bash
curl -X POST http://localhost:3000/api/v1/simulation/pause
curl -X POST http://localhost:3000/api/v1/simulation/resume
```

## Mood Engine

The mood engine models agent emotional state using Russell's circumplex model, mapping mood to two continuous dimensions: **valence** (negative to positive) and **arousal** (calm to excited).

### Mood Labels

The engine classifies the valence/arousal pair into one of 10 discrete labels: `neutral`, `happy`, `excited`, `alert`, `tense`, `angry`, `sad`, `bored`, `calm`, `relaxed`.

### Personality Trait Modifiers

12 personality traits influence how mood responds to events. Traits like `resilience` accelerate recovery toward baseline, while `volatility` amplifies mood swings. Each trait is a float in the range [0, 1].

### Mood Events and Decay

External events shift the mood state. Between events, mood decays exponentially back toward the personality's baseline:

```bash
# Push a mood event
curl -X POST http://localhost:3000/api/v1/simulation/mood-events \
  -H 'Content-Type: application/json' \
  -d '{
    "personalityId": "agent-alpha",
    "eventType": "positive_feedback",
    "valenceShift": 0.3,
    "arousalShift": 0.1
  }'

# Read current mood state
curl http://localhost:3000/api/v1/simulation/mood-states/agent-alpha
```

## Spatial Engine

The spatial engine tracks agent positions in 3D space, manages named zones, and evaluates proximity rules to fire events when spatial conditions are met.

### Zones

Zones are named regions (spherical or box-shaped) that can trigger events when agents enter or leave:

```bash
curl -X POST http://localhost:3000/api/v1/simulation/zones \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "war-room",
    "shape": "sphere",
    "center": { "x": 0, "y": 0, "z": 0 },
    "radius": 50
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

## Experiment Runner (Autoresearch)

The experiment runner applies the autoresearch pattern to simulation parameters. Given a fixed compute budget, it runs a series of experiments that each modify a single variable, measure a target metric, and retain or discard the change based on whether it improved the metric.

The winning configuration is promoted as the new baseline, and the cycle repeats until the budget is exhausted or the metric converges.

### Training Executor

The training executor bridges the experiment runner to the training infrastructure, enabling automatic LoRA/QLoRA fine-tuning runs driven by simulation results. Experiment outcomes feed directly into training job parameters.

```bash
# Start an experiment sweep
curl -X POST http://localhost:3000/api/v1/simulation/experiments \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "mood-decay-optimization",
    "scope": "mood_decay_rate",
    "metric": "mood_stability_score",
    "budget": 20,
    "baselineConfig": { "decayRate": 0.05 },
    "searchRange": { "min": 0.01, "max": 0.2 }
  }'
```

## REST API Overview

All 29 endpoints are under `/api/v1/simulation/`. Key groups:

| Prefix | Operations |
|--------|------------|
| `/tick-configs` | CRUD for per-personality tick configuration |
| `/pause`, `/resume`, `/tick` | Simulation lifecycle control |
| `/mood-states` | Read current mood per personality |
| `/mood-events` | Push mood-shifting events |
| `/zones` | CRUD for spatial zones |
| `/locations` | Update and query entity positions |
| `/proximity-rules` | CRUD for proximity trigger rules |
| `/proximity-events` | Query fired proximity events |
| `/experiments` | Create, run, and inspect experiment sweeps |

## License Requirement

The simulation engine requires an **enterprise** license with the `simulation` feature. All routes return `403` if the license check fails. See the [Licensing guide](./licensing.md) for details on tier management.
