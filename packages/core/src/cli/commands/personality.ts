/**
 * Personality Command — export/import portable personality markdown files
 *
 * Sub-commands:
 *   list            List all personalities
 *   export <name>   Export a personality to markdown or JSON
 *   import <file>   Import a personality from a .md or .json file
 */

import { readFileSync, writeFileSync } from 'node:fs';
import type { Command, CommandContext } from '../router.js';
import {
  extractBoolFlag,
  extractCommonFlags,
  extractFlag,
  apiCall,
  colorContext,
} from '../utils.js';

const USAGE = `
Usage: secureyeoman personality <subcommand> [options]

Subcommands:
  list                        List all personalities
  export <name>               Export personality (--format md|json, --output file)
  import <file>               Import personality from .md or .json file

Options:
  --format <md|json>  Export format (default: md)
  --output <file>     Write export to file instead of stdout
  --url <url>         Server URL (default: http://127.0.0.1:3000)
  --token <token>     Auth token
  --json              Output raw JSON
  -h, --help          Show this help
`;

export const personalityCommand: Command = {
  name: 'personality',
  aliases: ['pers'],
  description: 'Export and import portable personality files',
  usage: 'secureyeoman personality <list|export|import> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    const { baseUrl, token, json: jsonOutput, rest } = extractCommonFlags(argv);
    argv = rest;

    const sub = argv[0];
    const args = argv.slice(1);

    try {
      switch (sub) {
        case 'list':
        case 'ls':
          return await runList(ctx, baseUrl, token, jsonOutput);
        case 'export':
        case 'exp':
          return await runExport(ctx, baseUrl, token, jsonOutput, args);
        case 'import':
        case 'imp':
          return await runImport(ctx, baseUrl, token, jsonOutput, args);
        default:
          ctx.stderr.write(`Unknown subcommand: ${sub}\n${USAGE}\n`);
          return 1;
      }
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};

// ── List ─────────────────────────────────────────────────────────

async function runList(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/soul/personalities', { token });
  const { personalities, total } = res.data as {
    personalities: {
      id: string;
      name: string;
      description: string;
      isActive: boolean;
      isDefault: boolean;
    }[];
    total: number;
  };

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify({ personalities, total }, null, 2) + '\n');
    return 0;
  }

  const c = colorContext(ctx.stdout);
  ctx.stdout.write(c.bold(`Personalities (${total})\n`));
  ctx.stdout.write('─'.repeat(72) + '\n');

  for (const p of personalities) {
    const flags: string[] = [];
    if (p.isActive) flags.push(c.green('active'));
    if (p.isDefault) flags.push(c.cyan('default'));
    const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
    ctx.stdout.write(`  ${c.bold(p.name)}${flagStr}\n`);
    ctx.stdout.write(`    ${c.dim(p.id)}  ${p.description.slice(0, 60)}\n`);
  }
  return 0;
}

// ── Export ────────────────────────────────────────────────────────

async function runExport(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  _jsonOutput: boolean,
  args: string[]
): Promise<number> {
  let argv = args;

  const formatResult = extractFlag(argv, 'format', 'f');
  const format = formatResult.value ?? 'md';
  argv = formatResult.rest;

  const outputResult = extractFlag(argv, 'output', 'o');
  const outputFile = outputResult.value;
  argv = outputResult.rest;

  const name = argv[0];
  if (!name) {
    ctx.stderr.write(
      'Usage: secureyeoman personality export <name> [--format md|json] [--output file]\n'
    );
    return 1;
  }

  // Find personality by name
  const listRes = await apiCall(baseUrl, '/api/v1/soul/personalities', { token });
  const { personalities } = listRes.data as {
    personalities: { id: string; name: string }[];
  };
  const match = personalities.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!match) {
    ctx.stderr.write(`Personality not found: ${name}\n`);
    return 1;
  }

  // Fetch export
  const url = `/api/v1/soul/personalities/${match.id}/export?format=${format}`;
  const res = await apiCall(baseUrl, url, { token });

  const content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);

  if (outputFile) {
    writeFileSync(outputFile, content, 'utf-8');
    ctx.stdout.write(`Exported to ${outputFile}\n`);
  } else {
    ctx.stdout.write(content + '\n');
  }
  return 0;
}

// ── Import ────────────────────────────────────────────────────────

async function runImport(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const filePath = args[0];
  if (!filePath) {
    ctx.stderr.write('Usage: secureyeoman personality import <file.md|file.json>\n');
    return 1;
  }

  const content = readFileSync(filePath, 'utf-8');
  const isJson = filePath.toLowerCase().endsWith('.json');

  // For import, we parse locally and POST as JSON to the create endpoint
  // This avoids multipart complexity in the CLI
  if (isJson) {
    const data = JSON.parse(content);
    const res = await apiCall(baseUrl, '/api/v1/soul/personalities', {
      method: 'POST',
      body: data,
      token,
    });
    if (jsonOutput) {
      ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    } else {
      const personality = (res.data as { personality: { name: string; id: string } }).personality;
      ctx.stdout.write(`Imported personality: ${personality.name} (${personality.id})\n`);
    }
    return 0;
  }

  // Markdown: parse locally with the serializer, then POST
  const { PersonalityMarkdownSerializer } = await import('../../soul/personality-serializer.js');
  const serializer = new PersonalityMarkdownSerializer();
  const { data, warnings } = serializer.fromMarkdown(content);

  const res = await apiCall(baseUrl, '/api/v1/soul/personalities', {
    method: 'POST',
    body: data,
    token,
  });

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify({ ...(res.data as object), warnings }, null, 2) + '\n');
  } else {
    const personality = (res.data as { personality: { name: string; id: string } }).personality;
    ctx.stdout.write(`Imported personality: ${personality.name} (${personality.id})\n`);
    if (warnings.length > 0) {
      const c = colorContext(ctx.stdout);
      for (const w of warnings) {
        ctx.stdout.write(`  ${c.yellow('⚠')} ${w}\n`);
      }
    }
  }
  return 0;
}
