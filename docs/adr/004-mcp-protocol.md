# ADR 004: MCP Protocol Support

## Status

Accepted

## Context

F.R.I.D.A.Y. needs to interoperate with external tools and expose its own skills to other systems. The Model Context Protocol (MCP) provides a standardized interface for AI systems to share tools and resources across boundaries.

## Decision

Implement bidirectional MCP protocol support with two components:

1. **McpClientManager** — Connects to external MCP servers, discovers tools/resources, and makes them available to F.R.I.D.A.Y.'s AI workflows
2. **McpServer** — Exposes F.R.I.D.A.Y.'s skills as MCP tools and knowledge as MCP resources, allowing external systems to leverage the agent

### Implementation

- SQLite storage for MCP server configurations (URL, auth, enabled state, metadata)
- REST API under `/api/v1/mcp/` for CRUD + start/stop/list-tools/list-resources
- Config schema: `mcp.enabled`, `mcp.serverPort`, `mcp.exposeSkillsAsTools`, `mcp.exposeKnowledgeAsResources`
- Client-side manager maintains WebSocket connections to external servers, handles reconnection and tool invocation routing
- Server-side exposes JSON-RPC 2.0 endpoint with dynamic tool discovery from `BrainManager.listSkills()`
- RBAC enforced on all MCP endpoints; tool invocations inherit invoking user's permissions

## Consequences

- F.R.I.D.A.Y. can leverage external tools (e.g., search engines, code interpreters, databases) via MCP
- External systems can invoke F.R.I.D.A.Y.'s skills programmatically without re-implementing logic
- MCP server adds a new attack surface — requires authentication and rate limiting on the exposed port
- SQLite schema extended with `mcp_servers` table
