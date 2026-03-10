/**
 * Crew Command — Manage and run agent Teams.
 *
 * Sub-commands:
 *   list              List all teams
 *   show <id>         Show team definition and recent runs
 *   import <file>     Import a team from a YAML file
 *   export <id>       Print team as YAML (--out <file> to save)
 *   run <id> <task>   Run a team on a task (polls for completion)
 *   runs [teamId]     List recent team runs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import type { Command, CommandContext } from '../router.js';
import {
  extractFlag,
  extractBoolFlag,
  extractCommonFlags,
  apiCall,
  colorContext,
  handleLicenseError,
  Spinner,
  formatTable,
} from '../utils.js';
import { TeamCreateSchema } from '@secureyeoman/shared';

const USAGE = `
Usage: secureyeoman crew <subcommand> [options]

Subcommands:
  list                  List all teams
  show <id>             Show team definition and recent runs
  import <file>         Import a team from a YAML file
  export <id>           Print team as YAML (--out <file> to save)
  run <id> <task>       Run a team on a task and wait for result
  runs [teamId]         List recent team runs
  wf:versions <id>      List workflow version history
  wf:tag <id> [tag]     Tag a workflow release
  wf:rollback <id> <vId> Rollback workflow to a version
  wf:drift <id>         Show workflow drift since last tag

Options:
  --url <url>           Server URL (default: http://127.0.0.1:3000)
  --token <token>       Auth token
  --json                Output raw JSON
  --out <file>          Write output to file (export subcommand)
  --timeout <ms>        Poll timeout for run subcommand (default: 120000)
  -h, --help            Show this help

YAML format for import:
  name: "Full-Stack Crew"
  description: "optional description"
  members:
    - role: "Backend Engineer"
      profileName: coder
      description: "Handles APIs"
  coordinatorProfileName: researcher
`;

export const crewCommand: Command = {
  name: 'crew',
  aliases: ['team'],
  description: 'Manage and run agent teams',
  usage: 'secureyeoman crew <list|show|import|export|run|runs> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;
    const { green, red, bold, dim, cyan } = colorContext(ctx.stdout);

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    const { baseUrl, token, json: jsonOutput, rest: argvRest } = extractCommonFlags(argv);
    argv = argvRest;

    const outResult = extractFlag(argv, 'out');
    argv = outResult.rest;
    const timeoutResult = extractFlag(argv, 'timeout');
    argv = timeoutResult.rest;
    const timeoutMs = timeoutResult.value ? Number(timeoutResult.value) : 120000;

    const sub = argv[0];

    try {
      switch (sub) {
        // ── list ─────────────────────────────────────────────────────────

        case 'list': {
          const res = await apiCall(baseUrl, '/api/v1/agents/teams', { token });
          if (!res.ok) {
            if (handleLicenseError(res, ctx.stderr)) return 1;
            ctx.stderr.write(`Error: ${JSON.stringify(res.data)}\n`);
            return 1;
          }
          if (jsonOutput) {
            ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
            return 0;
          }
          const { teams } = res.data as {
            teams: {
              id: string;
              name: string;
              description?: string;
              isBuiltin: boolean;
              members: { role: string }[];
            }[];
            total: number;
          };
          if (teams.length === 0) {
            ctx.stdout.write('No teams found.\n');
            return 0;
          }
          ctx.stdout.write(
            formatTable(
              teams.map((t) => ({
                ID: t.id,
                NAME: t.name,
                MEMBERS: String(t.members.length),
                BUILTIN: t.isBuiltin ? 'yes' : 'no',
              })),
              ['ID', 'NAME', 'MEMBERS', 'BUILTIN']
            ) + '\n'
          );
          return 0;
        }

        // ── show ──────────────────────────────────────────────────────────

        case 'show': {
          const id = argv[1];
          if (!id) {
            ctx.stderr.write('Usage: secureyeoman crew show <id>\n');
            return 1;
          }
          const [teamRes, runsRes] = await Promise.all([
            apiCall(baseUrl, `/api/v1/agents/teams/${id}`, { token }),
            apiCall(baseUrl, `/api/v1/agents/teams/runs/${id}?teamId=${id}`, { token }),
          ]);
          if (!teamRes.ok) {
            ctx.stderr.write(`Error: team not found: ${id}\n`);
            return 1;
          }
          if (jsonOutput) {
            ctx.stdout.write(JSON.stringify(teamRes.data, null, 2) + '\n');
            return 0;
          }
          const { team } = teamRes.data as {
            team: {
              id: string;
              name: string;
              description?: string;
              members: { role: string; profileName: string; description?: string }[];
              coordinatorProfileName?: string;
              isBuiltin: boolean;
            };
          };
          ctx.stdout.write(`\n${bold(team.name)}${team.isBuiltin ? dim(' (builtin)') : ''}\n`);
          if (team.description) ctx.stdout.write(`${dim(team.description)}\n`);
          ctx.stdout.write(`\nID: ${team.id}\n`);
          if (team.coordinatorProfileName) {
            ctx.stdout.write(`Coordinator: ${team.coordinatorProfileName}\n`);
          }
          ctx.stdout.write(`\nMembers:\n`);
          for (const m of team.members) {
            ctx.stdout.write(
              `  ${cyan(m.role)} → ${m.profileName}${m.description ? `  ${dim(m.description)}` : ''}\n`
            );
          }

          if (runsRes.ok) {
            const runsData = runsRes.data as {
              runs?: { id: string; status: string; task: string; createdAt: number }[];
            };
            const runs = runsData.runs ?? [];
            if (runs.length > 0) {
              ctx.stdout.write('\nRecent runs:\n');
              for (const r of runs.slice(0, 5)) {
                ctx.stdout.write(
                  `  ${r.id}  ${r.status.padEnd(12)}  ${new Date(r.createdAt).toISOString().slice(0, 19)}  ${r.task.slice(0, 60)}\n`
                );
              }
            }
          }
          ctx.stdout.write('\n');
          return 0;
        }

        // ── import ────────────────────────────────────────────────────────

        case 'import': {
          const file = argv[1];
          if (!file) {
            ctx.stderr.write('Usage: secureyeoman crew import <file>\n');
            return 1;
          }
          let raw: string;
          try {
            raw = readFileSync(file, 'utf-8');
          } catch {
            ctx.stderr.write(`Error: cannot read file: ${file}\n`);
            return 1;
          }
          let parsed: unknown;
          try {
            const yaml = await import('yaml');
            parsed = yaml.parse(raw);
          } catch {
            ctx.stderr.write('Error: invalid YAML file\n');
            return 1;
          }
          const validation = TeamCreateSchema.safeParse(parsed);
          if (!validation.success) {
            ctx.stderr.write(
              `Validation error: ${validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}\n`
            );
            return 1;
          }
          const res = await apiCall(baseUrl, '/api/v1/agents/teams', {
            method: 'POST',
            body: validation.data,
            token,
          });
          if (!res.ok) {
            ctx.stderr.write(`Error: ${JSON.stringify(res.data)}\n`);
            return 1;
          }
          const { team } = res.data as { team: { id: string; name: string } };
          ctx.stdout.write(`${green('✓')} Imported team ${bold(team.name)} (${team.id})\n`);
          return 0;
        }

        // ── export ────────────────────────────────────────────────────────

        case 'export': {
          const id = argv[1];
          if (!id) {
            ctx.stderr.write('Usage: secureyeoman crew export <id> [--out <file>]\n');
            return 1;
          }
          const res = await apiCall(baseUrl, `/api/v1/agents/teams/${id}`, { token });
          if (!res.ok) {
            ctx.stderr.write(`Error: team not found: ${id}\n`);
            return 1;
          }
          const { team } = res.data as {
            team: {
              name: string;
              description?: string;
              members: unknown[];
              coordinatorProfileName?: string;
            };
          };
          const yaml = await import('yaml');
          const yamlOut = yaml.stringify({
            name: team.name,
            ...(team.description ? { description: team.description } : {}),
            members: team.members,
            ...(team.coordinatorProfileName
              ? { coordinatorProfileName: team.coordinatorProfileName }
              : {}),
          });
          if (outResult.value) {
            writeFileSync(outResult.value, yamlOut, 'utf-8');
            ctx.stdout.write(`${green('✓')} Exported team to ${outResult.value}\n`);
          } else {
            ctx.stdout.write(yamlOut);
          }
          return 0;
        }

        // ── run ───────────────────────────────────────────────────────────

        case 'run': {
          const id = argv[1];
          const task = argv.slice(2).join(' ');
          if (!id || !task) {
            ctx.stderr.write('Usage: secureyeoman crew run <id> <task>\n');
            return 1;
          }
          const runRes = await apiCall(baseUrl, `/api/v1/agents/teams/${id}/run`, {
            method: 'POST',
            body: { task },
            token,
          });
          if (!runRes.ok) {
            if (handleLicenseError(runRes, ctx.stderr)) return 1;
            ctx.stderr.write(`Error: ${JSON.stringify(runRes.data)}\n`);
            return 1;
          }
          const { run } = runRes.data as { run: { id: string } };
          const spinner = new Spinner(ctx.stdout);
          spinner.start(`Running team ${id} on task…`);
          const deadline = Date.now() + timeoutMs;
          let finalRun: {
            status: string;
            result?: string;
            error?: string;
            coordinatorReasoning?: string;
            assignedMembers?: string[];
          } | null = null;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 2000));
            const pollRes = await apiCall(baseUrl, `/api/v1/agents/teams/runs/${run.id}`, {
              token,
            });
            if (pollRes.ok) {
              const { run: r } = pollRes.data as {
                run: {
                  status: string;
                  result?: string;
                  error?: string;
                  coordinatorReasoning?: string;
                  assignedMembers?: string[];
                };
              };
              if (r.status === 'completed' || r.status === 'failed') {
                finalRun = r;
                break;
              }
            }
          }
          if (!finalRun) {
            spinner.stop('Timed out waiting for run to complete', false);
            return 1;
          }
          if (finalRun.status === 'failed') {
            spinner.stop(`Run failed: ${finalRun.error ?? 'unknown error'}`, false);
            ctx.stderr.write(red(`Error: ${finalRun.error ?? 'unknown error'}\n`));
            return 1;
          }
          spinner.stop('Run completed', true);
          if (jsonOutput) {
            ctx.stdout.write(JSON.stringify(finalRun, null, 2) + '\n');
            return 0;
          }
          if (finalRun.assignedMembers?.length) {
            ctx.stdout.write(`\nAssigned: ${finalRun.assignedMembers.join(', ')}\n`);
          }
          if (finalRun.coordinatorReasoning) {
            ctx.stdout.write(`Reasoning: ${dim(finalRun.coordinatorReasoning)}\n`);
          }
          ctx.stdout.write(`\n${finalRun.result ?? '(no result)'}\n`);
          return 0;
        }

        // ── runs ──────────────────────────────────────────────────────────

        case 'runs': {
          const teamId = argv[1];
          const _url = teamId
            ? `/api/v1/agents/teams/runs/${teamId}`
            : '/api/v1/agents/teams?limit=1'; // fallback — list all via runs endpoint isn't direct
          // Use the runs listing via teamId or list all teams then their runs
          let allRuns: {
            id: string;
            teamName: string;
            status: string;
            task: string;
            createdAt: number;
            completedAt?: number;
          }[] = [];
          if (teamId) {
            const res = await apiCall(baseUrl, `/api/v1/agents/teams/${teamId}/runs`, { token });
            if (res.ok) {
              allRuns = ((res.data as { runs?: unknown[] }).runs ?? []) as typeof allRuns;
            }
          } else {
            // List runs for all teams: list teams then query each
            const teamsRes = await apiCall(baseUrl, '/api/v1/agents/teams', { token });
            if (teamsRes.ok) {
              const { teams } = teamsRes.data as { teams: { id: string }[] };
              const runPromises = teams
                .slice(0, 10)
                .map((t) =>
                  apiCall(baseUrl, `/api/v1/agents/teams/${t.id}/runs`, { token }).then((r) =>
                    r.ok ? ((r.data as { runs?: unknown[] }).runs ?? []) : []
                  )
                );
              const nested = await Promise.all(runPromises);
              allRuns = nested.flat() as typeof allRuns;
            }
          }
          if (jsonOutput) {
            ctx.stdout.write(JSON.stringify(allRuns, null, 2) + '\n');
            return 0;
          }
          if (allRuns.length === 0) {
            ctx.stdout.write('No runs found.\n');
            return 0;
          }
          ctx.stdout.write(
            formatTable(
              allRuns.map((r) => ({
                ID: r.id,
                TEAM: r.teamName ?? '',
                STATUS: r.status,
                TASK: (r.task ?? '').slice(0, 50),
                CREATED: new Date(r.createdAt).toISOString().slice(0, 19),
              })),
              ['ID', 'TEAM', 'STATUS', 'TASK', 'CREATED']
            ) + '\n'
          );
          return 0;
        }

        // ── Workflow version subcommands (Phase 114) ──────────────────

        case 'wf:versions': {
          const wfId = argv[1];
          if (!wfId) {
            ctx.stderr.write('Usage: secureyeoman crew wf:versions <workflowId>\n');
            return 1;
          }
          const res = await apiCall(baseUrl, `/api/v1/workflows/${wfId}/versions`, { token });
          if (!res.ok) {
            ctx.stderr.write(`Error: ${JSON.stringify(res.data)}\n`);
            return 1;
          }
          if (jsonOutput) {
            ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
            return 0;
          }
          const { versions, total } = res.data as {
            versions: {
              id: string;
              versionTag: string | null;
              changedFields: string[];
              author: string;
              createdAt: number;
            }[];
            total: number;
          };
          ctx.stdout.write(bold(`Workflow versions`) + ` (${total})\n\n`);
          for (const v of versions) {
            const tag = v.versionTag ? green(v.versionTag) : dim('untagged');
            const date = new Date(v.createdAt).toISOString().slice(0, 19);
            const fields = v.changedFields.length > 0 ? ` [${v.changedFields.join(', ')}]` : '';
            ctx.stdout.write(
              `  ${tag}  ${dim(date)}  ${v.author}${fields}  ${dim(v.id.slice(0, 8))}\n`
            );
          }
          return 0;
        }

        case 'wf:tag': {
          const wfId = argv[1];
          if (!wfId) {
            ctx.stderr.write('Usage: secureyeoman crew wf:tag <workflowId> [tag]\n');
            return 1;
          }
          const body: Record<string, unknown> = {};
          if (argv[2]) body.tag = argv[2];
          const res = await apiCall(baseUrl, `/api/v1/workflows/${wfId}/versions/tag`, {
            method: 'POST',
            body,
            token,
          });
          if (!res.ok) {
            ctx.stderr.write(`Error: ${JSON.stringify(res.data)}\n`);
            return 1;
          }
          if (jsonOutput) {
            ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
            return 0;
          }
          const version = res.data as { versionTag: string; id: string };
          ctx.stdout.write(
            bold(`Tagged: ${version.versionTag}`) + ` (${version.id.slice(0, 8)})\n`
          );
          return 0;
        }

        case 'wf:rollback': {
          const wfId = argv[1];
          const vId = argv[2];
          if (!wfId || !vId) {
            ctx.stderr.write('Usage: secureyeoman crew wf:rollback <workflowId> <versionId>\n');
            return 1;
          }
          const res = await apiCall(baseUrl, `/api/v1/workflows/${wfId}/versions/${vId}/rollback`, {
            method: 'POST',
            token,
          });
          if (!res.ok) {
            ctx.stderr.write(`Error: ${JSON.stringify(res.data)}\n`);
            return 1;
          }
          if (jsonOutput) {
            ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
            return 0;
          }
          ctx.stdout.write(bold('Rollback complete.') + ' New version recorded.\n');
          return 0;
        }

        case 'wf:drift': {
          const wfId = argv[1];
          if (!wfId) {
            ctx.stderr.write('Usage: secureyeoman crew wf:drift <workflowId>\n');
            return 1;
          }
          const res = await apiCall(baseUrl, `/api/v1/workflows/${wfId}/drift`, { token });
          if (!res.ok) {
            ctx.stderr.write(`Error: ${JSON.stringify(res.data)}\n`);
            return 1;
          }
          if (jsonOutput) {
            ctx.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
            return 0;
          }
          const drift = res.data as {
            lastTaggedVersion: string | null;
            uncommittedChanges: number;
            changedFields: string[];
            diffSummary: string;
          };
          if (!drift.lastTaggedVersion) {
            ctx.stdout.write('No tagged releases yet.\n');
            return 0;
          }
          ctx.stdout.write(bold(`Last tagged: ${drift.lastTaggedVersion}`) + '\n');
          if (drift.uncommittedChanges === 0) {
            ctx.stdout.write(green('No drift detected.') + '\n');
          } else {
            ctx.stdout.write(`${drift.uncommittedChanges} uncommitted change(s)\n`);
            ctx.stdout.write(`Changed: ${drift.changedFields.join(', ')}\n`);
            if (drift.diffSummary) ctx.stdout.write('\n' + drift.diffSummary + '\n');
          }
          return 0;
        }

        default:
          ctx.stderr.write(
            `Unknown subcommand: ${sub ?? '(none)'}\nRun "secureyeoman crew --help" for usage.\n`
          );
          return 1;
      }
    } catch (err) {
      ctx.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};
