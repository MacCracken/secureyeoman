/**
 * CLI — federated command (Federated Learning)
 *
 * Subcommands: sessions, show, pause, resume, cancel, participants, rounds
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
Usage: secureyeoman federated <subcommand> [options]

Subcommands:
  sessions                 List federated learning sessions
  show <sessionId>         Show session details
  pause <sessionId>        Pause an active session
  resume <sessionId>       Resume a paused session
  cancel <sessionId>       Cancel a session
  participants             List registered participants
  rounds <sessionId>       List training rounds for a session

Options:
  --url <url>       Server URL (default: http://127.0.0.1:3000)
  --token <token>   Auth token
  --json            Output raw JSON
  -h, --help        Show this help
`;

function statusColor(
  c: ReturnType<typeof colorContext>,
  status: string
): string {
  switch (status) {
    case 'active':
    case 'running':
      return c.green(status);
    case 'paused':
      return c.yellow(status);
    case 'cancelled':
    case 'failed':
      return c.red(status);
    default:
      return status;
  }
}

export const federatedCommand: Command = {
  name: 'federated',
  aliases: ['fl'],
  description: 'Federated learning session management',
  usage: 'secureyeoman federated <subcommand> [options]',

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
        case 'sessions':
          return await runSessions(ctx, baseUrl, token, jsonOutput);
        case 'show':
          return await runShow(ctx, baseUrl, token, jsonOutput, args);
        case 'pause':
          return await runPause(ctx, baseUrl, token, jsonOutput, args);
        case 'resume':
          return await runResume(ctx, baseUrl, token, jsonOutput, args);
        case 'cancel':
          return await runCancel(ctx, baseUrl, token, jsonOutput, args);
        case 'participants':
          return await runParticipants(ctx, baseUrl, token, jsonOutput);
        case 'rounds':
          return await runRounds(ctx, baseUrl, token, jsonOutput, args);
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

// ── sessions ──────────────────────────────────────────────────────────────────

async function runSessions(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/federated/sessions', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch sessions\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const sessions = (res.data as any)?.sessions ?? [];
  if (sessions.length === 0) {
    ctx.stdout.write('  No federated learning sessions.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Federated Learning Sessions')} (${sessions.length})\n\n`);
  for (const s of sessions) {
    const id = (s.id ?? '').slice(0, 8);
    ctx.stdout.write(
      `  ${c.cyan(id)}  ${statusColor(c, s.status ?? 'unknown')}  ${s.name ?? ''}\n`
    );
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── show ──────────────────────────────────────────────────────────────────────

async function runShow(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const sessionId = args[0];
  if (!sessionId) {
    ctx.stderr.write('Usage: secureyeoman federated show <sessionId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/federated/sessions/${sessionId}`, { token });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch session: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const session = (res.data as any)?.session ?? res.data;
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Session Details')}\n\n`);
  ctx.stdout.write(`  ID:           ${session.id ?? ''}\n`);
  ctx.stdout.write(`  Name:         ${session.name ?? ''}\n`);
  ctx.stdout.write(`  Status:       ${statusColor(c, session.status ?? 'unknown')}\n`);
  ctx.stdout.write(`  Participants: ${session.participantCount ?? 0}\n`);
  ctx.stdout.write(`  Rounds:       ${session.roundCount ?? 0}\n`);
  ctx.stdout.write(`  Created:      ${session.createdAt ?? ''}\n`);
  ctx.stdout.write('\n');
  return 0;
}

// ── pause ─────────────────────────────────────────────────────────────────────

async function runPause(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  _jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const sessionId = args[0];
  if (!sessionId) {
    ctx.stderr.write('Usage: secureyeoman federated pause <sessionId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/federated/sessions/${sessionId}/pause`, {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to pause session: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  ctx.stdout.write(`  Paused session ${sessionId.slice(0, 8)}\n`);
  return 0;
}

// ── resume ────────────────────────────────────────────────────────────────────

async function runResume(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  _jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const sessionId = args[0];
  if (!sessionId) {
    ctx.stderr.write('Usage: secureyeoman federated resume <sessionId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/federated/sessions/${sessionId}/resume`, {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to resume session: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  ctx.stdout.write(`  Resumed session ${sessionId.slice(0, 8)}\n`);
  return 0;
}

// ── cancel ────────────────────────────────────────────────────────────────────

async function runCancel(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  _jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const sessionId = args[0];
  if (!sessionId) {
    ctx.stderr.write('Usage: secureyeoman federated cancel <sessionId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/federated/sessions/${sessionId}/cancel`, {
    method: 'POST',
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to cancel session: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  ctx.stdout.write(`  Cancelled session ${sessionId.slice(0, 8)}\n`);
  return 0;
}

// ── participants ──────────────────────────────────────────────────────────────

async function runParticipants(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean
): Promise<number> {
  const res = await apiCall(baseUrl, '/api/v1/federated/participants', { token });
  if (!res?.ok) {
    ctx.stderr.write('Failed to fetch participants\n');
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const participants = (res.data as any)?.participants ?? [];
  if (participants.length === 0) {
    ctx.stdout.write('  No registered participants.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Registered Participants')} (${participants.length})\n\n`);
  for (const p of participants) {
    const id = (p.id ?? '').slice(0, 8);
    ctx.stdout.write(
      `  ${c.cyan(id)}  ${statusColor(c, p.status ?? 'unknown')}  ${p.name ?? ''}\n`
    );
  }
  ctx.stdout.write('\n');
  return 0;
}

// ── rounds ────────────────────────────────────────────────────────────────────

async function runRounds(
  ctx: CommandContext,
  baseUrl: string,
  token: string | undefined,
  jsonOutput: boolean,
  args: string[]
): Promise<number> {
  const sessionId = args[0];
  if (!sessionId) {
    ctx.stderr.write('Usage: secureyeoman federated rounds <sessionId>\n');
    return 1;
  }
  const res = await apiCall(baseUrl, `/api/v1/federated/sessions/${sessionId}/rounds`, {
    token,
  });
  if (!res?.ok) {
    ctx.stderr.write(`Failed to fetch rounds: ${JSON.stringify((res as any)?.data)}\n`);
    return 1;
  }
  if (jsonOutput) {
    ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
    return 0;
  }
  const rounds = (res.data as any)?.rounds ?? [];
  if (rounds.length === 0) {
    ctx.stdout.write('  No training rounds.\n');
    return 0;
  }
  const c = colorContext(ctx.stdout);
  ctx.stdout.write(`\n  ${c.bold('Training Rounds')} (${rounds.length})\n\n`);
  for (const r of rounds) {
    ctx.stdout.write(
      `  Round ${r.roundNumber ?? '?'}  ${statusColor(c, r.status ?? 'unknown')}  participants: ${r.participantCount ?? 0}\n`
    );
  }
  ctx.stdout.write('\n');
  return 0;
}
