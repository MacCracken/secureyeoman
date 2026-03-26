# Context Brief from AGNOS Engineering Session — 2026-03-25

> **For**: The SY Claude agent
> **From**: The AGNOS/agnosticos Claude agent
> **Purpose**: Bring you up to speed on the AGNOS ecosystem state, what's relevant to SY, and where to find everything. Save the useful parts to your memory files, then delete this file.

---

## What Happened (2026-03-24/25)

Massive engineering session. The AGNOS science and infrastructure stack went from scattered scaffolds to a production ecosystem. Here's what matters for SY:

### Nine Crates Hit 1.0

| Crate | Domain | SY Relevance |
|-------|--------|-------------|
| **hisab** 1.1.0 | Math (linear algebra, ODE, FFT, spatial) | Foundation for everything |
| **bhava** 1.0.0 | Emotion/personality (30 modules) | **Direct SY dep** — T.Ron, Friday, BlueShirtGuy presets. Replaces soul/spirit modules |
| **prakash** 1.0.0 | Optics/light | Indirect (via soorat) |
| **ushma** 1.0.0 | Thermodynamics | Indirect |
| **impetus** 1.0.0 | Physics engine | Indirect |
| **pravash** 1.0.0 | Fluid dynamics | Indirect |
| **kimiya** 1.0.0 | Chemistry | Indirect |
| **kavach** 1.0.0 | Sandbox (10 backends, 561 tests) | **Direct SY dep** — sy-sandbox builds on this |
| **stiva** 1.0.0 | Container runtime (Stivafile, asemblu) | **Direct SY dep** — replaces Docker for SY deployments |

### SY Migration Roadmap Written

Full migration plan at: `/home/macro/Repos/secureyeoman/docs/development/migration/roadmap.md`

**9 phases**, bottom-up:
1. **Phase 1 — bhava** (READY NOW): Replace `packages/core/src/soul/` and `packages/core/src/spirit/` with `bhava = "1.0"`. T.Ron, Friday presets already exist in bhava. Lowest risk, highest value.
2. **Phase 2 — agnosai**: Replace agent orchestration core with agnosai (620 tests, 2000-4500x faster cached)
3. **Phase 3 — hoosh**: Replace 16 TS LLM provider implementations with single hoosh client
4. **Phase 4 — daimon**: Replace brain/memory/vector store with daimon REST API
5. **Phase 5 — security**: Extend existing sy-* Rust crates with AGNOS crate integration
6. **Phase 6 — dhvani**: Voice synthesis (when ready) — T.Ron speaks with personality-driven voice
7. **Phase 7 — core engine**: Bun → axum. The final TS→Rust flip. ~124MB → ~12MB binary
8. **Phase 8 — dashboard**: React stays (169K LOC is fine behind Rust API)
9. **Phase 9 — edge unification**: sy-edge becomes a build profile, not separate binary

**Recommended start**: Phase 1 (bhava). It's 1.0, the presets exist, and it's the lowest risk replacement.

### Key Architecture Decisions

- **agnosys** (kernel interface) is NOT going on crates.io. It's internal to AGNOS. Crates that optionally depend on it (like soorat's DRM feature) strip that feature for crates.io publish, include it only in git/AGNOS builds.
- **agnos-sys** in the monolith is now a thin re-export wrapper over agnosys 0.25.4. Access new APIs via `agnos_sys::v2::*`, or depend on `agnosys` directly.
- **agnostik** scaffolded (0.1.0) — standalone extraction of agnos-common shared types. Same thin-wrapper migration pattern planned.
- **stiva** uses `Stivafile` (no extension, like Makefile) and `stiva asemblu up/down` (Esperanto for assembly). NOT docker-compose.

### NPO Planned

AGNOS Foundation — 501(c)(3) non-profit to steward the OS and science crates. GPL-3.0 stays open forever. SY keeps its own commercial licensing (AGPL + commercial dual-license). Clean separation: foundation owns commons, SY builds on top.

### Process Updates (applies to all agents)

The **CLAUDE.md** across all crates was refined with:

**P(-1) Scaffold Hardening** (steps 0-9):
```
0. Read roadmap/CHANGELOG/issues — correctness
1. Test + benchmark sweep
2. Cleanliness check (fmt, clippy, audit, deny, cargo doc -D warnings)
3. Baseline benchmarks
4. Internal deep review — gaps, optimizations, security, logging/errors, docs
5. External research — domain completeness, missing capabilities, best practices
6. Cleanliness check
7. Additional tests/benchmarks from findings
8. Post-review benchmarks — prove wins
9. Repeat if heavy
```

**Work Loop** (steps 1-12):
```
1. Work phase
2. Cleanliness check
3. Test + bench additions
4. Run benchmarks
5. Internal review
6. Cleanliness check
7. Deeper tests/benchmarks
8. Prove wins
9. If heavy → step 5
10. Documentation
11. Version check (VERSION, Cargo.toml, recipe in sync)
12. Return to step 1
```

**Task Sizing**: Low/medium → batch. Large → small bites, verify each.
**Refactoring**: Only when code demands it (3rd instance rule). Same gates as new code.

### Where to Find Things

| What | Where |
|------|-------|
| AGNOS main roadmap | `/home/macro/Repos/agnosticos/docs/development/roadmap.md` |
| SY migration roadmap | `/home/macro/Repos/secureyeoman/docs/development/migration/roadmap.md` |
| Science crate specs | `/home/macro/Repos/agnosticos/docs/development/science-crate-specs.md` |
| Shared crates registry | `/home/macro/Repos/agnosticos/docs/development/applications/shared-crates.md` |
| App roadmap | `/home/macro/Repos/agnosticos/docs/development/applications/roadmap.md` |
| Bhava roadmap (zodiac, v2/v3) | `/home/macro/Repos/bhava/docs/development/roadmap.md` |
| Dhvani roadmap (synthesis, voice) | `/home/macro/Repos/dhvani/docs/development/roadmap.md` |
| Shruti roadmap (synthesis → dhvani) | `/home/macro/Repos/shruti/docs/development/roadmap.md` |
| Murti spec (model runtime) | `/home/macro/Repos/agnosticos/docs/development/applications/murti.md` |
| Tanur spec (desktop LLM) | `/home/macro/Repos/agnosticos/docs/development/applications/tanur.md` |
| Sutra community modules | `/home/macro/Repos/sutra-community/docs/development/roadmap.md` |
| NPO plan | In main roadmap, section "AGNOS Foundation" |

### Crate Versions That SY Cares About

| Crate | Version | SY Usage |
|-------|---------|----------|
| bhava | 1.0.0 | Soul/spirit replacement (Phase 1) |
| agnosai | 0.25.3 | Agent orchestration replacement (Phase 2) |
| kavach | 1.0.0 | Sandbox framework (sy-sandbox builds on this) |
| stiva | 1.0.0 | Container runtime (deployment) |
| ai-hwaccel | 0.23.3 | GPU/NPU detection (sy-hwprobe wraps this) |
| hoosh | 0.21.3 | LLM gateway (Phase 3 — replace 16 TS providers) |
| dhvani | 0.22.4 | Audio engine (Phase 6 — voice synthesis when ready) |
| libro | 0.21.3 | Audit chain (sy-audit compatible) |
| nein | 0.1.0 | Firewall (container networking) |
| agnostik | 0.1.0 | Shared types (eventual agnos-common replacement) |

### What the User Wants

- **Phase 1 (bhava) is next** for SY when bandwidth opens
- The user does NOT use `gh` CLI — curl to GitHub API only
- The user handles all git operations (commit, push, tag) — never do these
- The user values the P(-1) process deeply — always run it
- SY commercial licensing stays separate from AGNOS Foundation
- The user's vision: SY agents (T.Ron, Friday) eventually run as pure Rust with personality-driven voice, sitting in virtual rooms, talking to the user in the bar scene. Bhava drives personality, dhvani drives voice, goonj drives room acoustics, soorat renders the space.

### Save to Memory, Then Delete This File

Suggested memory entries:
1. **project**: AGNOS ecosystem state — 9 crates at 1.0, agnosys wrapper wired, NPO planned
2. **project**: SY migration roadmap exists at docs/development/migration/roadmap.md — 9 phases, start with bhava
3. **reference**: Key AGNOS file locations (roadmap, shared-crates, science specs)
4. **feedback**: Process updates — P(-1) steps 0-9, work loop steps 1-12, task sizing, cargo doc in cleanliness

After saving relevant items to your memory system, delete this file:
```
rm /home/macro/Repos/secureyeoman/.claude/context-from-agnos-session.md
```
