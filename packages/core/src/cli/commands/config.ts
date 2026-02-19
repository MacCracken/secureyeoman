/**
 * Config Command — Validate configuration and check secrets.
 *
 * Subcommands:
 *   (none)     Show current config values
 *   validate   Run a full pre-startup validation check (config + secrets)
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag } from '../utils.js';
import { loadConfig, validateSecrets } from '../../config/loader.js';

const USAGE = `
Usage: secureyeoman config [subcommand] [options]

Subcommands:
  (none)      Show current configuration values
  validate    Run pre-startup validation check (config structure + secrets)

Options:
  -c, --config <path>    Config file path (YAML)
      --check-secrets    Validate required environment variables (default command only)
      --json             Output validation result as JSON (validate subcommand only)
  -h, --help             Show this help
`;

export const configCommand: Command = {
  name: 'config',
  aliases: ['cfg'],
  description: 'Validate configuration and check secrets',
  usage: 'secureyeoman config [validate] [--config PATH]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    // Route to subcommand if first positional arg matches
    if (argv[0] === 'validate') {
      return runValidate(ctx, argv.slice(1));
    }

    // Default: show config info (existing behaviour)
    const configPathResult = extractFlag(argv, 'config', 'c');
    argv = configPathResult.rest;
    const checkSecretsResult = extractBoolFlag(argv, 'check-secrets');

    try {
      const config = loadConfig({
        configPath: configPathResult.value,
      });

      ctx.stdout.write(`Configuration valid.\n\n`);
      ctx.stdout.write(`  Environment:  ${config.core.environment}\n`);
      ctx.stdout.write(`  Gateway:      ${config.gateway.host}:${String(config.gateway.port)}\n`);
      ctx.stdout.write(`  Provider:     ${config.model.provider}\n`);
      ctx.stdout.write(`  Model:        ${config.model.model}\n`);
      ctx.stdout.write(`  Data dir:     ${config.core.dataDir}\n`);
      ctx.stdout.write(`  Workspace:    ${config.core.workspace}\n`);
      ctx.stdout.write(`  Log level:    ${config.logging.level}\n`);
      ctx.stdout.write(
        `  Sandbox:      ${config.security.sandbox.enabled ? 'enabled' : 'disabled'}\n`
      );
      ctx.stdout.write(
        `  Encryption:   ${config.security.encryption.enabled ? 'enabled' : 'disabled'}\n`
      );
      ctx.stdout.write('\n');

      if (checkSecretsResult.value) {
        try {
          validateSecrets(config);
          ctx.stdout.write('All required secrets are set.\n');
        } catch (err) {
          ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
          return 1;
        }
      }

      return 0;
    } catch (err) {
      ctx.stderr.write(
        `Configuration error:\n${err instanceof Error ? err.message : String(err)}\n`
      );
      return 1;
    }
  },
};

async function runValidate(ctx: CommandContext, argv: string[]): Promise<number> {
  const helpResult = extractBoolFlag(argv, 'help', 'h');
  if (helpResult.value) {
    ctx.stdout.write(`
Usage: secureyeoman config validate [options]

Run a full pre-startup validation check: config structure + all required secrets.
Exits 0 if everything is valid, 1 if any check fails. Suitable for CI/CD pipelines.

Options:
  -c, --config <path>    Config file path (YAML)
      --json             Output result as JSON
  -h, --help             Show this help
\n`);
    return 0;
  }
  argv = helpResult.rest;

  const configPathResult = extractFlag(argv, 'config', 'c');
  argv = configPathResult.rest;
  const jsonResult = extractBoolFlag(argv, 'json');

  const checks: { name: string; passed: boolean; error?: string }[] = [];
  let config: ReturnType<typeof loadConfig> | undefined;

  // Check 1: Config structure
  try {
    config = loadConfig({ configPath: configPathResult.value });
    checks.push({ name: 'config_structure', passed: true });
  } catch (err) {
    checks.push({
      name: 'config_structure',
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Check 2: Required secrets (only if config loaded)
  if (config) {
    try {
      validateSecrets(config);
      checks.push({ name: 'required_secrets', passed: true });
    } catch (err) {
      checks.push({
        name: 'required_secrets',
        passed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    checks.push({
      name: 'required_secrets',
      passed: false,
      error: 'Skipped — config failed to load',
    });
  }

  const allPassed = checks.every((c) => c.passed);

  if (jsonResult.value) {
    ctx.stdout.write(
      JSON.stringify({ valid: allPassed, checks }, null, 2) + '\n'
    );
    return allPassed ? 0 : 1;
  }

  ctx.stdout.write('\nSecureYeoman Configuration Validation\n');
  ctx.stdout.write('─'.repeat(40) + '\n\n');

  for (const check of checks) {
    const mark = check.passed ? '✓' : '✗';
    const label = check.name.replace(/_/g, ' ');
    ctx.stdout.write(`  ${mark}  ${label}\n`);
    if (!check.passed && check.error) {
      ctx.stdout.write(`       ${check.error}\n`);
    }
  }

  ctx.stdout.write('\n');
  if (allPassed) {
    ctx.stdout.write('Result: PASS — ready to start\n\n');
  } else {
    ctx.stdout.write('Result: FAIL — fix the issues above before starting\n\n');
  }

  return allPassed ? 0 : 1;
}
