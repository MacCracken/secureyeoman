#!/usr/bin/env node
/**
 * SecureYeoman Agent CLI — Standalone entry point for agent binary (Tier 2.5).
 *
 * This is a separate entry point from the main cli.ts, importing only
 * the agent runtime and its dependencies. Bun's tree-shaking will exclude
 * brain, training, analytics, simulation, dashboard, marketplace, etc.,
 * resulting in a smaller binary than full SY but larger than edge.
 *
 * Usage:
 *   secureyeoman-agent start [options]
 *   secureyeoman-agent start --personality FRIDAY
 *   secureyeoman-agent register --parent URL
 *   secureyeoman-agent status
 */

import { agentCommand } from '../cli/commands/agent.js';

const argv = process.argv.slice(2);

// If no subcommand or --help, show help
if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
  await agentCommand.run({
    argv: ['--help'],
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(0);
}

// If --version
if (argv[0] === '--version' || argv[0] === '-v') {
  const { VERSION } = await import('../version.js');
  process.stdout.write(`secureyeoman-agent v${VERSION}\n`);
  process.exit(0);
}

// Run the agent command directly
const exitCode = await agentCommand.run({
  argv,
  stdout: process.stdout,
  stderr: process.stderr,
});

process.exit(exitCode);
