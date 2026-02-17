#!/usr/bin/env node
/**
 * SecureYeoman CLI — Modular command router entry point.
 *
 * Usage:
 *   secureyeoman                      # Start with defaults
 *   secureyeoman start --port 3001    # Custom port
 *   secureyeoman health               # Health check
 *   secureyeoman status               # Server overview
 *   secureyeoman init                 # Interactive onboarding
 *   secureyeoman config               # Show config
 *   secureyeoman integration          # Manage integrations
 *   secureyeoman role                 # Manage RBAC roles & assignments
 *   secureyeoman extension            # Manage lifecycle hooks
 *   secureyeoman execute              # Sandboxed code execution
 *   secureyeoman a2a                  # A2A protocol management
 *   secureyeoman repl                 # Interactive REPL
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
