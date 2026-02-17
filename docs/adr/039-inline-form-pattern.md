# ADR 039: Inline Form Pattern for Dashboard Feature Pages

## Status

Implemented

## Context

Dashboard feature pages (Sub-Agents, Extensions, A2A Protocol) used modal popup dialogs (`fixed inset-0 bg-black/50`) for creating new items. These modals:

- Obscured the page content, requiring users to dismiss before seeing the result
- Created a separate visual layer (z-50 overlay) breaking the flow of the page
- Used manual `setSubmitting` state management instead of React Query's `useMutation` lifecycle
- Were inconsistent with the ExperimentsPage which already used an inline collapsible card form

## Decision

Replace all modal popup dialogs with **inline collapsible card forms** that appear directly in the page flow, toggled by action buttons. This follows the pattern already established by ExperimentsPage.

### Pattern

Each inline form follows this structure:

1. **Toggle button** in the page header or tab area opens/closes via a `showForm` boolean state
2. **Card container** with `className="card p-4 space-y-3"` renders in normal page flow
3. **Header row** with title + X close button (`btn-ghost p-1 rounded`)
4. **Inputs** use `className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"`
5. **Submit button** uses `btn btn-primary`, disabled when invalid or `mutation.isPending`
6. **State management** via `useMutation` with `onSuccess` that clears form fields and closes the card

### Pages Affected

| Page | Dialogs Replaced | Inline Forms Added |
|------|-----------------|-------------------|
| SubAgentsPage | DelegateDialog, NewProfileDialog | Delegate Task (below header), New Profile (in Profiles tab) |
| ExtensionsPage | RegisterExtensionDialog, RegisterHookDialog, RegisterWebhookDialog | Register forms in each tab |
| A2APage | AddPeerDialog, DelegateTaskDialog | Add Peer (in Peers tab), Delegate Task (below header) |
| CodeExecutionPage | — (already inline) | No changes |

### Benefits Over Modals

- Form and results visible simultaneously — no need to dismiss overlay to see created item
- Simpler component architecture — no separate dialog components, state lives in the tab/page
- Consistent with ExperimentsPage pattern
- `useMutation` handles loading/error state automatically instead of manual try/finally

## Consequences

### Positive
- Unified UX pattern across all dashboard feature pages
- Reduced component count (7 dialog components removed)
- Better `useMutation` integration for error handling (`onError` sets error state)
- Form fields visible in context of the data they create

### Negative
- Inline forms push page content down when opened (acceptable tradeoff vs. overlay)
- Long forms (e.g., New Profile with 4 fields) take more vertical space in the page flow
