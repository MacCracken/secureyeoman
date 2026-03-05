# ADR 002: Security Architecture

## Status

Accepted

## Context

SecureYeoman is an AI agent orchestration platform that processes sensitive data, executes code on behalf of users, and interacts with external services. The security architecture must address threats across the full lifecycle: from user authentication through prompt assembly, AI inference, tool execution, and response delivery. The attack surface includes direct user input, indirect injection via stored data, credential exposure in sandbox outputs, and AI-specific risks such as jailbreaking, model poisoning, and autonomous agent misuse.

The platform operates in regulated environments (healthcare, finance, legal) where compliance requirements demand defense-in-depth, auditable controls, and configurable policy enforcement. The security model is designed around the principle that every feature defaults to the most restrictive posture and requires explicit operator opt-in for elevated capabilities.

This document consolidates all security-related architectural decisions into a single reference.

## Decisions

### Authentication & Authorization

#### SSO via OIDC and SAML 2.0

User authentication supports standards-compliant Single Sign-On through two protocols:

**OIDC** uses the `openid-client` library (v6) with PKCE. Identity providers are stored in the `auth.identity_providers` table, with PKCE state persisted in `auth.sso_state` (10-minute TTL, database-backed to survive restarts). The SSO manager handles discovery, authorization URL generation, callback processing, and just-in-time user provisioning when `auto_provision` is enabled. State tokens are consumed immediately after retrieval, regardless of subsequent validation outcome, preventing replay attacks.

**SAML 2.0** uses `node-saml` (lazy-imported so the system starts cleanly without it). A `SamlAdapter` handles authorization URLs, callback validation, attribute normalization, and group-to-role mapping. SP metadata is served at a public endpoint. SAML configuration (entry point, IDP certificate, SP private key, group-role mappings) is stored in the provider's JSONB config column alongside OIDC fields.

Both protocols share the same database schema (`type IN ('oidc', 'saml')`), identity mapping table, and JIT provisioning logic.

#### RBAC and Role-Based Access

All REST and WebSocket endpoints are protected by role-based access control. The RBAC system supports role inheritance, conditional permissions, and user-role assignments. Route permissions follow a convention-based resolution pattern: standard routes auto-resolve from URL prefix and HTTP method, while non-standard routes use explicit permission declarations.

WebSocket connections enforce the same RBAC model as REST endpoints. Token validation is awaited (not fire-and-forget), and the validated user's role is stored on the connection object. A `CHANNEL_PERMISSIONS` map links WebSocket channels to RBAC resource-action pairs. Unauthorized channels are silently skipped during subscription.

#### Rate Limiting

Rate limiting operates at multiple levels:

- **Global gateway hook**: 100 requests/minute for general API, 10/minute for terminal and workflow execution, 5/minute for authentication endpoints. Health checks and WebSocket upgrades are exempt.
- **Dedicated chat rule**: 30 requests/minute per user, applied to both streaming and non-streaming chat endpoints.
- **Per-personality override**: Operators can set custom `chatRequestsPerMinute` in a personality's resource policy without restarting the server. Setting `enabled: false` exempts trusted automation personalities from rate limiting entirely.
- **Per-endpoint brain route limits**: 60/minute for mutations, 5/minute for administrative operations.

Rate limit violations are recorded in the audit chain.

#### CSRF Protection

CSRF protection is not implemented because the API uses stateless Bearer token authentication exclusively. No session cookies are issued. The `Authorization` header cannot be attached by cross-origin requests without a CORS preflight, which the server rejects for untrusted origins. If cookies are ever introduced for session management, SameSite attributes and a synchronizer token pattern must be added before shipping.

#### CORS

When a wildcard (`*`) is in the origins list, `Access-Control-Allow-Origin: *` is set without credentials. When a specific origin matches, it is reflected with `Access-Control-Allow-Credentials: true` and `Vary: Origin`. This follows the Fetch specification and prevents the credentialed-wildcard vulnerability.

### Sandboxing & Isolation

#### Sandbox Infrastructure

Code execution always runs within a mandatory sandbox. The sandbox layer is not configurable — it is always on:

- **Linux**: Landlock filesystem restrictions combined with seccomp-bpf syscall filtering.
- **macOS**: `sandbox-exec` with a deny-default policy.
- **Resource limits**: Memory, CPU, and file size limits enforced by the sandbox configuration.

Code execution is controlled by a two-level opt-in: a global `enabled` flag (off by default) and an `autoApprove` flag. When enabled without auto-approval, each execution triggers a dashboard approval prompt with an option to trust the session for subsequent executions. Multi-runtime support covers Python (child process with `--isolated`), Node.js (`isolated-vm` for V8-level isolation), and shell (pseudo-TTY wrapper within the sandbox).

#### Additional Isolation Layers

Three optional isolation mechanisms extend the base sandbox, each controlled by a global security policy flag (all default to `false`):

- **gVisor** (`sandboxGvisor`): Kernel-level isolation via `runsc`, providing an additional containment layer. Requires host-level gVisor installation.
- **WASM** (`sandboxWasm`): WebAssembly-based isolation for memory-safety and capability confinement with no host dependencies.
- **Anomaly Detection** (`allowAnomalyDetection`): ML-based detection of unusual patterns in agent behavior, API calls, and security events.

#### Dynamic Tool Creation

Agents can generate and register new tools at runtime, controlled by three gates:

1. A global `allowDynamicTools` flag (off by default).
2. A `sandboxDynamicTools` flag (on by default when dynamic tools are enabled) that isolates generated tools inside the same sandbox boundary as code execution.
3. A per-personality `allowDynamicTools` toggle, gated by the global policy ceiling.

This ensures runtime extensibility requires two deliberate actions and defaults to sandboxed execution.

#### Artifact Scanning and Externalization Gate

Sandbox outputs pass through a mandatory scanning and approval gate before reaching callers. The gate consists of:

- **CodeScanner**: 24 regex-based static analysis patterns covering command injection, data exfiltration, privilege escalation, supply chain attacks, obfuscation, and reverse shells.
- **SecretsScanner**: 18 patterns for API keys, credentials, PII, private keys, JWTs, and connection strings, with a `redact()` method.
- **DataScanner**: Magic byte detection (ELF/PE/Mach-O), polyglot file detection, serialization attack detection (pickle, Java, PHP, YAML), oversized payload detection, and formula injection checks.

Scanners run in parallel via `ScannerPipeline` with `Promise.allSettled` for fault tolerance. Gate decisions include pass, redact, quarantine (persist and alert), or block. A `ThreatClassifier` provides intent scoring with kill chain stage mapping. An `EscalationManager` implements a four-tier response: log, alert, personality suspension, and privilege revocation. All scans are recorded in a `sandbox.scan_history` table regardless of verdict.

### Prompt Security

#### Input Validation and Jailbreak Scoring

`InputValidator` operates at the HTTP boundary, scanning raw user input, conversation history, soul route payloads, and MCP tool arguments. Each matched injection pattern contributes a severity-weighted score (high: 0.60, medium: 0.35, low: 0.15), accumulated and capped at 1.0. The `injectionScore` is stored per message.

When the score meets or exceeds the configurable `jailbreakThreshold` (default 0.5), the system responds according to `jailbreakAction`: block (return 400), warn (allow with audit entry), or audit-only (silent recording).

#### Prompt Assembly Injection Guard

`PromptGuard` is a second scanning layer that runs immediately before the LLM API call on the fully assembled messages array. It addresses indirect prompt injection — adversarial content planted in trusted data sources (retrieved memories, skill descriptions, user notes) that bypasses the HTTP boundary validator.

The pattern set is tuned for indirect injection: context delimiter tokens, fake authority headers, instruction overrides, developer impersonation, instruction resets, hypothetical framing, comment-based bypass attempts, and roleplay overrides. Patterns that only make sense in non-system positions are skipped when scanning system messages to avoid false positives on legitimate prompt structure.

Configuration supports `block`, `warn` (default), or `disabled` modes. The `warn` default allows operators to observe false-positive rates before enabling blocking.

#### Response Guard and AI Safety Layer

`ResponseGuard` mirrors `PromptGuard` on the output side, scanning LLM responses for six pattern categories: instruction injection in output, cross-turn influence strings, self-escalation claims, role confusion, and base64/hex exfiltration attempts. It also provides `checkSystemPromptLeak()`, which uses trigram overlap analysis to detect and redact responses that reproduce the system prompt. This is gated by a per-personality `strictSystemPromptConfidentiality` toggle.

The broader AI Safety Layer adds four additional mechanisms:

- **OPA Output Compliance**: Evaluates responses against organizational hard boundaries via Open Policy Agent rules. Fail-open, warn-only.
- **LLM-as-Judge**: An optional secondary LLM call before tool execution for high-autonomy personalities, returning allow/warn/block verdicts. Disabled by default due to latency cost.
- **Structured Output Schema Validation**: JSON Schema validation on workflow step outputs to catch schema drift. Warn-only, never blocks.
- **Rate-Aware Abuse Detection**: Session-level tracking of adversarial signals (repeated blocked submissions, rapid topic pivoting, tool-call enumeration spikes). Triggers cool-down periods with 429 responses.

#### Content Guardrails

`ContentGuardrail` runs after `ResponseGuard` in the chat output pipeline, enforcing six content policy capabilities:

1. **PII detection and redaction**: Regex-based scanning for emails, phone numbers, SSNs, credit cards, and IP addresses with configurable detect-only or redact modes.
2. **Topic restrictions**: Keyword-based Jaccard overlap to block responses on restricted topics.
3. **Toxicity filtering**: External classifier integration with fail-open behavior.
4. **Custom block lists**: Plain string (word boundary) or compiled regex patterns.
5. **Audit trail**: All findings recorded with content hashes.
6. **Grounding checks**: Citation verification against the knowledge base.

Configuration is available globally and per-personality.

### Credential Management

#### Sandbox Credential Proxy

Sandboxed processes authenticate outbound HTTP requests through a `CredentialProxy` — a Node.js HTTP server running in the parent process on a localhost ephemeral port. The proxy holds credential rules in memory (never exposed to the sandbox) and injects authentication headers for matching hosts on plain HTTP requests. For HTTPS, it creates raw TCP tunnels via CONNECT with hostname allowlist enforcement. The sandbox receives only `http_proxy=http://127.0.0.1:PORT` as an environment variable.

This eliminates the practice of passing secrets as environment variables into sandboxed processes, closing the gap where credentials were readable via `/proc/self/environ` or survived across `exec()` calls.

#### Tool Output Scanner

`ToolOutputScanner` scans text for credential patterns and replaces matches with `[REDACTED:<type>]`. The built-in pattern registry covers 18 credential formats: OpenAI, Anthropic, GitHub, AWS, PEM private keys, database connection strings, Bearer tokens, JWTs, Slack tokens, Stripe keys, Twilio tokens, Discord tokens, and generic key-value patterns. The scanner also accepts known secret values from the live keyring as literal-match patterns, ensuring managed secrets are caught even when they don't match any known format.

The scanner runs on LLM responses before they reach callers. All code execution output passes through a separate streaming-aware secrets filter that buffers output in 256-byte windows to detect partial matches.

#### Skill Trust Tiers

Community-sourced skills are restricted to read-only tool access at dispatch time, while user-authored, AI-proposed, AI-learned, and marketplace skills retain full tool access. Read-only classification uses a 26-prefix allowlist on tool names (`get_`, `list_`, `read_`, `search_`, etc.). Skill instructions continue to inject into the system prompt normally — only the available tool set is restricted. Per-skill overrides are supported via the `allowedPermissions` field.

### Audit & Compliance

#### Memory and Brain Audit

A comprehensive audit of the Brain/Memory system addressed 20+ issues including:

- A critical pruning bug that deleted highest-importance memories instead of lowest (fixed sort direction).
- SQL injection via context key interpolation (fixed with parameterized JSONB paths and regex validation).
- Prompt injection via stored memories (mitigated by `sanitizeForPrompt()` stripping injection patterns before context composition).
- Phantom vectors in FAISS after deletion (added `compact()` method to rebuild index).
- Missing RBAC protection on brain routes (18 routes added to permissions map).
- Unbounded query limits (capped at 200 on all GET routes).
- Per-endpoint rate limits on brain mutation endpoints.

#### Security Hardening Audit

A codebase-wide security audit addressed multiple vulnerability categories:

- **Secrets hygiene**: All real credentials replaced with placeholders in environment files. Pre-commit hook with regex-based secret scanning prevents accidental credential commits.
- **Execution hardening**: Terminal route shell injection detection (metacharacter blocking with safe pipe whitelist). Workflow condition evaluation replaced `new Function()` with a recursive-descent safe expression parser supporting only property access, comparisons, logical operators, and literals.
- **Error sanitization**: Status 500 responses return a generic message; internal details never leak to clients.
- **Pagination bounds**: All paginated endpoints enforce maximum limits (100-1000 depending on route).
- **RLS bypass auditing**: Every Row-Level Security bypass logs a warning with caller stack trace.
- **WebSocket authentication**: `Sec-WebSocket-Protocol` subprotocol token support as primary method, query parameter as deprecated fallback.

#### ATHI Threat Governance

The ATHI (Actors / Techniques / Harms / Impacts) framework provides structured AI threat governance. Each scenario captures the full causal chain from threat actor through technique, immediate harm, and business-level impact. Scenarios are stored with likelihood and severity scores (1-5 scale) producing a computed risk score (1-25 range).

Scenarios link to existing security events from the audit log, enabling traceability from observed incidents to the threat model. AI-assisted scenario generation is available via a marketplace skill. A 5x5 risk matrix heatmap visualizes the threat landscape.

### Network Security

#### HTTP Security Headers

All HTTP responses carry unconditional security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `Strict-Transport-Security` when TLS is active. These are not configurable — there is no legitimate reason to disable them on an API server.

#### CIDR-Aware Scope Validation

Security toolkit target scope enforcement uses proper IPv4 CIDR math rather than string prefix matching. The `isIpInCidr()` function converts IPs and network addresses to 32-bit unsigned integers, applies prefix-length masks, and compares. The `matchesScope()` function dispatches to CIDR range checks, domain suffix matching, or exact hostname matching based on entry form. All matching is fail-closed: malformed input returns false.

A separate `MCP_ALLOWED_NETWORK_TARGETS` allowlist governs network infrastructure tools independently from security tools, since the target populations differ (attack-surface endpoints vs. management interfaces).

#### Security Toolkit

Security assessment tools are surfaced as MCP tools with two deployment modes: native (tools invoked from host PATH) and Docker-exec (tools invoked via `docker exec` into a managed container). The toolkit includes port scanning, directory brute-forcing, web fuzzing, SQL injection detection, vulnerability scanning, technology fingerprinting, and offline hash cracking.

All active tools validate targets against the scope allowlist before execution. Brute-force tools require a separate `MCP_ALLOW_BRUTE_FORCE` flag beyond the general security tools flag. Tool availability is checked at startup; only available tools are registered. Each tool appends a structured JSON envelope to its output for agent chaining. The `sqlmap` tool is restricted from `--os-shell` and `--os-cmd` flags.

#### Network Evaluation and Protection

A 37-tool network automation toolkit covers SSH device automation, topology discovery, routing/switching analysis, security auditing, NetBox source-of-truth integration, NVD CVE lookup, subnet utilities, and PCAP analysis. Tools are grouped into six independently toggleable feature sets reflecting different risk postures (device automation vs. read-only discovery vs. external API queries). Configuration push operations are classified as high-autonomy and require explicit approval gates. NetBox access is read-only by default with a separate write-enablement flag.

#### Confidential Computing (TEE)

TEE-aware provider routing ensures AI inference runs in hardware-isolated environments when required. Configuration supports three levels: `off`, `optional`, and `required`, with per-model and per-personality overrides. A static provider capability table maps providers to known TEE support. The AI client verifies TEE compliance before every provider API call; non-compliant providers trigger the fallback chain to TEE-capable alternatives. The model router filters candidates by TEE capability during selection.

TEE requirements resolve in precedence order: per-personality, per-model, then security-level global setting. Failure actions are configurable: block (trigger fallback), warn (log and proceed), or audit-only (silent recording).

#### Accepted Risk: Dev-Dependency Vulnerabilities

Known vulnerabilities in development-only dependencies (such as ReDoS in `ajv` via ESLint's dependency chain) are documented and accepted when the attack surface is non-existent in production. The vulnerability exists exclusively in dev tooling never included in production builds. The `$data` trigger path is not reachable through normal usage. Resolution is tracked pending upstream patches.

### Risk Management

#### Departmental Risk Register

Organizations with multiple business units track risk at the department level with independent risk appetites, compliance targets, and hierarchical organizational structures. The data model consists of three tables:

- **Departments**: Organizational units with parent-child relationships (recursive CTE for tree queries), per-department risk appetite thresholds, compliance targets, and mission statements.
- **Register entries**: Individual risk items linked to departments across 10 categories (security, operational, financial, compliance, reputational, strategic, technology, third-party, environmental, other) with computed risk scores (likelihood times impact).
- **Department scores**: Point-in-time snapshots with domain-level scores (0-100 normalized) and appetite breach detection.

Score computation normalizes severity, likelihood, and impact to a 0-100 scale per domain, averages for overall score, and compares against appetite thresholds to fire breach alerts. Reports are generated in JSON, HTML, Markdown, and CSV formats. Prometheus gauges expose department count, open entries, overdue entries, and appetite breaches.

#### Security Reference Architecture

Cloud infrastructure assessment against established SRA frameworks (AWS SRA, CISA Zero Trust TRA, Microsoft MCRA) is supported through blueprints, assessments, and compliance mappings. Blueprints define reusable templates with controls organized by 10 security domains. Assessments evaluate infrastructure against blueprints with per-control results and computed compliance scores. Cross-framework compliance mappings cover NIST CSF, CIS v8, SOC 2, and FedRAMP. Alerts fire when compliance scores drop below 50%.

#### ML Security Dashboard

Security telemetry is presented through a dedicated dashboard surface that aggregates anomaly, injection, sandbox violation, and credential scan events. A deterministic risk score (0-100) is computed from weighted event counts across categories. Events are bucketed by time for trend visualization. The risk formula is intentionally simple and auditable rather than model-based.

## Consequences

### Positive

- Defense-in-depth across every stage of the request lifecycle: authentication, input validation, prompt assembly, AI inference, tool execution, output scanning, and response delivery.
- All security features default to the most restrictive posture and require explicit operator opt-in for elevated capabilities.
- Comprehensive audit trail covering injection attempts, credential scans, sandbox violations, rate limit events, RBAC decisions, and RLS bypass operations.
- Configurable policy enforcement (block, warn, audit-only) allows operators to tune aggressiveness for their threat model without code changes.
- Standards-compliant SSO (OIDC and SAML 2.0) supports enterprise identity providers without provider-specific code.
- Structured AI threat governance (ATHI) and departmental risk registers provide frameworks for communicating risk to non-technical stakeholders.
- TEE-aware routing ensures sensitive workloads can be directed to hardware-isolated inference environments.
- Sandbox artifact scanning closes the outbound security gap, ensuring isolation covers both inbound threats and outbound exfiltration.

### Negative

- Pattern-based detection (InputValidator, PromptGuard, ResponseGuard, ContentGuardrail) requires periodic updates as new attack techniques emerge. Regex patterns have inherent false positive and negative rates.
- Skill trust tier classification relies on tool name prefixes; a write tool with a read-like name would be incorrectly permitted for community skills.
- In-memory rate limiting and abuse detection state do not survive process restarts and are not distributed across instances. This is adequate for single-instance deployments.
- TEE provider capabilities are maintained in a static table requiring manual updates as providers add TEE support. Remote attestation APIs are planned but not yet implemented.
- The credential proxy protects the sandbox boundary but not the parent process; a compromised parent could still read credentials.
- Content guardrail toxicity filtering depends on external classifier availability and operates fail-open.
- Jailbreak scoring uses weighted regex as a deterministic proxy; an embedding-based classifier would provide stronger semantic coverage but adds inference latency.

### Risks

- Sandbox escape remains possible despite defense-in-depth (Landlock, seccomp, gVisor, resource limits). The externalization gate provides a secondary containment layer.
- System prompt confidentiality detection uses trigram overlap, which may produce false positives on short prompts or responses with common vocabulary.
- PKCE state expiry (10 minutes) must align with identity provider session timeout to avoid failed authentication flows.
- CIDR validation covers IPv4 only; IPv6 scope enforcement is not yet implemented.
- LLM-as-Judge adds latency to the tool execution path when enabled and may itself be susceptible to adversarial prompting.

### Constitutional AI — Self-Critique and Revision

SecureYeoman implements a Constitutional AI engine that applies self-critique and revision to LLM responses before they reach the user. Inspired by Anthropic's Constitutional AI research, the system evaluates every response against a configurable set of principles (the "constitution") and optionally revises responses that violate them.

**Architecture.** The `ConstitutionalEngine` (`security/constitutional.ts`) operates in the response pipeline between credential scanning and ResponseGuard. It executes a critique-then-revise loop:

1. **Critique** — The engine constructs a structured prompt containing all active principles with per-principle evaluation instructions. A separate LLM call evaluates the response and returns a JSON array of findings (principleId, violated, explanation, severity).
2. **Revise** — If the number of violations meets or exceeds the configurable `revisionThreshold`, the engine makes a revision LLM call that rewrites the response to address the identified issues while preserving useful content.
3. **Record** — When `recordPreferencePairs` is enabled, the (original, revised) pair is stored via `PreferenceManager` with `source: 'constitutional'` for downstream DPO fine-tuning.

**Principle sources.** Principles are resolved from three sources, merged in order:
- **Built-in defaults**: Helpfulness, Harmlessness, Honesty — the "3H" alignment principles.
- **Custom principles**: User-configured via `security.constitutional.principles[]`. Each principle has an id, name, description, critique prompt, weight, and enabled flag. Same-id custom principles override defaults.
- **Organizational intent**: When `importIntentBoundaries` is true, hard boundaries from the active intent document are automatically converted to principles.

**Operating modes:**
- **Offline** (default): Critiques and records preference pairs but does not modify the response served to the user. Suitable for training data generation.
- **Online**: Applies the revision before serving the response. Adds latency (1-2 additional LLM calls per response) but ensures alignment in real-time.

**Configuration.** The feature is gated by `security.constitutional.enabled` (default `false`). Key settings: `mode` (online/offline), `maxRevisionRounds` (1-5), `revisionThreshold`, `critiqueTemperature`, `model` override, `useDefaults`, `importIntentBoundaries`, `recordPreferencePairs`.

**REST API.** Three endpoints under `/api/v1/security/constitutional/`: `GET /principles` (list active principles), `POST /critique` (evaluate a response), `POST /revise` (full critique-and-revise loop). Auth: `security:read` / `security:write`.

**MCP tools.** `constitutional_principles`, `constitutional_critique`, `constitutional_revise` — gated by `exposeConstitutional` feature flag.

**Fail-safe.** All LLM calls in the constitutional pipeline are wrapped in try-catch with warn-level logging. On any failure (provider unavailable, parse error, timeout), the original response passes through unmodified. The feature never blocks a response from being served.
