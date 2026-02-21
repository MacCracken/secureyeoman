# ADR 089 — Kali Security Toolkit MCP

**Status**: Accepted
**Date**: 2026-02-21

---

## Context

The Ethical Whitehat Hacker and Security Researcher community skills provide strong AI-side reasoning for authorized penetration testing and CTF challenges. However, reasoning alone is not enough: agents need to actually *invoke* security tooling — recon, enumeration, exploitation, offline cracking — from within an agentic workflow.

The gap: an agent can reason about how to run `nmap`, suggest gobuster wordlists, or describe a SQL injection payload, but cannot execute those commands, parse the structured output, or chain results from one phase into the next.

**An important design constraint:** community skills (prompt instructions) are parsed and injected by the soul manager **regardless of whether security MCP tools are configured**. A user can install the ethical-whitehat-hacker skill from the marketplace and benefit from its reasoning capabilities on any system — even one without Docker or security tools installed. Skills and tools are independent layers.

---

## Decision

Surface Kali Linux security tools as MCP tools within the existing YEOMAN MCP server (`@secureyeoman/mcp`). The binary manages the container lifecycle via the `secureyeoman security` CLI subcommand rather than requiring a separate Docker image or prebuilt.

### Three Deployment Modes

| Mode | Description | When to Use |
|------|-------------|-------------|
| `native` | Tools invoked directly from host PATH | Tools already installed on the host (CTF VMs, Kali installs) |
| `docker-exec` | Tools invoked via `docker exec` into a user-managed container | Most users; clean isolation without a host Kali install |
| *(future)* prebuilt image | Managed `ghcr.io/secureyeoman/mcp-security-toolkit` | Cloud deployments, one-click setup |

The current implementation supports `native` and `docker-exec`. The binary provisions the docker-exec container via:

```
secureyeoman security setup     # pull kalilinux/kali-rolling, start container, install tools
secureyeoman security teardown  # stop and remove container
secureyeoman security update    # apt-get upgrade inside container
secureyeoman security status    # show container state and per-tool availability
```

### Tool Surface

| Tool name | Binary | Active? | Description |
|-----------|--------|---------|-------------|
| `sec_nmap` | `nmap` | Yes | Port/service scan |
| `sec_gobuster` | `gobuster` | Yes | Dir/dns/vhost brute-force |
| `sec_ffuf` | `ffuf` | Yes | Web fuzzer |
| `sec_sqlmap` | `sqlmap` | Yes | SQLi detection (no `--os-shell`) |
| `sec_nikto` | `nikto` | Yes | Web vulnerability scanner |
| `sec_nuclei` | `nuclei` | Yes | Template-based vulnerability scanner |
| `sec_whatweb` | `whatweb` | Yes | Web technology fingerprinting |
| `sec_wpscan` | `wpscan` | Yes | WordPress scanner |
| `sec_hashcat` | `hashcat` | No | Offline hash cracking |
| `sec_john` | `john` | No | Offline hash cracking |
| `sec_theharvester` | `theHarvester` | No | OSINT email/subdomain collection |
| `sec_dig` | `dig` | No | DNS lookup |
| `sec_whois` | `whois` | No | WHOIS lookup |
| `sec_shodan` | Shodan API | No | Host lookup via Shodan REST API |

**Active** tools validate the target against `MCP_ALLOWED_TARGETS` before executing. **Passive** tools (offline cracking, DNS, WHOIS, OSINT) do not require scope validation.

Registration is conditional: tool availability is checked at startup via `which <bin>` (native) or `docker exec <container> which <bin>` (docker-exec). Only available tools are registered. This is logged at `info` level.

### Scope Validation

Configured via `MCP_ALLOWED_TARGETS` (comma-separated CIDRs, hostnames, URL prefixes):

```
MCP_ALLOWED_TARGETS=10.10.10.0/24,ctf.example.com,https://testapp.internal
```

A wildcard value (`*`) is supported for lab-only deployments (HackTheBox, TryHackMe, DVWA) with the explicit understanding that it bypasses scope enforcement entirely.

If `MCP_ALLOWED_TARGETS` is empty and `MCP_EXPOSE_SECURITY_TOOLS=true`, active tools return a `ScopeViolationError` instructing the user to configure targets.

### Security Guardrails

- `MCP_EXPOSE_SECURITY_TOOLS` defaults to `false` — all `sec_*` tools return a disabled error until explicitly opted in
- `sqlmap` is invoked with `--batch --no-logging` and never with `--os-shell` or `--os-cmd`
- Password cracking tools (`hashcat`, `john`) are passive — they operate on user-supplied hashes only, never against live services
- All tool calls go through the existing MCP middleware stack: rate limiting, input validation, audit logging, secret redaction
- `execFile` is used throughout — no shell interpolation

### Community Skills Independence

The ethical-whitehat-hacker and security-researcher skills are prompt instructions stored in the skills registry. The `SoulManager.composeSoulPrompt()` pipeline injects them into agent context regardless of `MCP_EXPOSE_SECURITY_TOOLS`. Users benefit from the AI reasoning layer of these skills on any system, including systems without Docker or security tools installed.

**Skills work independently of security tool availability.** The two layers are:
1. **Skill layer** — AI reasoning, methodology, ethical framing (always available after install from marketplace)
2. **Tool layer** — actual command execution (requires `MCP_EXPOSE_SECURITY_TOOLS=true` and configured targets)

---

## What Was NOT Decided

- Base Kali image version and update cadence
- Whether to publish a `ghcr.io/secureyeoman/mcp-security-toolkit` prebuilt image
- Dashboard scope-manifest UI (v2)
- Inclusion of hydra, metasploit, msfvenom, aircrack-ng (deferred — see exclusions from original ADR)

---

## Consequences

**Positive**
- Agents can execute the full passive recon → active enumeration → web exploitation → offline cracking pipeline without leaving the YEOMAN UI
- Binary-managed container means no separate Docker image build/publish pipeline is required to ship v1
- Tool availability check at startup means the tool surface adapts to what's actually installed — useful for native mode where only a subset of tools exist
- Skills remain available even on systems without Docker — users can always get AI reasoning even without the execution layer
- Scope enforcement prevents accidental out-of-scope testing

**Negative / Trade-offs**
- Requires Docker for docker-exec mode; native mode requires Kali-compatible tools on the host
- Tool availability check at startup adds ~1–2s to MCP server startup time (parallel `which` calls)
- Scope validation is substring/prefix matching — not CIDR-aware. A full CIDR library is a future improvement
- `*` wildcard is an escape hatch with no UI warning — documented but not enforced at the code level

---

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Separate `mcp-security-toolkit` Docker image (original ADR) | Adds a Docker image build/publish pipeline before any real-world usage confirms demand |
| Per-tool prebuilts (one MCP server per tool) | 14+ MCP connections would clutter the connections UI |
| npx/uvx package wrapping individual tools | Kali tools are not npm/uv packages |
| Native TypeScript tool wrappers | Reimplementing nmap XML parsing, sqlmap output, etc. is high maintenance |

---

## Related

- [ADR 004 — MCP Protocol](004-mcp-protocol.md)
- [ADR 036 — Sandboxed Code Execution](036-sandboxed-code-execution.md)
- [ADR 046 — MCP Prebuilts](046-phase11-mistral-devtools-mcp-prebuilts.md)
- [ADR 060 — ML Security Sandbox Isolation](060-ml-security-sandbox-isolation.md)
- [ADR 063 — Community Skills Registry](063-community-skills-registry.md)
- Community Skills: `ethical-whitehat-hacker`, `security-researcher`
