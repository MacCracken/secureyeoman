# CLI Reference

SecureYeoman ships with **56 commands** covering every major feature area. All commands support `--json` for scripted output, `--url` to target a remote instance, and `--token` for authentication.

```bash
secureyeoman help              # list all commands
secureyeoman <command> --help  # command-specific help
```

---

## Command Index

### Core Server

| Command | Alias | Description |
|---------|-------|-------------|
| `start` | — | Start the gateway server (default command) |
| `health` | — | Check health of a running instance |
| `status` | — | Show server status overview with optional `--profile` memory stats |
| `config` | `cfg` | Validate configuration and check secrets |
| `init` | — | Interactive onboarding wizard |
| `migrate` | — | Run database migrations and exit |

### AI & Models

| Command | Alias | Description |
|---------|-------|-------------|
| `model` | — | View and manage AI model configuration (`list`, `switch`, `info`) |
| `provider` | `prov` | Manage multi-account AI provider keys and costs (`list`, `add`, `validate`, `set-default`, `costs`, `rotate`) |
| `chat` | — | Send a message to a personality (supports stdin piping with `-`) |
| `strategy` | `strat` | Manage reasoning strategies (`list`, `show`, `create`, `delete`) |

### Agents & Teams

| Command | Alias | Description |
|---------|-------|-------------|
| `agents` | — | View and toggle agent feature flags (`status`, `enable`, `disable`) — sub-agents, A2A, swarms, binary-agents |
| `crew` | `team` | Manage and run agent teams (`list`, `show`, `import`, `export`, `run`, `runs`, `wf:versions`, `wf:tag`, `wf:rollback`, `wf:drift`) |
| `a2a` | — | Agent-to-Agent protocol management |
| `world` | `w` | ASCII animated agent world visualization |

### Security

| Command | Alias | Description |
|---------|-------|-------------|
| `policy` | — | View and manage the global security policy |
| `sandbox` | `sbx` | Sandbox artifact scanning and quarantine (`scan`, `quarantine`, `policy`, `threats`, `stats`) |
| `dlp` | — | Data Loss Prevention (`classifications`, `scan`, `policies`, `egress`, `anomalies`, `watermark`) |
| `guardrail` | `gr` | Guardrail pipeline (`filters`, `toggle`, `metrics`, `reset-metrics`, `test`) |
| `security` | `sec` | Manage Kali security toolkit container (`setup`, `teardown`, `update`, `status`) |
| `tee` | `confidential` | Confidential Computing / TEE status and verification (`status`, `verify`, `hardware`) |
| `athi` | `threat` | ATHI threat governance framework (`list`, `show`, `create`, `matrix`, `summary`) |
| `risk` | `rsk` | Departmental risk register (`departments`, `register`, `heatmap`, `summary`, `report`) |
| `chaos` | — | Chaos engineering experiments (`list`, `show`, `run`, `abort`, `results`, `status`) |

### Workflows

| Command | Alias | Description |
|---------|-------|-------------|
| `workflow` | `wf` | Manage DAG workflows and runs (`list`, `show`, `run`, `runs`, `run-detail`, `cancel`, `export`, `import`) |

### Training & ML

| Command | Alias | Description |
|---------|-------|-------------|
| `training` | `train` | Export conversations and memories as LLM training datasets (`export`, `stats`) |
| `federated` | `fl` | Federated learning sessions (`sessions`, `show`, `pause`, `resume`, `cancel`, `participants`, `rounds`) |

### Knowledge & Memory

| Command | Alias | Description |
|---------|-------|-------------|
| `memory` | `mem` | Manage vector memory and brain operations (`search`, `memories`, `knowledge`, `stats`, `consolidate`, `reindex`, `audit`, `schedule`, `activation`) |
| `knowledge` | `kb` | Knowledge base and RAG management (`list`, `ingest-url`, `ingest-file`, `ingest-text`, `delete`) |

### Observability & Audit

| Command | Alias | Description |
|---------|-------|-------------|
| `observe` | `obs` | Observability — costs, budgets, SLOs, and SIEM status (`costs`, `budgets`, `slos`, `siem`) |
| `alert` | — | Manage alert rules (`rules`, `show`, `test`, `delete`) |
| `audit` | — | Memory audit reports, scheduling, and health (`reports`, `show`, `run`, `schedule`, `health`, `approve`) |
| `replay` | — | Agent replay and trace debugging (`list`, `show`, `summary`, `chain`, `diff`, `delete`) |

### Governance & Compliance

| Command | Alias | Description |
|---------|-------|-------------|
| `pac` | `policy-as-code` | Policy-as-Code bundles, deployments, and evaluation (`bundles`, `show`, `sync`, `deploy`, `deployments`, `rollback`, `evaluate`) |
| `iac` | — | Infrastructure-as-Code templates and deployments (`templates`, `show`, `sync`, `validate`, `deployments`, `repo`) |
| `role` | — | Manage RBAC roles and user assignments (`list`, `create`, `delete`, `assign`, `revoke`, `assignments`) |
| `tenant` | — | Multi-tenancy management (`list`, `show`, `create`, `delete`) |
| `license` | `lic` | View and manage the SecureYeoman license key (`status`, `set`) |
| `sbom` | `bom` | Generate SBOM, compliance mappings, and dependency tracking (`generate`, `compliance`, `deps`) |
| `verify` | — | Verify binary release integrity (checksum + signature) |

### Integrations

| Command | Alias | Description |
|---------|-------|-------------|
| `integration` | `int` | Manage integrations (`list`, `show`, `create`, `delete`, `start`, `stop`) |
| `plugin` | — | Manage integration plugins (`list`, `info`, `add`, `remove`) |
| `agnostic` | `ag` | Manage Agnostic QA Docker Compose stack (`start`, `stop`, `status`, `logs`, `pull`) |
| `mcp-server` | — | Start the MCP (Model Context Protocol) server |
| `mcp-quickbooks` | `mcp-qbo` | Manage QuickBooks Online MCP toolset (`status`, `enable`, `disable`) |
| `skill` | `marketplace` | Marketplace skills — browse, install, and sync (`list`, `show`, `install`, `uninstall`, `sync`) |

### Development & Tools

| Command | Alias | Description |
|---------|-------|-------------|
| `repl` | `shell` | Interactive REPL |
| `tui` | `dashboard` | Full-screen terminal dashboard |
| `execute` | — | Sandboxed code execution (`run`, `sessions`, `history`, `approve`, `reject`) |
| `browser` | `br` | Manage browser automation sessions (`list`, `stats`, `config`, `session`) |
| `scraper` | `sc` | Manage web scraping and MCP web tools (`config`, `tools`, `servers`) |
| `multimodal` | `mm` | Manage multimodal I/O operations (`config`, `jobs`) |

### Utility

| Command | Alias | Description |
|---------|-------|-------------|
| `alias` | — | Create, list, and delete CLI command aliases (`create`, `list`, `delete`) |
| `completion` | — | Generate shell completion scripts (`bash`, `zsh`, `fish`) |
| `extension` | — | Manage lifecycle extension hooks |
| `personality` | `pers` | Export and import portable personality files (`list`, `export`, `import`) |
| `help` | — | Show all available commands |

---

## Common Flags

All commands accept these flags:

| Flag | Description |
|------|-------------|
| `--url <url>` | Server URL (default: `http://127.0.0.1:3000`) |
| `--token <token>` | Authentication token |
| `--json` | Output raw JSON (for scripting and piping) |
| `-h`, `--help` | Show command-specific help |

---

## Examples

### Server management

```bash
secureyeoman start --port 18789        # start on custom port
secureyeoman health --json             # JSON health check
secureyeoman status --profile          # status with memory profiling
secureyeoman config validate           # validate configuration
```

### Chat and models

```bash
secureyeoman chat "What is Kubernetes?" # send a message
echo "Explain this code" | secureyeoman chat -  # pipe stdin
secureyeoman model switch anthropic claude-sonnet-4-6
secureyeoman provider costs             # view provider cost breakdown
```

### Workflows

```bash
secureyeoman workflow list              # list all workflows
secureyeoman wf run <id> --input '{"key": "value"}'
secureyeoman wf runs <id>              # list runs
secureyeoman wf cancel <runId>         # cancel a run
secureyeoman wf export <id> --out workflow.json
secureyeoman wf import workflow.json
```

### Knowledge base

```bash
secureyeoman kb list                   # list documents
secureyeoman kb ingest-url https://example.com --depth 2
secureyeoman kb ingest-file report.pdf
echo "Important policy text" | secureyeoman kb ingest-text --title "Policy"
secureyeoman kb delete <docId>
```

### Security

```bash
secureyeoman dlp scan sensitive.txt    # DLP content scan
secureyeoman dlp classifications       # view classifications
secureyeoman guardrail filters         # list guardrail filters
secureyeoman gr toggle <filterId>      # toggle a filter
secureyeoman gr test "test input" --direction input
secureyeoman sandbox scan suspicious.js
```

### Observability

```bash
secureyeoman observe costs --json      # cost attribution
secureyeoman obs budgets               # budget utilization
secureyeoman obs slos                  # SLO compliance
secureyeoman alert rules               # list alert rules
secureyeoman alert test <ruleId>       # test-fire an alert
```

### Governance

```bash
secureyeoman pac bundles               # list policy bundles
secureyeoman pac sync                  # sync from git
secureyeoman pac deploy <bundleName>   # deploy bundle
secureyeoman iac templates             # list IaC templates
secureyeoman iac validate <templateId> # validate template
```

### Training

```bash
secureyeoman train export --format sharegpt --out dataset.jsonl
secureyeoman train stats
secureyeoman fl sessions               # federated learning sessions
secureyeoman fl rounds <sessionId>     # training rounds
```

### Agent replay

```bash
secureyeoman replay list               # list traces
secureyeoman replay summary <traceId>  # tokens, cost, tools
secureyeoman replay diff <a> <b>       # compare traces
secureyeoman replay chain <traceId>    # replay ancestry
```

### Chaos engineering

```bash
secureyeoman chaos list                # list experiments
secureyeoman chaos run <id>            # execute experiment
secureyeoman chaos abort <id>          # stop running experiment
secureyeoman chaos results <id>        # view results
secureyeoman chaos status              # system overview
```

### Memory audit

```bash
secureyeoman audit reports             # list audit reports
secureyeoman audit run --scope weekly  # trigger manual audit
secureyeoman audit health              # memory health metrics
secureyeoman audit approve <reportId>  # approve pending report
```

### Multi-tenancy

```bash
secureyeoman tenant list               # list tenants
secureyeoman tenant create "Acme Corp" --plan enterprise
secureyeoman tenant show <id>
secureyeoman tenant delete <id>
```

### Skills marketplace

```bash
secureyeoman skill list --query "security"
secureyeoman skill install <skillId>
secureyeoman skill uninstall <skillId>
secureyeoman skill sync                # sync community repo
```

### Shell completions

```bash
secureyeoman completion bash > ~/.bash_completions/secureyeoman
secureyeoman completion zsh > ~/.zsh/completions/_secureyeoman
secureyeoman completion fish > ~/.config/fish/completions/secureyeoman.fish
```

### Custom aliases

```bash
secureyeoman alias create h "health --json"   # create alias
secureyeoman h                                 # uses the alias
secureyeoman alias list                        # list aliases
secureyeoman alias delete h                    # remove alias
```

---

## Scripting with `--json`

Every command supports `--json` for machine-readable output:

```bash
# Check health and parse with jq
secureyeoman health --json | jq '.status'

# List workflows and count them
secureyeoman wf list --json | jq '.workflows | length'

# Monitor costs programmatically
secureyeoman obs costs --json | jq '.breakdown[] | select(.total > 10)'
```

---

## Remote Instances

Target a remote SecureYeoman instance:

```bash
secureyeoman health --url https://sy.internal:18789 --token $SY_TOKEN
secureyeoman wf list --url https://sy.internal:18789 --token $SY_TOKEN --json
```

---

## See Also

- [Getting Started](getting-started.md)
- [Configuration Reference](../configuration.md)
- [REST API Reference](../api/rest-api.md)
- [Feature Reference](../features.md)
