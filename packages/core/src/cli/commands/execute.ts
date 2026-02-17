/**
 * Execute Command — Sandboxed code execution.
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, formatTable, apiCall } from '../utils.js';

export const executeCommand: Command = {
  name: 'execute',
  description: 'Sandboxed code execution',
  usage: 'secureyeoman execute <subcommand> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(`
Usage: ${this.usage}

Subcommands:
  run --runtime <rt> --code <code>   Execute code
  sessions                           List active sessions
  history [--limit N]                Execution history
  approve <id>                       Approve pending execution
  reject <id>                        Reject pending execution

Options:
      --runtime <rt>   Runtime: node, python, shell
      --code <code>    Code to execute
      --session <id>   Reuse existing session
      --limit <N>      Limit results (default: 50)
      --url <url>      Server URL (default: http://127.0.0.1:3000)
      --json           Output raw JSON
  -h, --help           Show this help
\n`);
      return 0;
    }
    argv = helpResult.rest;

    const subcommand = argv[0];
    argv = argv.slice(1);

    const urlResult = extractFlag(argv, 'url');
    argv = urlResult.rest;
    const jsonResult = extractBoolFlag(argv, 'json');
    argv = jsonResult.rest;

    const baseUrl = urlResult.value ?? 'http://127.0.0.1:3000';

    try {
      switch (subcommand) {
        case 'run': {
          const runtimeResult = extractFlag(argv, 'runtime');
          argv = runtimeResult.rest;
          const codeResult = extractFlag(argv, 'code');
          argv = codeResult.rest;
          const sessionResult = extractFlag(argv, 'session');

          if (!runtimeResult.value || !codeResult.value) {
            ctx.stderr.write('Usage: secureyeoman execute run --runtime <rt> --code <code>\n');
            return 1;
          }

          const body: Record<string, unknown> = {
            runtime: runtimeResult.value,
            code: codeResult.value,
          };
          if (sessionResult.value) body.sessionId = sessionResult.value;

          const res = await apiCall(baseUrl, '/api/v1/execution/run', {
            method: 'POST',
            body,
          });
          if (!res.ok) {
            ctx.stderr.write(`Execution failed: ${res.status}\n`);
            return 1;
          }
          const data = res.data as {
            exitCode: number;
            stdout: string;
            stderr: string;
            duration: number;
          };
          if (jsonResult.value) {
            ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
          } else {
            if (data.stdout) ctx.stdout.write(data.stdout);
            if (data.stderr) ctx.stderr.write(data.stderr);
            ctx.stdout.write(`\nExit code: ${data.exitCode} (${data.duration}ms)\n`);
          }
          return data.exitCode === 0 ? 0 : 1;
        }

        case 'sessions': {
          const res = await apiCall(baseUrl, '/api/v1/execution/sessions');
          if (!res.ok) {
            ctx.stderr.write(`Failed to fetch sessions: ${res.status}\n`);
            return 1;
          }
          const data = res.data as {
            sessions: { id: string; runtime: string; status: string; createdAt: number }[];
          };
          if (jsonResult.value) {
            ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
          } else {
            const rows = (data.sessions ?? []).map((s) => ({
              id: s.id.slice(0, 8),
              runtime: s.runtime,
              status: s.status,
              created: new Date(s.createdAt).toLocaleString(),
            }));
            ctx.stdout.write(formatTable(rows) + '\n');
          }
          return 0;
        }

        case 'history': {
          const limitResult = extractFlag(argv, 'limit');
          const limit = limitResult.value ? Number(limitResult.value) : 50;
          const res = await apiCall(baseUrl, `/api/v1/execution/history?limit=${limit}`);
          if (!res.ok) {
            ctx.stderr.write(`Failed to fetch history: ${res.status}\n`);
            return 1;
          }
          const data = res.data as {
            executions: {
              id: string;
              exitCode: number;
              duration: number;
              createdAt: number;
            }[];
            total: number;
          };
          if (jsonResult.value) {
            ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
          } else {
            const rows = (data.executions ?? []).map((e) => ({
              id: e.id.slice(0, 8),
              exit: String(e.exitCode),
              duration: `${e.duration}ms`,
              time: new Date(e.createdAt).toLocaleString(),
            }));
            ctx.stdout.write(`Total: ${data.total}\n`);
            ctx.stdout.write(formatTable(rows) + '\n');
          }
          return 0;
        }

        case 'approve': {
          const id = argv[0];
          if (!id) {
            ctx.stderr.write('Usage: secureyeoman execute approve <id>\n');
            return 1;
          }
          const res = await apiCall(baseUrl, `/api/v1/execution/approve/${id}`, { method: 'POST' });
          if (!res.ok) {
            ctx.stderr.write(`Approval failed: ${res.status}\n`);
            return 1;
          }
          ctx.stdout.write(`Execution ${id} approved\n`);
          return 0;
        }

        case 'reject': {
          const id = argv[0];
          if (!id) {
            ctx.stderr.write('Usage: secureyeoman execute reject <id>\n');
            return 1;
          }
          const res = await apiCall(baseUrl, `/api/v1/execution/approve/${id}`, {
            method: 'DELETE',
          });
          if (!res.ok) {
            ctx.stderr.write(`Rejection failed: ${res.status}\n`);
            return 1;
          }
          ctx.stdout.write(`Execution ${id} rejected\n`);
          return 0;
        }

        default:
          ctx.stderr.write(`Unknown subcommand: ${subcommand}\n`);
          return 1;
      }
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};
