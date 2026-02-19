# ADR 062 — Productivity Integration View & Calendar Consolidation

**Status**: Accepted
**Date**: 2026-02-18

---

## Context

The Connections → Integrations section had a dedicated **Calendar** sub-tab containing only Google Calendar. Separately, productivity-oriented tools (Notion, Linear) lived inside the DevOps tab alongside engineering tools (GitHub, GitLab, Jira, AWS, Azure), and Stripe was also grouped with DevOps despite being a business/payments platform.

This arrangement had two problems:

1. **Calendar as a singleton tab** — a single-platform tab adds navigation overhead without meaningful grouping benefit. Google Calendar is more naturally a productivity tool than a standalone calendar utility.
2. **DevOps over-grouping** — Notion, Linear, Stripe, and Google Calendar share a "productivity workflow" identity that is distinct from DevOps/engineering tooling. Conflating them in one tab made the DevOps tab noisy and misrepresented the nature of those platforms.

---

## Decision

Introduce a dedicated **Productivity** sub-tab within Connections → Integrations and consolidate the relevant platforms there:

| Platform | Previous tab | New tab |
|---|---|---|
| Google Calendar | Calendar | Productivity |
| Notion | DevOps (via `PRODUCTIVITY_PLATFORMS`) | Productivity |
| Stripe | DevOps | Productivity |
| Linear | DevOps (via `PRODUCTIVITY_PLATFORMS`) | Productivity |

The **Calendar** sub-tab is removed entirely. The **DevOps** tab retains only engineering/infrastructure platforms: GitHub, GitLab, Jira, AWS, Azure, Figma, Zapier.

### Tab order (Connections → Integrations)

```
Messaging | Email | Productivity | DevOps | OAuth
```

### Frontend changes (`ConnectionsPage.tsx`)

- `IntegrationSubTab` union: `'calendar'` removed, `'productivity'` added.
- `CALENDAR_PLATFORMS` constant removed; `'googlecalendar'` added to `PRODUCTIVITY_PLATFORMS`.
- `'stripe'` moved from `DEVOPS_PLATFORMS` to `PRODUCTIVITY_PLATFORMS`.
- `unregisteredCalendarPlatforms` variable removed; `unregisteredProductivityPlatforms` added.
- Sub-tab array updated; Calendar render block removed; Productivity render block added (uses `MessagingTab` with `PRODUCTIVITY_PLATFORMS` filter, consistent with all other non-email tabs).
- `subTabMap` (URL `?tab=` param routing): `calendar` entry removed, `productivity` entry added.
- `LayoutGrid` icon (already imported) used for the Productivity tab button.

---

## Consequences

### Positive

- Productivity tools (Notion, Stripe, Linear, Google Calendar) have a home that accurately reflects their shared identity.
- Removing the singleton Calendar tab reduces navigation clutter.
- DevOps tab is cleaner, scoped to engineering/infrastructure platforms only.

### Negative

- Existing deep-links using `?tab=calendar` will no longer match a known sub-tab and will fall back to the default (Messaging). This is acceptable; no external documentation references this URL parameter for Calendar.

### Neutral

- No backend, API, adapter, or database changes — this is a pure dashboard UI reorganisation.
- The `subTabMap` now maps `productivity` for URL param routing, enabling `?tab=productivity` deep-links.

---

## Alternatives Considered

1. **Keep Calendar tab, add Productivity tab** — would leave a singleton tab in place; Productivity would need its own list excluding Google Calendar.
2. **Merge Calendar into DevOps** — incorrect semantic grouping.
3. **Merge everything into a single Integrations list** — removes useful categorisation for users with many integrations configured.
