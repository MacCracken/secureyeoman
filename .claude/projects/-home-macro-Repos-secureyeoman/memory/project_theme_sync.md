---
name: Theme sync behavior
description: Marketplace themes don't require sync; community themes do require sync
type: project
---

Marketplace themes do not require a sync — they are available directly.
Community themes DO require a sync step.

**Why:** Different distribution mechanisms — marketplace is served directly, community repo needs to be fetched/synced first.
**How to apply:** When working on theme-related features, don't add sync logic for marketplace themes. Only community themes need sync workflows.
