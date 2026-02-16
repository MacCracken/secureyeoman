# ADR 036: Sandboxed Code Execution Tool

## Status

Proposed

## Context

FRIDAY can orchestrate tasks through pre-built tools and MCP, but cannot dynamically write and execute code to solve novel problems. When the agent encounters a task that doesn't map to an existing tool — data transformation, custom API interaction, mathematical computation — it has no recourse.

Agent Zero demonstrates that code execution (Python, Node.js, shell) with persistent sessions dramatically expands agent autonomy. FRIDAY already has production-grade sandbox infrastructure (Landlock, seccomp-bpf, macOS sandbox) that can contain code execution safely.

## Decision

### Always-On Sandbox

Code execution always runs within the existing sandbox infrastructure — this is not configurable. The sandbox configuration from `security.sandbox` applies to all code execution:

- **Linux**: Landlock filesystem restrictions + seccomp-bpf syscall filtering
- **macOS**: `sandbox-exec` with deny-default policy
- **Resource limits**: Memory, CPU, file size limits from existing sandbox config

### Two-Level Opt-In

The agent's ability to *generate and execute* code is controlled by two toggles:

```yaml
security:
  codeExecution:
    enabled: false              # master switch, admin-only
    autoApprove: false          # skip per-execution approval
    allowedRuntimes:
      - python
      - nodejs
      - shell
    maxExecutionTime: 180000    # 180 seconds
    maxOutputSize: 1048576      # 1 MB
    maxConcurrentSessions: 5
    persistentSessions: true
```

**`enabled: false` (default)**: The `execute_code` tool is not registered. The agent cannot generate or run code. The Soul/personality system does not include code execution in its capabilities.

**`enabled: true, autoApprove: false`**: The agent can propose code, but every execution triggers a dashboard approval prompt:

```
┌─────────────────────────────────────────────┐
│  Code Execution Request                      │
│                                              │
│  Runtime: python                             │
│  Session: session-abc123                     │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ import requests                        │  │
│  │ resp = requests.get("https://...")      │  │
│  │ data = resp.json()                     │  │
│  │ print(len(data["results"]))            │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  [Approve]  [Deny]  [Approve & Trust Session]│
└─────────────────────────────────────────────┘
```

"Approve & Trust Session" auto-approves subsequent executions within the same session (same conversation, same runtime).

**`enabled: true, autoApprove: true`**: Executions proceed without prompting. For trusted/automated environments.

### Multi-Runtime Support

**Python**:
- Spawned as a child process with `--isolated` flag
- Persistent via long-lived REPL process (stdin/stdout pipe)
- Pre-installed packages configurable in sandbox allowlist

**Node.js**:
- Executed via `isolated-vm` for V8-level isolation
- Separate heap with configurable memory limit
- Module imports restricted to allowlist

**Shell**:
- Bash subprocess within sandbox
- Persistent session via pseudo-TTY wrapper (like Agent Zero's ShellWrap)
- Interactive prompt detection for Y/N dialogs

### Persistent Session Manager

Sessions survive across tool calls within a conversation:

```typescript
interface SessionManager {
  getOrCreate(conversationId: string, runtime: Runtime): Promise<Session>;
  execute(sessionId: string, code: string): Promise<ExecutionResult>;
  listSessions(conversationId?: string): Session[];
  killSession(sessionId: string): Promise<void>;
  cleanup(conversationId: string): Promise<void>;  // called on conversation end
}

interface Session {
  id: string;
  conversationId: string;
  runtime: Runtime;
  state: 'idle' | 'executing' | 'terminated';
  createdAt: Date;
  lastUsedAt: Date;
  executionCount: number;
  totalTokens: number;       // token cost of code generation
  trusted: boolean;          // "Approve & Trust Session" flag
}

interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;        // output exceeded maxOutputSize
  duration: number;
}
```

### Streaming Secrets Filter

All code execution output passes through a streaming-aware secrets filter before reaching the dashboard or logs:

- Buffers output in 256-byte windows to detect partial secret matches
- Masks matches with `***` (same as log redaction)
- Patterns: API keys, tokens, passwords, connection strings from existing `security.inputValidation` patterns plus any secrets registered in the SecretManager
- Filter runs synchronously in the output pipeline — no unfiltered output ever reaches WebSocket or logs

### Output Streaming

Code execution output streams to the dashboard in real-time via WebSocket:

```
Channel: code_execution:{sessionId}
Events: output_chunk, execution_start, execution_end, execution_error
```

### Audit Trail

Every code execution is recorded in the audit chain:

```typescript
{
  type: 'code_execution',
  sessionId: string,
  runtime: string,
  inputCode: string,           // the code that was executed
  outputSummary: string,       // first 500 chars of stdout
  exitCode: number | null,
  duration: number,
  approved: boolean,           // was this auto-approved or user-approved
  approvedBy: string | null,   // userId if user-approved
}
```

### MCP Tools

```
execute_code(runtime, code, sessionId?)
  → Executes code in specified runtime, returns stdout/stderr/exitCode

list_sessions(conversationId?)
  → Lists active sessions with state and usage stats

kill_session(sessionId)
  → Terminates a session and its underlying process
```

### Soul Integration

When code execution is enabled, the SoulManager appends a capability section to the system prompt informing the personality that it can write and execute code, with guidelines:

- Prefer existing tools over code execution when a tool fits
- Use code for: data transformation, computation, custom API calls, file processing
- Always explain what the code does before executing
- Handle errors gracefully — parse stderr and retry or report

This section is only included when `security.codeExecution.enabled: true`.

## Consequences

### Positive
- Agent can solve novel problems not covered by pre-built tools
- Existing sandbox infrastructure provides production-grade isolation at zero additional cost
- Two-level opt-in respects security-first principles — no code execution by default
- Persistent sessions enable multi-step workflows (install package → import → use)
- Streaming secrets filter prevents accidental credential exposure in output
- Full audit trail for compliance and forensics

### Negative
- Code execution is inherently higher risk than structured tool calls, even within a sandbox
- Persistent sessions consume system resources (child processes, memory)
- Per-execution approval flow adds friction in interactive use (mitigated by session trust)
- LLM-generated code may have bugs or produce unexpected behavior

### Risks
- Sandbox escape — mitigated by defense-in-depth (Landlock + seccomp + resource limits)
- Resource exhaustion from runaway code — mitigated by execution time and memory limits
- Secrets in code input (not just output) — audit trail captures input, must be treated as sensitive
