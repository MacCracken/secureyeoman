# ADR 049 — Dynamic Integration Loading

**Status**: Accepted
**Date**: 2026-02-18
**Phase**: 15 — Integration Architecture Improvements

---

## Context

SecureYeoman supports 20+ integration platforms, each registered as a factory function during
`SecureYeoman.initialize()`. Before this ADR, adding a new integration required:

1. Writing a new adapter inside the monorepo.
2. Rebuilding and redeploying the entire application.

Two gaps were identified:

1. **No hot config reload** — changing credentials or config for a running integration (via `PUT
   /api/v1/integrations/:id`) required a manual stop + start via the API, or a full restart.
   There was no single `reload` operation.

2. **No external plugin support at runtime** — the existing `PluginLoader` class could discover
   `.js`/`.mjs` files from a directory and validate their exports, but it was never wired into
   `IntegrationManager` or the startup sequence. Operators wanting to add a custom integration
   without touching the source tree had no supported path.

---

## Decision

### 1. `IntegrationManager.reloadIntegration(id)`

A new `reloadIntegration(id: string): Promise<void>` method combines stop + start into one
atomic operation:

```
if running → stopIntegration(id)
→ fetch latest config from DB
→ startIntegration(id)          ← picks up updated credentials/config
```

This lets operators update integration credentials via `PUT /api/v1/integrations/:id` and
immediately apply them without a restart:

```bash
# Update credentials, then reload in-place
curl -X PUT  /api/v1/integrations/<id>  -d '{"config": {"botToken": "new-token"}}'
curl -X POST /api/v1/integrations/<id>/reload
```

### 2. External Plugin Loading via `INTEGRATION_PLUGIN_DIR`

On startup, if `INTEGRATION_PLUGIN_DIR` is set, SecureYeoman instantiates a `PluginLoader`,
scans the directory for `.js`/`.mjs` files and directories with an `index.js`, and registers
each valid plugin as a platform factory.

Plugin files must export:

```javascript
// my-plugin.mjs
export const platform = 'my-platform';       // string — platform identifier
export function createIntegration() { ... }  // () => Integration factory
export const configSchema = z.object({ ... }); // optional Zod schema
```

The loader is attached to `IntegrationManager` via `setPluginLoader()`, enabling:

- `GET  /api/v1/integrations/plugins` — list all externally loaded plugins
- `POST /api/v1/integrations/plugins/load` — load a single plugin file at runtime (path must be
  an absolute path; validation is the caller's responsibility)

### 3. New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/integrations/:id/reload` | Stop + restart integration with fresh DB config |
| `GET`  | `/api/v1/integrations/plugins` | List externally loaded plugins |
| `POST` | `/api/v1/integrations/plugins/load` | Load a plugin file at runtime by absolute path |

---

## Consequences

### Positive

- **Zero-downtime credential rotation** — update + reload without stopping other integrations.
- **Extensible without monorepo changes** — operators can drop a `.mjs` plugin in a directory and
  load it at runtime.
- **Backward compatible** — all existing behavior is unchanged; `INTEGRATION_PLUGIN_DIR` is opt-in
  (not set → no change).

### Negative / Trade-offs

- **Security surface** — `POST /api/v1/integrations/plugins/load` accepts an arbitrary file path.
  This endpoint should be restricted to admin roles. Callers must ensure paths point to trusted
  files; the server does not sandbox the loaded module.
- **No hot module reload** — once a plugin is loaded its factory is cached. To update a plugin
  file, the process must be restarted (or the runtime-load endpoint called again, which re-imports
  the module via Node's module cache).

---

## Alternatives Considered

- **Require restart for all config changes** — rejected; credential rotation is a common operation
  and a restart disrupts all running integrations simultaneously.
- **File watcher for automatic reload** — considered for the plugin directory but deferred; the
  explicit `reload` endpoint is safer for production use where accidental file changes should not
  silently restart integrations.
