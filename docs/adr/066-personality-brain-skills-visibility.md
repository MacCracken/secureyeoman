# ADR 066 — Personality Editor: Brain Skills Visibility

**Date**: 2026-02-19
**Status**: Accepted
**Phase**: 20 (UX)

---

## Context

The Personality Editor's Brain section surfaced knowledge entries and external sync configuration, but gave no visibility into which Skills were associated with a given personality. Users had to navigate away to the Skills page and filter manually to find personality-scoped skills.

Additionally, the Brain section layout was suboptimal: the External Knowledge Base block (a top-level integration setting) sat below the knowledge item list and teach form, making it feel like an afterthought rather than a first-class configuration surface.

---

## Decision

### 1. Reorder the Brain section

The new structure within `BrainSection`:

1. **External Knowledge Base** — moved to the top; wrapped in a `border-b` divider to signal it is a peer section, not subordinate to Knowledge.
2. **Knowledge** (collapsible sub-section) — retains the knowledge entry list and Teach form.
3. **Skills** (collapsible sub-section) — new; lists skills whose `personalityId` matches the personality being edited.

### 2. Skills sub-section

- Fetches all skills via `fetchSkills()` and filters client-side by `personalityId`.
- When no skills are associated, shows an empty state with navigable links to the Skills Marketplace, Community tab, and Personal tab — providing clear actionable paths.
- When skills exist, each skill is listed with a pencil Edit button that calls `navigate('/skills', { state: { openSkillId: skill.id } })`.
- When `personalityId === null` (new unsaved personality), shows a "save first" hint instead of the empty state.

### 3. Cross-page navigation via router state

**Sending side** (`PersonalityEditor.tsx`): on Edit click, calls `navigate('/skills', { state: { openSkillId } })`.

**Receiving side** (`SkillsPage.tsx`):

- `SkillsPage.getInitialTab` reads `location.state.initialTab` to support deep-linking to the Community tab from the empty-state link.
- A `useEffect` in `SkillsPage` clears `initialTab` state after reading it (replace + null state) so back-navigation does not re-apply the tab override.
- `MySkillsTab` adds a `useEffect` that watches `location.state.openSkillId`. When skills load and the target skill is found, it calls `startEdit(skill)` then clears the state via `navigate('/skills', { replace: true, state: null })`.

---

## Consequences

- **Unified personality context**: All relevant personality data (knowledge, skills, external sync) is visible from a single editing surface without cross-page navigation.
- **Actionable empty state**: Users are directed to the correct tab to add skills rather than left wondering where to look.
- **Router state as ephemeral signal**: Using `location.state` for cross-page intent is idiomatic with React Router and avoids URL pollution. State is cleared immediately after use to prevent stale UI on re-navigation.
- **Client-side filtering**: Skills are fetched globally and filtered by `personalityId`. This is acceptable given typical skill counts. If scale demands it, a `?personalityId=` API param can be added later.
- **No new API endpoints required**: The feature is entirely composed from existing `GET /soul/skills` and React Router APIs.

---

## Files Changed

- `packages/dashboard/src/components/PersonalityEditor.tsx`
- `packages/dashboard/src/components/SkillsPage.tsx`
- `packages/dashboard/src/components/PersonalityEditor.test.tsx` (new)
- `packages/dashboard/src/components/SkillsPage.test.tsx` (new)
