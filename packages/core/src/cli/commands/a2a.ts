/**
 * A2A Command — Agent-to-Agent protocol management.
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, formatTable, apiCall } from '../utils.js';

export const a2aCommand: Command = {
  name: 'a2a',
  description: 'Agent-to-Agent protocol management',
  usage: 'secureyeoman a2a <subcommand> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(`
Usage: ${this.usage}

Subcommands:
  peers                              List known peers
  add --peer-url <url> [--name <n>]  Add a peer
  remove <id>                        Remove a peer
  trust <id> --level <level>         Set trust level (untrusted|verified|trusted)
  discover                           Trigger peer discovery
  delegate --peer <id> --task <desc> Delegate task to peer
  messages [--limit N]               Message history

Options:
      --url <url>       Server URL (default: http://127.0.0.1:3000)
      --json            Output raw JSON
  -h, --help            Show this help
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
        case 'peers': {
          const res = await apiCall(baseUrl, '/api/v1/a2a/peers');
          if (!res.ok) {
            ctx.stderr.write(`Failed to fetch peers: ${res.status}\n`);
            return 1;
          }
          const data = res.data as {
            peers: {
              id: string;
              name: string;
              url: string;
              trustLevel: string;
              status: string;
            }[];
          };
          if (jsonResult.value) {
            ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
          } else {
            const rows = (data.peers ?? []).map((p) => ({
              id: p.id.slice(0, 8),
              name: p.name,
              url: p.url,
              trust: p.trustLevel,
              status: p.status,
            }));
            ctx.stdout.write(formatTable(rows) + '\n');
          }
          return 0;
        }

        case 'add': {
          const peerUrlResult = extractFlag(argv, 'peer-url');
          argv = peerUrlResult.rest;
          const nameResult = extractFlag(argv, 'name');

          if (!peerUrlResult.value) {
            ctx.stderr.write('Usage: secureyeoman a2a add --peer-url <url> [--name <n>]\n');
            return 1;
          }

          const body: Record<string, unknown> = { url: peerUrlResult.value };
          if (nameResult.value) body.name = nameResult.value;

          const res = await apiCall(baseUrl, '/api/v1/a2a/peers', {
            method: 'POST',
            body,
          });
          if (!res.ok) {
            ctx.stderr.write(`Failed to add peer: ${res.status}\n`);
            return 1;
          }
          const data = res.data as { peer: { id: string; name: string } };
          ctx.stdout.write(`Peer added: ${data.peer.name} (${data.peer.id.slice(0, 8)})\n`);
          return 0;
        }

        case 'remove': {
          const id = argv[0];
          if (!id) {
            ctx.stderr.write('Usage: secureyeoman a2a remove <id>\n');
            return 1;
          }
          const res = await apiCall(baseUrl, `/api/v1/a2a/peers/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            ctx.stderr.write(`Failed to remove peer: ${res.status}\n`);
            return 1;
          }
          ctx.stdout.write(`Peer ${id} removed\n`);
          return 0;
        }

        case 'trust': {
          const id = argv[0];
          argv = argv.slice(1);
          const levelResult = extractFlag(argv, 'level');

          if (!id || !levelResult.value) {
            ctx.stderr.write(
              'Usage: secureyeoman a2a trust <id> --level <untrusted|verified|trusted>\n'
            );
            return 1;
          }

          const res = await apiCall(baseUrl, `/api/v1/a2a/peers/${id}/trust`, {
            method: 'PUT',
            body: { level: levelResult.value },
          });
          if (!res.ok) {
            ctx.stderr.write(`Failed to update trust: ${res.status}\n`);
            return 1;
          }
          ctx.stdout.write(`Peer ${id} trust level set to ${levelResult.value}\n`);
          return 0;
        }

        case 'discover': {
          const res = await apiCall(baseUrl, '/api/v1/a2a/discover', { method: 'POST' });
          if (!res.ok) {
            ctx.stderr.write(`Discovery failed: ${res.status}\n`);
            return 1;
          }
          const data = res.data as { peers: { id: string; name: string }[] };
          const count = (data.peers ?? []).length;
          ctx.stdout.write(`Discovered ${count} peer(s)\n`);
          return 0;
        }

        case 'delegate': {
          const peerResult = extractFlag(argv, 'peer');
          argv = peerResult.rest;
          const taskResult = extractFlag(argv, 'task');

          if (!peerResult.value || !taskResult.value) {
            ctx.stderr.write('Usage: secureyeoman a2a delegate --peer <id> --task <desc>\n');
            return 1;
          }

          const res = await apiCall(baseUrl, '/api/v1/a2a/delegate', {
            method: 'POST',
            body: { peerId: peerResult.value, task: taskResult.value },
          });
          if (!res.ok) {
            ctx.stderr.write(`Delegation failed: ${res.status}\n`);
            return 1;
          }
          const data = res.data as { message: { id: string } };
          ctx.stdout.write(`Task delegated (message: ${data.message.id.slice(0, 8)})\n`);
          return 0;
        }

        case 'messages': {
          const limitResult = extractFlag(argv, 'limit');
          const limit = limitResult.value ? Number(limitResult.value) : 50;
          const res = await apiCall(baseUrl, `/api/v1/a2a/messages?limit=${limit}`);
          if (!res.ok) {
            ctx.stderr.write(`Failed to fetch messages: ${res.status}\n`);
            return 1;
          }
          const data = res.data as {
            messages: {
              id: string;
              type: string;
              fromPeerId: string;
              toPeerId: string;
              timestamp: number;
            }[];
            total: number;
          };
          if (jsonResult.value) {
            ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
          } else {
            const rows = (data.messages ?? []).map((m) => ({
              id: m.id.slice(0, 8),
              type: m.type,
              from: m.fromPeerId.slice(0, 8),
              to: m.toPeerId.slice(0, 8),
              time: new Date(m.timestamp).toLocaleString(),
            }));
            ctx.stdout.write(`Total: ${data.total}\n`);
            ctx.stdout.write(formatTable(rows) + '\n');
          }
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
