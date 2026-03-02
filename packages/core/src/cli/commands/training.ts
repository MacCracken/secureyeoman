/**
 * Training Command — Export conversations and memories as training datasets.
 */

import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import type { Command, CommandContext } from '../router.js';
import {
  extractFlag,
  extractBoolFlag,
  extractCommonFlags,
  apiCall,
  colorContext,
  handleLicenseError,
} from '../utils.js';

const USAGE = `
Usage: secureyeoman training [--url URL] [--token TOKEN] [--json] <action> [options]

Actions:
  export                        Export training dataset (streams to stdout or --out file)
  stats                         Show dataset counts (conversations, memories, knowledge)

Export options:
  --format <fmt>                Output format: sharegpt (default), instruction, raw
  --out <path>                  Write to file instead of stdout
  --from <ms>                   Start timestamp (milliseconds since epoch)
  --to <ms>                     End timestamp (milliseconds since epoch)
  --personality-id <id>         Filter to one personality (repeatable)
  --limit <n>                   Max conversations to export (default 10000)

Options:
  --url <url>                   Server URL (default: http://127.0.0.1:3000)
  --token <token>               Auth token
  --json                        Output raw JSON (for stats action)
  -h, --help                    Show this help

Formats:
  sharegpt      ShareGPT JSONL — recommended for chat fine-tuning with LLaMA Factory,
                Unsloth, or axolotl. Each line: {"conversations":[{"from","value"},...]}
  instruction   Alpaca-style instruction JSONL. Each user/assistant pair becomes
                {"instruction":"...","output":"..."}. Good for SFT on instruction models.
  raw           Plain text corpus. Each conversation as labelled blocks. Use for
                unsupervised pre-training or SimCSE/contrastive embedding training.
`;

export const trainingCommand: Command = {
  name: 'training',
  aliases: ['train'],
  description: 'Export conversations and memories as LLM training datasets',
  usage: 'secureyeoman training <export|stats> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;
    const { green, bold, dim } = colorContext(ctx.stdout);

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    const { baseUrl, token, json: jsonOutput, rest: argvRest } = extractCommonFlags(argv);
    argv = argvRest;

    const formatResult = extractFlag(argv, 'format');
    argv = formatResult.rest;
    const outResult = extractFlag(argv, 'out');
    argv = outResult.rest;
    const fromResult = extractFlag(argv, 'from');
    argv = fromResult.rest;
    const toResult = extractFlag(argv, 'to');
    argv = toResult.rest;
    const limitResult = extractFlag(argv, 'limit');
    argv = limitResult.rest;

    // Collect all --personality-id values
    const personalityIds: string[] = [];
    for (;;) {
      const r = extractFlag(argv, 'personality-id');
      if (!r.value) break;
      personalityIds.push(r.value);
      argv = r.rest;
    }

    const action = argv[0];

    try {
      switch (action) {
        case 'stats': {
          const result = await apiCall(baseUrl, '/api/v1/training/stats', { token });
          if (!result.ok) {
            if (handleLicenseError(result, ctx.stderr)) return 1;
            ctx.stderr.write(`Failed to get training stats (${result.status})\n`);
            return 1;
          }
          const data = result.data as {
            conversations: number;
            memories: number;
            knowledge: number;
          };
          if (jsonOutput) {
            ctx.stdout.write(JSON.stringify(data) + '\n');
          } else {
            ctx.stdout.write(bold('Training dataset stats\n'));
            ctx.stdout.write(`  ${dim('Conversations:')} ${green(String(data.conversations))}\n`);
            ctx.stdout.write(`  ${dim('Memories:')}      ${green(String(data.memories))}\n`);
            ctx.stdout.write(`  ${dim('Knowledge:')}     ${green(String(data.knowledge))}\n`);
          }
          return 0;
        }

        case 'export': {
          const fmt = formatResult.value ?? 'sharegpt';
          if (!['sharegpt', 'instruction', 'raw'].includes(fmt)) {
            ctx.stderr.write(`Invalid format: ${fmt}. Must be sharegpt, instruction, or raw\n`);
            return 1;
          }

          const body: Record<string, unknown> = { format: fmt };
          if (fromResult.value) body.from = Number(fromResult.value);
          if (toResult.value) body.to = Number(toResult.value);
          if (personalityIds.length) body.personalityIds = personalityIds;
          if (limitResult.value) body.limit = Number(limitResult.value);

          const outPath = outResult.value;
          const dest = outPath ? createWriteStream(resolve(outPath)) : ctx.stdout;

          if (!jsonOutput && outPath) {
            ctx.stderr.write(`Exporting ${fmt} to ${outPath}...\n`);
          }

          // Stream the response body to destination
          const response = await fetch(`${baseUrl}/api/v1/training/export`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const err = (await response.json()) as { message?: string };
            ctx.stderr.write(`Export failed: ${err.message ?? response.statusText}\n`);
            return 1;
          }

          if (!response.body) {
            ctx.stderr.write('No response body received\n');
            return 1;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            dest.write(decoder.decode(value, { stream: true }));
          }

          if (outPath && dest !== ctx.stdout) {
            (dest as ReturnType<typeof createWriteStream>).end();
            ctx.stderr.write('Export complete.\n');
          }

          return 0;
        }

        default:
          ctx.stderr.write(`Unknown action: ${String(action)}\n${USAGE}\n`);
          return 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.stderr.write(`Error: ${msg}\n`);
      return 1;
    }
  },
};
