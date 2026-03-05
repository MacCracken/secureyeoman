/**
 * SBOM Command — Generate CycloneDX Software Bill of Materials.
 *
 * Sub-commands:
 *   generate         Generate CycloneDX SBOM (default)
 *   compliance       Show compliance framework mapping
 *   deps             Track dependency provenance changes
 *   deps baseline    Update dependency tracking baseline
 */

import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag, extractFlag } from '../utils.js';

const USAGE = `
Usage: secureyeoman sbom <subcommand> [options]

Subcommands:
  generate            Generate CycloneDX 1.5 SBOM (default)
  compliance          Show compliance framework control mapping
  deps                Track dependency provenance changes
  deps baseline       Update dependency tracking baseline

Options (generate):
  --dir <path>        Root directory (default: current directory)
  --include-dev       Include dev dependencies
  --output <file>     Write to file instead of stdout

Options (compliance):
  --framework <name>  Filter: nist-800-53, soc2, iso27001, hipaa, eu-ai-act
  --format <fmt>      Output: json, md (default: md)

Options (deps):
  --dir <path>        Root directory (default: current directory)

General:
  --json              Output raw JSON
  -h, --help          Show this help
`;

export const sbomCommand: Command = {
  name: 'sbom',
  aliases: ['bom'],
  description: 'Generate SBOM, compliance mappings, and dependency tracking',
  usage: 'secureyeoman sbom <generate|compliance|deps> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    const sub = argv[0];

    if (!sub || sub === 'generate') {
      return runGenerate(ctx, argv.slice(sub ? 1 : 0));
    }

    if (sub === 'compliance') {
      return runCompliance(ctx, argv.slice(1));
    }

    if (sub === 'deps') {
      return runDeps(ctx, argv.slice(1));
    }

    ctx.stderr.write(`Unknown subcommand: ${sub}\n${USAGE}\n`);
    return 1;
  },
};

async function runGenerate(ctx: CommandContext, argv: string[]): Promise<number> {
  const { generateSbom } = await import('../../supply-chain/sbom-generator.js');
  const { colorContext } = await import('../utils.js');

  const dirResult = extractFlag(argv, 'dir');
  argv = dirResult.rest;
  const includeDevResult = extractBoolFlag(argv, 'include-dev');
  argv = includeDevResult.rest;
  const outputResult = extractFlag(argv, 'output');

  try {
    const sbom = generateSbom({
      rootDir: dirResult.value,
      includeDev: includeDevResult.value,
    });

    const json = JSON.stringify(sbom, null, 2);

    if (outputResult.value) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(outputResult.value, json, 'utf-8');
      const c = colorContext(ctx.stdout);
      ctx.stdout.write(`${c.green('✓')} SBOM written to ${outputResult.value}\n`);
      ctx.stdout.write(`  Components: ${sbom.components.length}\n`);
      ctx.stdout.write(`  Format: CycloneDX ${sbom.specVersion}\n`);
    } else {
      ctx.stdout.write(json + '\n');
    }

    return 0;
  } catch (err: unknown) {
    ctx.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

async function runCompliance(ctx: CommandContext, argv: string[]): Promise<number> {
  const { getComplianceMappings, getAllFrameworkSummaries, formatMappingMarkdown, ALL_FRAMEWORKS } =
    await import('../../supply-chain/compliance-mapping.js');
  const { colorContext } = await import('../utils.js');

  const frameworkResult = extractFlag(argv, 'framework');
  argv = frameworkResult.rest;
  const formatResult = extractFlag(argv, 'format');
  argv = formatResult.rest;
  const jsonResult = extractBoolFlag(argv, 'json');

  const framework = frameworkResult.value as import('../../supply-chain/compliance-mapping.js').ComplianceFramework | undefined;
  const format = formatResult.value ?? (jsonResult.value ? 'json' : 'md');

  if (framework && !ALL_FRAMEWORKS.includes(framework)) {
    ctx.stderr.write(`Unknown framework: ${framework}\nAvailable: ${ALL_FRAMEWORKS.join(', ')}\n`);
    return 1;
  }

  if (format === 'json') {
    const mappings = getComplianceMappings(framework);
    const summaries = getAllFrameworkSummaries();
    ctx.stdout.write(JSON.stringify({ summaries, mappings }, null, 2) + '\n');
    return 0;
  }

  // Markdown output with summary table
  const c = colorContext(ctx.stdout);
  const summaries = getAllFrameworkSummaries();

  if (!framework) {
    ctx.stdout.write('\n  Compliance Framework Coverage\n\n');
    for (const s of summaries) {
      const pct = s.coveragePercent;
      const color = pct === 100 ? c.green : pct >= 80 ? c.yellow : c.red;
      ctx.stdout.write(
        `    ${s.framework.padEnd(14)} ${color(`${pct}%`)} (${s.implemented}/${s.total} controls)\n`
      );
    }
    ctx.stdout.write(`\n  Use --framework <name> for detailed mapping.\n\n`);
  } else {
    const md = formatMappingMarkdown(framework);
    ctx.stdout.write(md);
  }

  return 0;
}

async function runDeps(ctx: CommandContext, argv: string[]): Promise<number> {
  const dirResult = extractFlag(argv, 'dir');
  argv = dirResult.rest;
  const jsonResult = extractBoolFlag(argv, 'json');
  argv = jsonResult.rest;

  const rootDir = dirResult.value ?? process.cwd();
  const sub = argv[0];

  // Update baseline
  if (sub === 'baseline') {
    const { updateBaseline } = await import('../../supply-chain/dependency-tracker.js');
    const { colorContext } = await import('../utils.js');
    try {
      updateBaseline(rootDir);
      const c = colorContext(ctx.stdout);
      ctx.stdout.write(`${c.green('✓')} Dependency baseline updated\n`);
      return 0;
    } catch (err: unknown) {
      ctx.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  }

  // Track changes
  const { trackDependencies } = await import('../../supply-chain/dependency-tracker.js');
  const { colorContext } = await import('../utils.js');

  try {
    const result = trackDependencies(rootDir);

    if (jsonResult.value) {
      ctx.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return 0;
    }

    const c = colorContext(ctx.stdout);

    if (result.baselineCreated) {
      ctx.stdout.write(`${c.green('✓')} Dependency baseline created (first run)\n`);
      return 0;
    }

    const { diff, alerts } = result;
    const totalChanges = diff.added.length + diff.removed.length + diff.versionChanged.length;

    if (totalChanges === 0 && alerts.length === 0) {
      ctx.stdout.write(`${c.green('✓')} No dependency changes detected\n`);
      return 0;
    }

    ctx.stdout.write('\n  Dependency Provenance Report\n\n');

    if (diff.added.length > 0) {
      ctx.stdout.write(`  ${c.green('+')} Added: ${diff.added.length}\n`);
    }
    if (diff.removed.length > 0) {
      ctx.stdout.write(`  ${c.red('-')} Removed: ${diff.removed.length}\n`);
    }
    if (diff.versionChanged.length > 0) {
      ctx.stdout.write(`  ${c.yellow('~')} Changed: ${diff.versionChanged.length}\n`);
    }

    if (alerts.length > 0) {
      ctx.stdout.write('\n  Alerts:\n');
      for (const alert of alerts) {
        const levelColor =
          alert.level === 'critical' ? c.red :
          alert.level === 'high' ? c.red :
          alert.level === 'medium' ? c.yellow :
          c.dim;
        ctx.stdout.write(`    ${levelColor(`[${alert.level.toUpperCase()}]`)} ${alert.message}\n`);
      }
    }

    ctx.stdout.write(`\n  Run 'secureyeoman sbom deps baseline' to accept changes.\n\n`);

    // Non-zero exit if critical/high alerts
    const hasCritical = alerts.some((a) => a.level === 'critical' || a.level === 'high');
    return hasCritical ? 1 : 0;
  } catch (err: unknown) {
    ctx.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
