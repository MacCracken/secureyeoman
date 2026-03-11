#!/usr/bin/env node
/**
 * SecureYeoman Edge CLI — Minimal entry point for edge/IoT binary.
 *
 * This is a separate entry point from the main cli.ts, importing only
 * the edge runtime and its dependencies. Bun's tree-shaking will exclude
 * all unused modules (brain, soul, spirit, marketplace, dashboard, etc.)
 * resulting in a significantly smaller binary.
 *
 * Usage:
 *   secureyeoman-edge start [options]
 *   secureyeoman-edge register --parent URL
 *   secureyeoman-edge status
 */

import { edgeCommand } from '../cli/commands/edge.js';

const argv = process.argv.slice(2);

// If no subcommand or --help, show help
if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
  await edgeCommand.run({
    argv: ['--help'],
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(0);
}

// If --version
if (argv[0] === '--version' || argv[0] === '-v') {
  const { VERSION } = await import('../version.js');
  process.stdout.write(`secureyeoman-edge v${VERSION}\n`);
  process.exit(0);
}

// Run the edge command directly (argv already has subcommand as first element)
const exitCode = await edgeCommand.run({
  argv,
  stdout: process.stdout,
  stderr: process.stderr,
});

process.exit(exitCode);
