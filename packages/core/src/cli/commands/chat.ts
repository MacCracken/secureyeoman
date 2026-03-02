/**
 * Chat Command — Send a message to a personality and receive a response.
 *
 * Supports Unix-style piping: reads from stdin when not a TTY, writes clean
 * output to stdout when piped. Enables composable workflows:
 *   cat report.txt | secureyeoman chat -p friday
 *   secureyeoman chat -p friday "Analyze this" | secureyeoman chat -p t-ron "Summarize"
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import type { Command, CommandContext } from '../router.js';
import {
  extractFlag,
  extractBoolFlag,
  extractCommonFlags,
  apiCall,
  colorContext,
  Spinner,
} from '../utils.js';

const USAGE = `
Usage: secureyeoman chat [options] [message]

Send a message to a personality and receive a response. Reads from stdin
when input is piped (not a TTY).

Options:
  -p, --personality <name|id>   Personality to chat with (default: active)
  --strategy <slug>             Reasoning strategy to apply
  --dry-run                     Preview the composed prompt without sending
  -o, --output <path>           Write response to file
  -c, --copy                    Copy response to system clipboard
  --format <fmt>                Output format: markdown (default), json, plain
  --url <url>                   Server URL (default: http://127.0.0.1:3000)
  --token <token>               Auth token
  -h, --help                    Show this help

Examples:
  secureyeoman chat -p friday "What is STRIDE?"
  cat report.txt | secureyeoman chat -p friday
  secureyeoman chat -p friday --dry-run "Test prompt"
  secureyeoman chat -p friday -o response.md "Analyze this threat"
  secureyeoman chat -p friday --format json "Hello"
`;

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8').trim()));
    process.stdin.on('error', reject);
  });
}

function copyToClipboard(text: string): boolean {
  try {
    const os = platform();
    if (os === 'darwin') {
      execSync('pbcopy', { input: text });
    } else if (os === 'win32') {
      execSync('clip', { input: text });
    } else {
      // Linux: try xclip first, fall back to xsel
      try {
        execSync('xclip -selection clipboard', { input: text });
      } catch {
        execSync('xsel --clipboard --input', { input: text });
      }
    }
    return true;
  } catch {
    return false;
  }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')         // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
    .replace(/\*(.+?)\*/g, '$1')       // italic
    .replace(/__(.+?)__/g, '$1')       // bold alt
    .replace(/_(.+?)_/g, '$1')         // italic alt
    .replace(/`{3}[\s\S]*?`{3}/g, (m) => m.replace(/`{3}\w*\n?/g, '')) // code blocks
    .replace(/`(.+?)`/g, '$1')         // inline code
    .replace(/^\s*[-*+]\s+/gm, '  ')   // list items
    .replace(/^\s*\d+\.\s+/gm, '  ')   // ordered list items
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/^>\s+/gm, '');            // blockquotes
}

export const chatCommand: Command = {
  name: 'chat',
  description: 'Send a message to a personality',
  usage: 'secureyeoman chat [options] [message]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;
    const isTTY = (ctx.stdout as NodeJS.WriteStream).isTTY;
    const { green, dim, red, bold } = colorContext(ctx.stdout);

    // Help
    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    // Common flags
    const { baseUrl, token, rest: argvRest } = extractCommonFlags(argv);
    argv = argvRest;

    // Remove --json (extractCommonFlags consumes it but we don't use it directly)
    // Chat-specific flags
    const personalityResult = extractFlag(argv, 'personality', 'p');
    argv = personalityResult.rest;

    const strategyResult = extractFlag(argv, 'strategy');
    argv = strategyResult.rest;

    const dryRunResult = extractBoolFlag(argv, 'dry-run');
    argv = dryRunResult.rest;

    const outputResult = extractFlag(argv, 'output', 'o');
    argv = outputResult.rest;

    const copyResult = extractBoolFlag(argv, 'copy', 'c');
    argv = copyResult.rest;

    const formatResult = extractFlag(argv, 'format');
    argv = formatResult.rest;

    const personality = personalityResult.value;
    const strategy = strategyResult.value;
    const dryRun = dryRunResult.value;
    const outputPath = outputResult.value;
    const copyToClip = copyResult.value;
    const format = formatResult.value ?? 'markdown';

    if (!['markdown', 'json', 'plain'].includes(format)) {
      ctx.stderr.write(`Invalid format: ${format}. Must be markdown, json, or plain\n`);
      return 1;
    }

    // Collect message: remaining argv joined, or stdin if not a TTY
    let message = argv.join(' ').trim();

    if (!message && typeof process !== 'undefined' && process.stdin && !process.stdin.isTTY) {
      message = await readStdin();
    }

    if (!message) {
      ctx.stderr.write('No message provided. Pass a message as an argument or pipe via stdin.\n');
      ctx.stderr.write(USAGE + '\n');
      return 1;
    }

    try {
      // Dry run: show the composed prompt without sending
      if (dryRun) {
        const params = new URLSearchParams();
        if (personality) params.set('personalityId', personality);
        if (strategy) params.set('strategyId', strategy);
        params.set('message', message);

        const result = await apiCall(baseUrl, `/api/v1/chat/preview?${params.toString()}`, {
          token,
        });

        if (!result.ok) {
          // Fallback: just show the message with metadata
          if (isTTY) ctx.stdout.write(bold('--- DRY RUN ---\n'));
          if (personality) ctx.stdout.write(`${dim('Personality:')} ${personality}\n`);
          if (strategy) ctx.stdout.write(`${dim('Strategy:')} ${strategy}\n`);
          ctx.stdout.write(`${dim('Message:')}\n${message}\n`);
          if (isTTY) ctx.stdout.write(bold('--- END DRY RUN ---\n'));
        } else {
          const data = result.data as { prompt?: string };
          ctx.stdout.write(data.prompt ?? JSON.stringify(data, null, 2));
          ctx.stdout.write('\n');
        }
        return 0;
      }

      // Send the chat request
      const spinner = new Spinner(ctx.stderr);
      if (isTTY) spinner.start('Thinking...');

      const body: Record<string, unknown> = { message };
      if (personality) body.personalityId = personality;
      if (strategy) body.strategyId = strategy;

      const startTime = Date.now();
      const result = await apiCall(baseUrl, '/api/v1/chat', {
        method: 'POST',
        body,
        token,
      });
      const elapsed = Date.now() - startTime;

      if (!result.ok) {
        if (isTTY) spinner.stop('Failed', false);

        // Enterprise license guard
        if (result.status === 402) {
          const data = result.data as { error?: string; feature?: string };
          ctx.stderr.write(
            `This command requires an Enterprise license (feature: ${data.feature ?? 'unknown'}).\n` +
            'Run `secureyeoman license status` to check your current tier.\n',
          );
          return 1;
        }

        const data = result.data as { message?: string };
        ctx.stderr.write(`Chat failed (${result.status}): ${data.message ?? 'Unknown error'}\n`);
        return 1;
      }

      if (isTTY) spinner.stop('Done', true);

      const data = result.data as {
        response: string;
        conversationId?: string;
        model?: string;
        tokensUsed?: { input?: number; output?: number };
      };

      const responseText = data.response ?? '';

      // Format output
      let output: string;
      switch (format) {
        case 'json':
          output = JSON.stringify({
            response: responseText,
            conversationId: data.conversationId ?? null,
            model: data.model ?? null,
            personality: personality ?? null,
            strategy: strategy ?? null,
            tokensUsed: data.tokensUsed ?? null,
            elapsedMs: elapsed,
          }, null, 2);
          break;
        case 'plain':
          output = stripMarkdown(responseText);
          break;
        default: // markdown
          output = responseText;
      }

      // Write to stdout
      ctx.stdout.write(output);
      if (!output.endsWith('\n')) ctx.stdout.write('\n');

      // Write to file if requested
      if (outputPath) {
        writeFileSync(resolve(outputPath), output + '\n', 'utf-8');
        if (isTTY) ctx.stderr.write(`${dim('Written to')} ${green(outputPath)}\n`);
      }

      // Copy to clipboard if requested
      if (copyToClip) {
        const copied = copyToClipboard(output);
        if (isTTY) {
          ctx.stderr.write(
            copied
              ? `${dim('Copied to clipboard')}\n`
              : `${red('Failed to copy to clipboard — install xclip or xsel')}\n`,
          );
        }
      }

      // Show metadata on TTY
      if (isTTY && format !== 'json') {
        const parts: string[] = [];
        if (data.model) parts.push(`model: ${data.model}`);
        if (data.tokensUsed?.input) parts.push(`in: ${data.tokensUsed.input}`);
        if (data.tokensUsed?.output) parts.push(`out: ${data.tokensUsed.output}`);
        parts.push(`${elapsed}ms`);
        ctx.stderr.write(dim(`  [${parts.join(' | ')}]\n`));
      }

      return 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.stderr.write(`Error: ${msg}\n`);
      return 1;
    }
  },
};
