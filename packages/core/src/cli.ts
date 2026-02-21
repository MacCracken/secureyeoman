#!/usr/bin/env node
/**
 * SecureYeoman CLI — Modular command router entry point.
 *
 * Usage:
 *   secureyeoman                      # Start with defaults
 *   secureyeoman start --port 3001    # Custom port
 *   secureyeoman health               # Health check
 *   secureyeoman status               # Server overview
 *   secureyeoman init                 # Interactive onboarding (Phase 18)
 *   secureyeoman config               # Show config
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
 *   secureyeoman model                # AI model management (info, list, switch, default)
 *   secureyeoman policy               # Security policy management (get, set, dynamic-tools)
 *   secureyeoman completion           # Generate shell completion scripts (bash, zsh, fish)
 *   secureyeoman plugin               # Manage integration plugins (list, info, add, remove)
 *   secureyeoman security             # Manage Kali security toolkit container (setup, teardown, update, status)
 *   secureyeoman agnostic             # Manage Agnostic QA sub-agent team Docker Compose stack (start, stop, status, logs, pull)
 *   secureyeoman tui                  # Full-screen terminal dashboard (status, chat, memory)
 */

import { createRouter } from './cli/router.js';
import { startCommand } from './cli/commands/start.js';
import { healthCommand } from './cli/commands/health.js';
import { configCommand } from './cli/commands/config.js';
import { integrationCommand } from './cli/commands/integration.js';
import { replCommand } from './cli/commands/repl.js';
import { initCommand } from './cli/commands/init.js';
import { statusCommand } from './cli/commands/status.js';
import { roleCommand } from './cli/commands/role.js';
import { extensionCommand } from './cli/commands/extension.js';
import { executeCommand } from './cli/commands/execute.js';
import { a2aCommand } from './cli/commands/a2a.js';
import { browserCommand } from './cli/commands/browser.js';
import { memoryCommand } from './cli/commands/memory.js';
import { scraperCommand } from './cli/commands/scraper.js';
import { multimodalCommand } from './cli/commands/multimodal.js';
import { modelCommand } from './cli/commands/model.js';
import { policyCommand } from './cli/commands/policy.js';
import { completionCommand } from './cli/commands/completion.js';
import { pluginCommand } from './cli/commands/plugin.js';
import { mcpServerCommand } from './cli/commands/mcp-server.js';
import { migrateCommand } from './cli/commands/migrate.js';
import { securityCommand } from './cli/commands/security.js';
import { agnosticCommand } from './cli/commands/agnostic.js';
import { tuiCommand } from './cli/commands/tui.js';

const router = createRouter('start');

// Register all commands
router.register(startCommand);
router.register(healthCommand);
router.register(configCommand);
router.register(integrationCommand);
router.register(replCommand);
router.register(initCommand);
router.register(statusCommand);
router.register(roleCommand);
router.register(extensionCommand);
router.register(executeCommand);
router.register(a2aCommand);
router.register(browserCommand);
router.register(memoryCommand);
router.register(scraperCommand);
router.register(multimodalCommand);
router.register(modelCommand);
router.register(policyCommand);
router.register(completionCommand);
router.register(pluginCommand);
router.register(mcpServerCommand);
router.register(migrateCommand);
router.register(securityCommand);
router.register(agnosticCommand);
router.register(tuiCommand);

// Help command
router.register({
  name: 'help',
  description: 'Show available commands',
  usage: 'secureyeoman help',
  async run() {
    router.printHelp(process.stdout);
    return 0;
  },
});

// Resolve and run
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
