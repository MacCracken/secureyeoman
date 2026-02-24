# ADR 117 — QuickBooks Online MCP CLI (`secureyeoman mcp-quickbooks`)

**Date:** 2026-02-23
**Status:** Accepted
**Deciders:** SecureYeoman Core Team

---

## Context

The QuickBooks Online MCP toolset (`qbo_*` tools in `packages/mcp/src/tools/quickbooks-tools.ts`) was implemented and gated by the `MCP_EXPOSE_QUICKBOOKS_TOOLS` environment variable. However, there was no CLI surface for operators to:

- Check whether the toolset is enabled and credentials are present
- Enable or disable the toolset without manually editing `.env`

The roadmap item "YEOMAN MCP show QuickBooks Skills" remained open.

---

## Decision

Add a `secureyeoman mcp-quickbooks` (alias `mcp-qbo`) CLI command with three subcommands:

| Subcommand | Behaviour |
|---|---|
| `status` | Displays `MCP_EXPOSE_QUICKBOOKS_TOOLS` state and checks all five credential vars (`QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REALM_ID`, `QBO_ACCESS_TOKEN`, `QBO_REFRESH_TOKEN`) with present/missing indicators; exits non-zero when tools are enabled but credentials are incomplete |
| `enable` | Prints the environment variables required to enable the toolset (operators copy these into `.env`) |
| `disable` | Shows how to set `MCP_EXPOSE_QUICKBOOKS_TOOLS=false` |

### Rationale

- **No mutation of env files** — modifying `.env` programmatically risks corrupting other settings. The CLI acts as an inspector and guide, not a writer.
- **Credential completeness check** — the most common mistake is enabling the toolset without all credentials present. `status` catches this and exits non-zero so CI can detect it.
- **Alias `mcp-qbo`** — shorter form for interactive use.

---

## Files Changed

- `packages/core/src/cli/commands/mcp-quickbooks.ts` — command implementation
- `packages/core/src/cli.ts` — registration

---

## Consequences

- Operators can verify QuickBooks integration state without inspecting environment files
- Enables scripted health checks (`secureyeoman mcp-quickbooks status || exit 1`)
- No persistent state changes are made by the CLI; toggling the feature still requires env var changes and a server restart
