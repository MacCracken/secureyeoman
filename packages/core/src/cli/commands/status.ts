/**
 * Status Command — Display overview of a running SecureYeoman instance.
 */

import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, formatUptime, apiCall } from '../utils.js';

export const statusCommand: Command = {
  name: 'status',
  description: 'Show server status overview',
  usage: 'secureyeoman status [--url URL] [--json]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(`
Usage: ${this.usage}

Display a summary of a running SecureYeoman instance.

Options:
      --url <url>    Server URL (default: http://127.0.0.1:3000)
      --json         Output raw JSON
  -h, --help         Show this help
\n`);
      return 0;
    }
    argv = helpResult.rest;

    const urlResult = extractFlag(argv, 'url');
    argv = urlResult.rest;
    const jsonResult = extractBoolFlag(argv, 'json');

    const baseUrl = urlResult.value ?? 'http://127.0.0.1:3000';

    try {
      // Fetch all endpoints in parallel
      const [healthRes, personalityRes, policyRes, agentConfigRes] = await Promise.all([
        apiCall(baseUrl, '/health').catch(() => null),
        apiCall(baseUrl, '/api/v1/soul/personality').catch(() => null),
        apiCall(baseUrl, '/api/v1/security/policy').catch(() => null),
        apiCall(baseUrl, '/api/v1/agents/config').catch(() => null),
      ]);

      if (!healthRes || !healthRes.ok) {
        ctx.stderr.write(`Cannot reach server at ${baseUrl}\n`);
        return 1;
      }

      const health = healthRes.data as Record<string, unknown>;
      const personality = personalityRes?.ok
        ? (personalityRes.data as Record<string, unknown>)
        : null;
      const policy = policyRes?.ok
        ? (policyRes.data as Record<string, unknown>)
        : null;
      const agentConfig = agentConfigRes?.ok
        ? (agentConfigRes.data as Record<string, unknown>)
        : null;

      if (jsonResult.value) {
        ctx.stdout.write(
          JSON.stringify({ health, personality, policy, agentConfig }, null, 2) + '\n',
        );
        return health.status === 'ok' ? 0 : 1;
      }

      // Format human-readable output
      const status = health.status === 'ok' ? 'OK' : 'ERROR';
      const version = (health.version as string) ?? 'unknown';
      const uptime = formatUptime((health.uptime as number) ?? 0);

      const activePersonality = personality?.personality as Record<string, unknown> | null;
      const agentName = activePersonality?.name ?? 'Unknown';
      const personalityId = activePersonality?.id
        ? String(activePersonality.id).slice(0, 8)
        : 'n/a';

      const allowSubAgents = policy?.allowSubAgents ?? false;
      const allowedByPolicy = agentConfig?.allowedBySecurityPolicy ?? false;

      ctx.stdout.write(`
  SecureYeoman Status

    Server:       ${baseUrl}
    Status:       ${status}
    Version:      ${version}
    Uptime:       ${uptime}

    Agent:        ${agentName as string}
    Personality:  ${activePersonality ? `Active (id: ${personalityId})` : 'None'}

    Security:
      Sub-Agents:   ${allowSubAgents ? 'Enabled' : 'Disabled'}
      Policy:       ${allowedByPolicy ? 'Allowed' : 'Restricted'}
\n`);

      return status === 'OK' ? 0 : 1;
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};
