# ADR 035: Lifecycle Extension Hooks

## Status

Accepted (2026-02-16)

## Context

Customizing SecureYeoman's behavior currently requires modifying core TypeScript code. There is no way for users or third-party developers to inject logic at key lifecycle stages without forking the codebase.

Agent Zero's 24-hook extension system with filesystem-based discovery and numeric ordering demonstrates that a well-designed hook architecture enables deep customization without core modifications.

## Decision

### Dual Extension System

Two complementary mechanisms:

**1. TypeScript Plugin Modules** (deep customization):
- User writes `.ts` or `.js` files dropped into an extensions directory
- Each file exports hook handler functions
- Full access to internal APIs via typed hook signatures
- Loaded at startup, hot-reloadable via dashboard command

**2. EventEmitter + Webhook Emission** (lightweight integrations):
- Every hook point also emits a typed event via Node.js EventEmitter
- External systems subscribe via in-process listeners or outbound webhook POST calls
- Plugin authors can emit custom events through the same bus

### Extension Discovery

```
Built-in:     packages/core/extensions/          (shipped with SecureYeoman)
User:         ~/.secureyeoman/extensions/         (user customizations)
Workspace:    <workspace>/extensions/             (workspace-scoped)
```

**Loading order**: Built-in → User → Workspace. Same-named files in later directories override earlier ones.

**Ordering**: Files are sorted alphabetically. Numeric prefixes control execution order:

```
_10_log_all_llm_calls.ts
_50_custom_memory_filter.ts
_90_slack_notifications.ts
```

### Extension Interface

```typescript
// Extension module exports one or more hook handlers
export interface Extension {
  name: string;
  version?: string;
  hooks: Partial<HookHandlers>;
}

// Each hook has a typed signature
interface HookHandlers {
  // Agent lifecycle
  agent_init: (ctx: AgentInitContext) => Promise<void>;
  agent_shutdown: (ctx: AgentShutdownContext) => Promise<void>;

  // Message loop
  message_loop_start: (ctx: MessageLoopContext) => Promise<void>;
  message_loop_end: (ctx: MessageLoopContext) => Promise<void>;
  prompt_assembly_before: (ctx: PromptContext) => Promise<PromptContext>;
  prompt_assembly_after: (ctx: PromptContext) => Promise<PromptContext>;

  // LLM calls
  before_llm_call: (ctx: LLMCallContext) => Promise<LLMCallContext>;
  after_llm_call: (ctx: LLMResponseContext) => Promise<LLMResponseContext>;
  stream_chunk: (ctx: StreamChunkContext) => Promise<StreamChunkContext>;
  stream_end: (ctx: StreamEndContext) => Promise<void>;

  // Tool execution
  tool_execute_before: (ctx: ToolContext) => Promise<ToolContext | null>;  // null = skip execution
  tool_execute_after: (ctx: ToolResultContext) => Promise<ToolResultContext>;

  // Memory (depends on ADR 031)
  memory_save_before: (ctx: MemorySaveContext) => Promise<MemorySaveContext | null>;
  memory_save_after: (ctx: MemorySavedContext) => Promise<void>;
  memory_recall_before: (ctx: MemoryRecallContext) => Promise<MemoryRecallContext>;

  // Sub-agent delegation (depends on ADR 034)
  delegation_before: (ctx: DelegationContext) => Promise<DelegationContext | null>;
  delegation_after: (ctx: DelegationResultContext) => Promise<void>;
  sub_agent_sealed: (ctx: SubAgentSealedContext) => Promise<void>;

  // Integration messages
  message_received: (ctx: InboundMessageContext) => Promise<InboundMessageContext | null>;
  message_sent: (ctx: OutboundMessageContext) => Promise<void>;
  platform_connected: (ctx: PlatformContext) => Promise<void>;

  // Security
  auth_success: (ctx: AuthContext) => Promise<void>;
  auth_failure: (ctx: AuthFailureContext) => Promise<void>;
  rate_limit_hit: (ctx: RateLimitContext) => Promise<void>;
}
```

### Hook Execution Semantics

- **Transform hooks** (return modified context): `prompt_assembly_before`, `before_llm_call`, `tool_execute_before`, `memory_save_before`, etc. — extensions receive the context and return a (potentially modified) version. Executed in order; each extension receives the output of the previous
- **Observe hooks** (void return): `agent_init`, `message_sent`, `auth_success`, etc. — extensions observe but don't modify. Executed in parallel for performance
- **Veto hooks** (return null to cancel): `tool_execute_before`, `memory_save_before`, `message_received`, `delegation_before` — returning `null` cancels the operation. First veto wins

### ExtensionManager

```typescript
interface ExtensionManager {
  loadExtensions(): Promise<void>;
  reloadExtensions(): Promise<void>;
  getLoadedExtensions(): ExtensionInfo[];

  // Hook execution
  executeTransform<T>(hook: string, context: T): Promise<T>;
  executeObserve(hook: string, context: unknown): Promise<void>;
  executeVeto<T>(hook: string, context: T): Promise<T | null>;

  // Event system
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  emit(event: string, data: unknown): void;

  // Webhook registration
  registerWebhook(hook: string, url: string, secret?: string): void;
  removeWebhook(hook: string, url: string): void;
}
```

### Webhook Dispatch

For each hook point, an optional outbound webhook can be configured:

```yaml
extensions:
  webhooks:
    - hook: auth_failure
      url: https://siem.internal/api/events
      secret: ${WEBHOOK_SECRET}    # HMAC-SHA256 signature in X-Signature header
      timeout: 5000
    - hook: message_received
      url: https://analytics.internal/api/messages
```

Webhook calls are fire-and-forget with configurable timeout. Failures are logged but never block the hook pipeline.

### Configuration

```yaml
extensions:
  enabled: true
  directories:
    - ~/.secureyeoman/extensions
  hotReload: true                  # watch directories for changes
  webhooks: []                     # see above
  maxExecutionTime: 5000           # ms, per extension per hook
  failOpen: true                   # on extension error, continue pipeline (vs fail-closed)
```

## Consequences

### Positive
- Users customize behavior without forking core code
- Typed hook signatures prevent common errors and enable IDE support
- Dual system (plugins + events/webhooks) serves both developers and integrators
- Override semantics allow workspace-specific behavior without affecting global config

### Negative
- 24 hook points add execution overhead to every operation (mitigated by fast no-op checks)
- Extension bugs can affect core behavior (mitigated by `failOpen` and `maxExecutionTime`)
- Hot-reload introduces potential race conditions during reload window
- API surface area increases — hook signatures become a compatibility contract
