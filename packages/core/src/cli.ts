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
  description: 'Validate configuration and check secrets',
  usage: 'secureyeoman config [validate] [--config PATH]',
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
  loader: () =>
    import('./cli/commands/integration.js').then((m) => m.integrationCommand),
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
  loader: () =>
    import('./cli/commands/extension.js').then((m) => m.extensionCommand),
});

router.registerLazy({
  name: 'execute',
  description: 'Sandboxed code execution',
  usage: 'secureyeoman execute <subcommand> [options]',
  loader: () =>
    import('./cli/commands/execute.js').then((m) => m.executeCommand),
});

router.registerLazy({
  name: 'a2a',
  description: 'Agent-to-Agent protocol management',
  usage: 'secureyeoman a2a <subcommand> [options]',
  loader: () => import('./cli/commands/a2a.js').then((m) => m.a2aCommand),
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
  loader: () =>
    import('./cli/commands/browser.js').then((m) => m.browserCommand),
});

router.registerLazy({
  name: 'memory',
  aliases: ['mem'],
  description: 'Manage vector memory and brain operations',
  usage: 'secureyeoman memory <search|memories|knowledge|stats|consolidate>',
  loader: () =>
    import('./cli/commands/memory.js').then((m) => m.memoryCommand),
});

router.registerLazy({
  name: 'scraper',
  aliases: ['sc'],
  description: 'Manage web scraping and MCP web tools',
  usage: 'secureyeoman scraper <config|tools|servers>',
  loader: () =>
    import('./cli/commands/scraper.js').then((m) => m.scraperCommand),
});

router.registerLazy({
  name: 'multimodal',
  aliases: ['mm'],
  description: 'Manage multimodal I/O operations (vision, audio, image generation)',
  usage: 'secureyeoman multimodal <config|jobs>',
  loader: () =>
    import('./cli/commands/multimodal.js').then((m) => m.multimodalCommand),
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
  loader: () =>
    import('./cli/commands/policy.js').then((m) => m.policyCommand),
});

router.registerLazy({
  name: 'completion',
  description: 'Generate shell completion scripts',
  usage: 'secureyeoman completion <bash|zsh|fish>',
  loader: () =>
    import('./cli/commands/completion.js').then((m) => m.completionCommand),
});

router.registerLazy({
  name: 'plugin',
  description: 'Manage integration plugins',
  usage: 'secureyeoman plugin <action> [options]',
  loader: () =>
    import('./cli/commands/plugin.js').then((m) => m.pluginCommand),
});

router.registerLazy({
  name: 'mcp-server',
  description: 'Start the MCP (Model Context Protocol) server',
  usage: 'secureyeoman mcp-server [options]',
  loader: () =>
    import('./cli/commands/mcp-server.js').then((m) => m.mcpServerCommand),
});

router.registerLazy({
  name: 'migrate',
  description: 'Run database migrations and exit',
  usage: 'secureyeoman migrate [--help]',
  loader: () =>
    import('./cli/commands/migrate.js').then((m) => m.migrateCommand),
});

router.registerLazy({
  name: 'security',
  aliases: ['sec'],
  description: 'Manage the Kali security toolkit container',
  usage: 'secureyeoman security <setup|teardown|update|status>',
  loader: () =>
    import('./cli/commands/security.js').then((m) => m.securityCommand),
});

router.registerLazy({
  name: 'mcp-quickbooks',
  aliases: ['mcp-qbo'],
  description: 'Manage the QuickBooks Online MCP toolset',
  usage: 'secureyeoman mcp-quickbooks <status|enable|disable>',
  loader: () =>
    import('./cli/commands/mcp-quickbooks.js').then((m) => m.mcpQuickbooksCommand),
});

router.registerLazy({
  name: 'agnostic',
  aliases: ['ag'],
  description: 'Manage the Agnostic QA sub-agent team Docker Compose stack',
  usage: 'secureyeoman agnostic <start|stop|status|logs|pull> [options]',
  loader: () =>
    import('./cli/commands/agnostic.js').then((m) => m.agnosticCommand),
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
  loader: () =>
    import('./cli/commands/agents.js').then((m) => m.agentsCommand),
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

// ── Resolve and run ────────────────────────────────────────────────────────

const { command, rest } = router.resolve(process.argv);

command
  .run({ argv: rest, stdout: process.stdout, stderr: process.stderr })
  .then((code) => {
    if (code !== 0) process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
