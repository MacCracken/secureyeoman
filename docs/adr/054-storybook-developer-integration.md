# ADR 054: Storybook Developer Integration

**Date:** 2026-02-18
**Status:** Accepted

---

## Context

Phase 16 adds Storybook as a component development environment for dashboard UI components. The Developers section already hosts two subviews — Extensions and Experiments — each gated by a security policy flag (`allowExtensions`, `allowExperiments`). Storybook follows the exact same subview pattern.

The dashboard has no existing component gallery or isolated development environment. Developers working on UI components currently have no way to browse, test, or document them in isolation from the running application.

---

## Decision

Integrate Storybook into the Developers section as a third subview (`storybook` tab), following the identical pattern established by Extensions and Experiments:

1. **`allowStorybook` security policy flag** — defaults to `false`; must be explicitly enabled via Settings > Security > Developers. Stored in `security.policy` table like all other policy flags.

2. **DeveloperPage tab** — a `BookOpen`-icon "Storybook" pill tab is added after Experiments. Renders `<StorybookPage />` when active.

3. **StorybookPage component** — shows a disabled state (ShieldAlert + explanation) when `allowStorybook=false`; shows quick-start instructions, component story cards, and an iframe pointing to `http://localhost:6006` when enabled.

4. **Sidebar filter** — `/developers` nav item remains visible when any of `extensionsEnabled || experimentsEnabled || storybookEnabled` is true.

5. **Storybook runs as a separate dev server** — `npm run storybook` launches `storybook dev -p 6006`; the dashboard provides iframe + launch instructions rather than bundling Storybook into the production build.

6. **devDependencies only** — `@storybook/react-vite` and `storybook` are added as `devDependencies` in `packages/dashboard/package.json`. No runtime dependency is introduced.

---

## Consequences

### Positive
- Developers can browse, test, and document UI components in isolation via Storybook.
- Follows the established subview pattern — no new architectural concepts introduced.
- The `allowStorybook=false` default means the tab is invisible to non-developer users and does not appear in the Sidebar unless explicitly enabled.
- Storybook is a devDependency; production builds are unaffected.

### Negative / Trade-offs
- Storybook requires a separate dev server process (`npm run storybook`). The iframe shows a blank/error state if the server is not running.
- Users must manually start the Storybook server; there is no automatic startup or health check.

---

## Alternatives Considered

### Embed Storybook in the production build
Rejected — Storybook is a development tool; embedding it in production builds would increase bundle size and expose internal component documentation to end users.

### Use a different component explorer (Ladle, Histoire)
Rejected — Storybook has the broadest ecosystem and is the industry standard. The `@storybook/react-vite` framework aligns with the existing Vite build setup.

### No security gate
Rejected — consistent with the Extensions/Experiments pattern; developer tooling should be explicitly opt-in.

---

## Notes

- This ADR does not involve the `metadata` pattern from ADR 053; Storybook is purely a UI integration with no platform adapter or message routing concerns.
- Story files live in `packages/dashboard/src/stories/` and use minimal self-contained components (no external component imports required) to keep stories independent of application state.
