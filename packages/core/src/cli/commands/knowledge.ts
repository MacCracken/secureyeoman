/**
 * CLI — knowledge command
 *
 * Subcommands: list, ingest-url, ingest-file, ingest-text, delete
 */

import type { Command, CommandContext } from '../router.js';
import {
  extractBoolFlag,
  extractCommonFlags,
  extractFlag,
  apiCall,
  colorContext,
} from '../utils.js';

const USAGE = `
Usage: secureyeoman knowledge <subcommand> [options]

Subcommands:
  list                     List ingested documents
  ingest-url <url> [--depth N]  Ingest content from URL
  ingest-file <file>       Ingest a local file (PDF, MD, HTML, TXT)
  ingest-text [--title T]  Ingest text from stdin
  delete <id>              Delete an ingested document

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  --depth <n>       URL crawl depth (default: 0)
  --title <title>   Title for ingested text
  -h, --help        Show this help
`;

export const knowledgeCommand: Command = {
  name: 'knowledge',
  aliases: ['kb'],
  description: 'Knowledge base document ingestion and management',
  usage: 'secureyeoman knowledge <subcommand> [options]',

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
          return await runList(ctx, baseUrl, token, jsonOutput);
        case 'ingest-url':
          return await runIngestUrl(ctx, baseUrl, token, jsonOutput, args);
        case 'ingest-file':
          return await runIngestFile(ctx, baseUrl, token, jsonOutput, args);
        case 'ingest-text':
          return await runIngestText(ctx, baseUrl, token, jsonOutput, args);
        case 'delete':
          return await runDelete(ctx, baseUrl, token, jsonOutput, args);
        default:
          ctx.stderr.write(`Unknown subcommand: ${sub ?? '(none)'}\n${USAGE}\n`);
          return 1;
      }
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};

// ── list ──────────────────────────────────────────────────────────────────────

async function runList(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/brain/documents', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch documents\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const docs = (res.data as any)?.documents ?? [];
  if (docs.length === 0) {
    ctx.stdout.write('  No ingested documents.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Ingested Documents')} (${docs.length})\n\n`);
  for (const doc of docs) {
    const id = (doc.id ?? '').slice(0, 8);
    const docType = doc.type ?? 'unknown';
    const chunks = doc.chunkCount ?? 0;
    const created = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '';
    ctx.stdout.write(
      `  ${c.cyan(id)}  ${doc.title ?? 'Untitled'}  ${c.dim(docType)}  ${chunks} chunks  ${c.dim(created)}\n`
    );
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── ingest-url ────────────────────────────────────────────────────────────────

async function runIngestUrl(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const depthResult = extractFlag(args, 'depth', 'd');
  const url = depthResult.rest[0];

  if (!url) {
    ctx.stderr.write('Usage: secureyeoman knowledge ingest-url <url> [--depth N]\n');
    return 1;
  }

  const depth = depthResult.value ? parseInt(depthResult.value, 10) : 0;

  const res = await apiCall(baseUrl, '/api/v1/brain/documents/ingest-url', {
    method: 'POST',
    token,
    body: { url, depth },
  });

  if (!res?.ok) {
    ctx.stderr.write(`Ingest failed: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const doc = (res.data as any)?.document;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(
    `  ${c.green('Ingested')} ${doc?.title ?? url}  (${doc?.chunkCount ?? 0} chunks)\n`
  );
  return 0;
}

// ── ingest-file ───────────────────────────────────────────────────────────────

async function runIngestFile(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const filePath = args[0];
  if (!filePath) {
    ctx.stderr.write('Usage: secureyeoman knowledge ingest-file <file>\n');
    return 1;
  }

  const { readFileSync } = await import('node:fs');
  const { basename } = await import('node:path');
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    ctx.stderr.write(`Failed to read file: ${filePath}\n`);
    return 1;
  }

  const title = basename(filePath);

  const res = await apiCall(baseUrl, '/api/v1/brain/documents/ingest-text', {
    method: 'POST',
    token,
    body: { text: content, title },
  });

  if (!res?.ok) {
    ctx.stderr.write(`Ingest failed: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const doc = (res.data as any)?.document;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(
    `  ${c.green('Ingested')} ${doc?.title ?? title}  (${doc?.chunkCount ?? 0} chunks)\n`
  );
  return 0;
}

// ── ingest-text ───────────────────────────────────────────────────────────────

async function runIngestText(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const titleResult = extractFlag(args, 'title', 't');
  const title = titleResult.value ?? 'Untitled';

  const chunks: Buffer[] = [];
  const stdin = process.stdin;
  stdin.resume();
  for await (const chunk of stdin) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf-8');

  const res = await apiCall(baseUrl, '/api/v1/brain/documents/ingest-text', {
    method: 'POST',
    token,
    body: { text, title },
  });

  if (!res?.ok) {
    ctx.stderr.write(`Ingest failed: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  const doc = (res.data as any)?.document;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(
    `  ${c.green('Ingested')} ${doc?.title ?? title}  (${doc?.chunkCount ?? 0} chunks)\n`
  );
  return 0;
}

// ── delete ────────────────────────────────────────────────────────────────────

async function runDelete(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.stderr.write('Usage: secureyeoman knowledge delete <id>\n');
    return 1;
  }

  const res = await apiCall(baseUrl, `/api/v1/brain/documents/${id}`, {
    method: 'DELETE',
    token,
  });

  if (!res?.ok) {
    ctx.stderr.write(`Failed to delete: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }

  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write(`  Deleted ${id.slice(0, 8)}\n`);
  return 0;
}
