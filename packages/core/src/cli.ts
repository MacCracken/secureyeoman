#!/usr/bin/env node
/**
 * SecureYeoman CLI — Modular command router entry point.
 *
 * Commands are registered lazily: their module is only imported when that
 * command is actually invoked, keeping startup memory low.
 *
 * Usage:
 *   secureyeoman                      # Start with defaults
 *   secureyeoman start --port 3001    # Custom port
 *   secureyeoman health               # Health check
 *   secureyeoman status               # Server overview
 *   secureyeoman init                 # Interactive onboarding
 *   secureyeoman config               # Validate config / check secrets
 *   secureyeoman integration          # Manage integrations
 *   secureyeoman role                 # Manage RBAC roles & assignments
 *   secureyeoman extension            # Manage lifecycle hooks
 *   secureyeoman execute              # Sandboxed code execution
 *   secureyeoman a2a                  # A2A protocol management
 *   secureyeoman repl                 # Interactive REPL
 *   secureyeoman browser              # Browser automation sessions
 *   secureyeoman memory               # Vector memory operations
 *   secureyeoman scraper              # Web scraper configuration
 *   secureyeoman multimodal           # Multimodal I/O operations
 *   secureyeoman model                # AI model management
 *   secureyeoman policy               # Security policy management
 *   secureyeoman completion           # Generate shell completion scripts
 *   secureyeoman plugin               # Manage integration plugins
 *   secureyeoman security             # Manage Kali security toolkit container
 *   secureyeoman mcp-server           # Start the MCP server
 *   secureyeoman mcp-quickbooks       # Manage QuickBooks Online MCP toolset
 *   secureyeoman agnostic             # Manage Agnostic QA Docker Compose stack
 *   secureyeoman tui                  # Full-screen terminal dashboard
 *   secureyeoman agents               # View/toggle agent feature flags
 *   secureyeoman migrate              # Run database migrations
 *   secureyeoman world                # ASCII animated agent world
 *   secureyeoman workflow             # DAG workflows and runs
 *   secureyeoman dlp                  # Data Loss Prevention
 *   secureyeoman audit                # Memory audit reports & health
 *   secureyeoman knowledge            # Knowledge base & RAG ingestion
 *   secureyeoman chaos                # Chaos engineering experiments
 *   secureyeoman guardrail            # Guardrail pipeline & filters
 *   secureyeoman replay               # Agent replay & trace debugging
 *   secureyeoman pac                  # Policy-as-Code management
 *   secureyeoman iac                  # Infrastructure-as-Code templates
 *   secureyeoman observe              # Observability (costs, SLOs, SIEM)
 *   secureyeoman alert                # Alert rules management
 *   secureyeoman skill                # Marketplace skills
 *   secureyeoman federated            # Federated learning sessions
 *   secureyeoman tenant               # Multi-tenancy management
 */

import { createRouter } from './cli/router.js';

const router = createRouter('start');

// ── Lazily-registered commands ─────────────────────────────────────────────
// Each entry holds only lightweight metadata. The actual module (and all its
// transitive imports) is loaded by Node.js only when the command is invoked.

router.registerLazy({
  name: 'start',
  description: 'Start the gateway server (default)',
  usage: 'secureyeoman [start] [options]',
  loader: () => import('./cli/commands/start.js').then((m) => m.startCommand),
});

router.registerLazy({
  name: 'health',
  description: 'Check health of a running instance',
  usage: 'secureyeoman health [--url URL] [--json]',
  loader: () => import('./cli/commands/health.js').then((m) => m.healthCommand),
});

router.registerLazy({
  name: 'status',
  description: 'Show server status overview',
  usage: 'secureyeoman status [--url URL] [--json]',
  loader: () => import('./cli/commands/status.js').then((m) => m.statusCommand),
});

router.registerLazy({
  name: 'config',
  aliases: ['cfg'],
  description: 'Validate configuration and manage settings',
  usage: 'secureyeoman config [validate|get|set] [options]',
  loader: () => import('./cli/commands/config.js').then((m) => m.configCommand),
});

router.registerLazy({
  name: 'init',
  description: 'Interactive onboarding wizard',
  usage: 'secureyeoman init [--url URL] [--non-interactive] [--env-only]',
  loader: () => import('./cli/commands/init.js').then((m) => m.initCommand),
});

router.registerLazy({
  name: 'integration',
  aliases: ['int'],
  description: 'Manage integrations',
  usage: 'secureyeoman integration <action> [options]',
  loader: () => import('./cli/commands/integration.js').then((m) => m.integrationCommand),
});

router.registerLazy({
  name: 'role',
  description: 'Manage RBAC roles and user assignments',
  usage: 'secureyeoman role <list|create|delete|assign|revoke|assignments>',
  loader: () => import('./cli/commands/role.js').then((m) => m.roleCommand),
});

router.registerLazy({
  name: 'extension',
  description: 'Manage lifecycle extension hooks',
  usage: 'secureyeoman extension <subcommand> [options]',
  loader: () => import('./cli/commands/extension.js').then((m) => m.extensionCommand),
});

router.registerLazy({
  name: 'execute',
  description: 'Sandboxed code execution',
  usage: 'secureyeoman execute <subcommand> [options]',
  loader: () => import('./cli/commands/execute.js').then((m) => m.executeCommand),
});

router.registerLazy({
  name: 'a2a',
  description: 'Agent-to-Agent protocol management',
  usage: 'secureyeoman a2a <subcommand> [options]',
  loader: () => import('./cli/commands/a2a.js').then((m) => m.a2aCommand),
});

router.registerLazy({
  name: 'edge',
  description: 'Edge/IoT mode — minimal headless A2A agent',
  usage: 'secureyeoman edge <start|register|status> [options]',
  loader: () => import('./cli/commands/edge.js').then((m) => m.edgeCommand),
});

router.registerLazy({
  name: 'agent',
  description: 'Agent mode — streamlined AI agent runtime (Tier 2.5)',
  usage: 'secureyeoman agent <start|register|status> [options]',
  loader: () => import('./cli/commands/agent.js').then((m) => m.agentCommand),
});

router.registerLazy({
  name: 'repl',
  aliases: ['shell'],
  description: 'Interactive REPL',
  usage: 'secureyeoman repl [--url URL]',
  loader: () => import('./cli/commands/repl.js').then((m) => m.replCommand),
});

router.registerLazy({
  name: 'browser',
  aliases: ['br'],
  description: 'Manage browser automation sessions',
  usage: 'secureyeoman browser <list|stats|config|session ID>',
  loader: () => import('./cli/commands/browser.js').then((m) => m.browserCommand),
});

router.registerLazy({
  name: 'memory',
  aliases: ['mem'],
  description: 'Manage vector memory and brain operations',
  usage: 'secureyeoman memory <search|memories|knowledge|stats|consolidate>',
  loader: () => import('./cli/commands/memory.js').then((m) => m.memoryCommand),
});

router.registerLazy({
  name: 'scraper',
  aliases: ['sc'],
  description: 'Manage web scraping and MCP web tools',
  usage: 'secureyeoman scraper <config|tools|servers>',
  loader: () => import('./cli/commands/scraper.js').then((m) => m.scraperCommand),
});

router.registerLazy({
  name: 'multimodal',
  aliases: ['mm'],
  description: 'Manage multimodal I/O operations (vision, audio, image generation)',
  usage: 'secureyeoman multimodal <config|jobs>',
  loader: () => import('./cli/commands/multimodal.js').then((m) => m.multimodalCommand),
});

router.registerLazy({
  name: 'model',
  description: 'View and manage AI model configuration',
  usage: 'secureyeoman model <action> [options]',
  loader: () => import('./cli/commands/model.js').then((m) => m.modelCommand),
});

router.registerLazy({
  name: 'policy',
  description: 'View and manage the global security policy',
  usage: 'secureyeoman policy <action> [options]',
  loader: () => import('./cli/commands/policy.js').then((m) => m.policyCommand),
});

// config-settings merged into config command (validate + get/set)

router.registerLazy({
  name: 'completion',
  description: 'Generate shell completion scripts',
  usage: 'secureyeoman completion <bash|zsh|fish>',
  loader: () => import('./cli/commands/completion.js').then((m) => m.completionCommand),
});

router.registerLazy({
  name: 'plugin',
  description: 'Manage integration plugins',
  usage: 'secureyeoman plugin <action> [options]',
  loader: () => import('./cli/commands/plugin.js').then((m) => m.pluginCommand),
});

router.registerLazy({
  name: 'mcp-server',
  description: 'Start the MCP (Model Context Protocol) server',
  usage: 'secureyeoman mcp-server [options]',
  loader: () => import('./cli/commands/mcp-server.js').then((m) => m.mcpServerCommand),
});

router.registerLazy({
  name: 'migrate',
  description: 'Run database migrations and exit',
  usage: 'secureyeoman migrate [--help]',
  loader: () => import('./cli/commands/migrate.js').then((m) => m.migrateCommand),
});

router.registerLazy({
  name: 'security',
  aliases: ['sec'],
  description: 'Manage the Kali security toolkit container',
  usage: 'secureyeoman security <setup|teardown|update|status>',
  loader: () => import('./cli/commands/security.js').then((m) => m.securityCommand),
});

router.registerLazy({
  name: 'mcp-quickbooks',
  aliases: ['mcp-qbo'],
  description: 'Manage the QuickBooks Online MCP toolset',
  usage: 'secureyeoman mcp-quickbooks <status|enable|disable>',
  loader: () => import('./cli/commands/mcp-quickbooks.js').then((m) => m.mcpQuickbooksCommand),
});

router.registerLazy({
  name: 'agnostic',
  aliases: ['ag'],
  description: 'Manage the Agnostic QA sub-agent team Docker Compose stack',
  usage: 'secureyeoman agnostic <start|stop|status|logs|pull> [options]',
  loader: () => import('./cli/commands/agnostic.js').then((m) => m.agnosticCommand),
});

router.registerLazy({
  name: 'tui',
  aliases: ['dashboard'],
  description: 'Full-screen terminal dashboard',
  usage: 'secureyeoman tui [--url URL]',
  loader: () => import('./cli/commands/tui.js').then((m) => m.tuiCommand),
});

router.registerLazy({
  name: 'agents',
  description: 'View and toggle agent feature flags (sub-agents, A2A, swarms)',
  usage: 'secureyeoman agents <status|enable|disable> [feature] [options]',
  loader: () => import('./cli/commands/agents.js').then((m) => m.agentsCommand),
});

router.registerLazy({
  name: 'training',
  aliases: ['train'],
  description: 'Export conversations and memories as LLM training datasets',
  usage: 'secureyeoman training <export|stats> [options]',
  loader: () => import('./cli/commands/training.js').then((m) => m.trainingCommand),
});

router.registerLazy({
  name: 'world',
  aliases: ['w'],
  description: 'ASCII animated agent world — watch your personalities come alive',
  usage: 'secureyeoman world [--url URL] [--fps N]',
  loader: () => import('./cli/commands/world.js').then((m) => m.worldCommand),
});

router.registerLazy({
  name: 'crew',
  aliases: ['team'],
  description: 'Manage and run agent teams (dynamic coordinator)',
  usage: 'secureyeoman crew <list|show|import|export|run|runs> [options]',
  loader: () => import('./cli/commands/crew.js').then((m) => m.crewCommand),
});

router.registerLazy({
  name: 'chat',
  description: 'Send a message to a personality (supports stdin piping)',
  usage: 'secureyeoman chat [-p personality] [--strategy slug] [--format fmt] [message]',
  loader: () => import('./cli/commands/chat.js').then((m) => m.chatCommand),
});

router.registerLazy({
  name: 'alias',
  description: 'Create, list, and delete CLI command aliases',
  usage: 'secureyeoman alias <create|list|delete> [options]',
  loader: () => import('./cli/commands/alias.js').then((m) => m.aliasCommand),
});

router.registerLazy({
  name: 'license',
  aliases: ['lic'],
  description: 'View and manage the SecureYeoman license key',
  usage: 'secureyeoman license <status|set> [options]',
  loader: () => import('./cli/commands/license.js').then((m) => m.licenseCommand),
});

router.registerLazy({
  name: 'strategy',
  aliases: ['strat'],
  description: 'Manage reasoning strategies',
  usage: 'secureyeoman strategy <list|show|create|delete> [options]',
  loader: () => import('./cli/commands/strategy.js').then((m) => m.strategyCommand),
});

router.registerLazy({
  name: 'risk',
  aliases: ['rsk'],
  description: 'Departmental risk register management',
  usage: 'secureyeoman risk <departments|register|heatmap|summary> [options]',
  loader: () => import('./cli/commands/risk.js').then((m) => m.riskCommand),
});

router.registerLazy({
  name: 'athi',
  aliases: ['threat'],
  description: 'ATHI threat governance framework',
  usage: 'secureyeoman athi <list|show|create|matrix|summary> [options]',
  loader: () => import('./cli/commands/athi.js').then((m) => m.athiCommand),
});

router.registerLazy({
  name: 'tee',
  aliases: ['confidential'],
  description: 'Confidential Computing / TEE status and verification',
  usage: 'secureyeoman tee <status|verify|hardware> [options]',
  loader: () => import('./cli/commands/tee.js').then((m) => m.teeCommand),
});

router.registerLazy({
  name: 'provider',
  aliases: ['prov'],
  description: 'Manage multi-account AI provider keys and costs',
  usage: 'secureyeoman provider <list|add|validate|set-default|costs|rotate> [options]',
  loader: () => import('./cli/commands/provider.js').then((m) => m.providerCommand),
});

router.registerLazy({
  name: 'personality',
  aliases: ['pers'],
  description: 'Export and import portable personality files',
  usage: 'secureyeoman personality <list|export|import> [options]',
  loader: () => import('./cli/commands/personality.js').then((m) => m.personalityCommand),
});

router.registerLazy({
  name: 'sandbox',
  aliases: ['sbx'],
  description: 'Sandbox artifact scanning and quarantine management',
  usage: 'secureyeoman sandbox <scan|quarantine|policy|threats|stats> [options]',
  loader: () => import('./cli/commands/sandbox.js').then((m) => m.sandboxCommand),
});

router.registerLazy({
  name: 'sbom',
  aliases: ['bom'],
  description: 'Generate SBOM, compliance mappings, and dependency tracking',
  usage: 'secureyeoman sbom <generate|compliance|deps> [options]',
  loader: () => import('./cli/commands/sbom.js').then((m) => m.sbomCommand),
});

router.registerLazy({
  name: 'verify',
  description: 'Verify binary release integrity (checksum + signature)',
  usage: 'secureyeoman verify <binary> [options]',
  loader: () => import('./cli/commands/verify.js').then((m) => m.verifyCommand),
});

router.registerLazy({
  name: 'workflow',
  aliases: ['wf'],
  description: 'Manage DAG workflows and runs',
  usage: 'secureyeoman workflow <list|show|run|runs|run-detail|cancel|export|import> [options]',
  loader: () => import('./cli/commands/workflow.js').then((m) => m.workflowCommand),
});

router.registerLazy({
  name: 'dlp',
  description: 'Data Loss Prevention — classifications, scanning, egress',
  usage: 'secureyeoman dlp <classifications|scan|policies|egress|anomalies|watermark> [options]',
  loader: () => import('./cli/commands/dlp.js').then((m) => m.dlpCommand),
});

router.registerLazy({
  name: 'audit',
  description: 'Memory audit reports, scheduling, and health',
  usage: 'secureyeoman audit <reports|show|run|schedule|health|approve> [options]',
  loader: () => import('./cli/commands/audit.js').then((m) => m.auditCommand),
});

router.registerLazy({
  name: 'knowledge',
  aliases: ['kb'],
  description: 'Knowledge base — document ingestion and RAG management',
  usage: 'secureyeoman knowledge <list|ingest-url|ingest-file|ingest-text|delete> [options]',
  loader: () => import('./cli/commands/knowledge.js').then((m) => m.knowledgeCommand),
});

router.registerLazy({
  name: 'chaos',
  description: 'Chaos engineering experiments and fault injection',
  usage: 'secureyeoman chaos <list|show|run|abort|results|status> [options]',
  loader: () => import('./cli/commands/chaos.js').then((m) => m.chaosCommand),
});

router.registerLazy({
  name: 'guardrail',
  aliases: ['gr'],
  description: 'Guardrail pipeline — filters, metrics, and content testing',
  usage: 'secureyeoman guardrail <filters|toggle|metrics|reset-metrics|test> [options]',
  loader: () => import('./cli/commands/guardrail.js').then((m) => m.guardrailCommand),
});

router.registerLazy({
  name: 'replay',
  description: 'Agent replay and trace debugging',
  usage: 'secureyeoman replay <list|show|summary|chain|diff|delete> [options]',
  loader: () => import('./cli/commands/replay.js').then((m) => m.replayCommand),
});

router.registerLazy({
  name: 'pac',
  aliases: ['policy-as-code'],
  description: 'Policy-as-Code bundles, deployments, and evaluation',
  usage: 'secureyeoman pac <bundles|show|sync|deploy|deployments|rollback|evaluate> [options]',
  loader: () => import('./cli/commands/pac.js').then((m) => m.pacCommand),
});

router.registerLazy({
  name: 'iac',
  description: 'Infrastructure-as-Code templates and deployments',
  usage: 'secureyeoman iac <templates|show|sync|validate|deployments|repo> [options]',
  loader: () => import('./cli/commands/iac.js').then((m) => m.iacCommand),
});

router.registerLazy({
  name: 'observe',
  aliases: ['obs'],
  description: 'Observability — costs, budgets, SLOs, and SIEM status',
  usage: 'secureyeoman observe <costs|budgets|slos|siem> [options]',
  loader: () => import('./cli/commands/observe.js').then((m) => m.observeCommand),
});

router.registerLazy({
  name: 'alert',
  description: 'Manage alert rules — list, test, and delete',
  usage: 'secureyeoman alert <rules|show|test|delete> [options]',
  loader: () => import('./cli/commands/alert.js').then((m) => m.alertCommand),
});

router.registerLazy({
  name: 'skill',
  aliases: ['marketplace'],
  description: 'Marketplace skills — browse, install, and sync',
  usage: 'secureyeoman skill <list|show|install|uninstall|sync> [options]',
  loader: () => import('./cli/commands/skill.js').then((m) => m.skillCommand),
});

router.registerLazy({
  name: 'federated',
  aliases: ['fl'],
  description: 'Federated learning sessions, participants, and rounds',
  usage: 'secureyeoman federated <sessions|show|pause|resume|cancel|participants|rounds> [options]',
  loader: () => import('./cli/commands/federated.js').then((m) => m.federatedCommand),
});

router.registerLazy({
  name: 'tenant',
  description: 'Multi-tenancy — list, create, and manage tenants',
  usage: 'secureyeoman tenant <list|show|create|delete> [options]',
  loader: () => import('./cli/commands/tenant.js').then((m) => m.tenantCommand),
});

router.registerLazy({
  name: 'break-glass',
  aliases: ['bg'],
  description: 'Break-glass emergency access token (enterprise)',
  usage: 'secureyeoman break-glass [--key <recovery-key>] [--url <url>]',
  loader: () => import('./cli/commands/break-glass.js').then((m) => m.breakGlassCommand),
});

// ── Help command (eager — uses router directly) ────────────────────────────

router.register({
  name: 'help',
  description: 'Show available commands',
  usage: 'secureyeoman help',
  async run() {
    router.printHelp(process.stdout);
    return 0;
  },
});

// ── Resolve and run (with user alias expansion) ─────────────────────────────

let resolved = router.resolve(process.argv);

// If the resolved command is the default (start) but argv[2] doesn't look like
// a start flag, check if it's a user-defined alias before falling through.
if (resolved.command.name === 'start' && process.argv[2] && !process.argv[2].startsWith('-')) {
  // Lazy-import alias resolution to avoid loading fs on every CLI invocation
  // unless we actually need it.
  const { resolveAlias } = await import('./cli/commands/alias.js');
  const expansion = resolveAlias(process.argv[2]);
  if (expansion) {
    // Re-resolve with the expanded tokens + any trailing args
    const expandedArgv = [
      process.argv[0]!,
      process.argv[1]!,
      ...expansion,
      ...process.argv.slice(3),
    ];
    resolved = router.resolve(expandedArgv);
  }
}

const { command, rest } = resolved;

command
  .run({ argv: rest, stdout: process.stdout, stderr: process.stderr })
  .then((code) => {
    if (code !== 0) process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
