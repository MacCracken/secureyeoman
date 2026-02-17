/**
 * CLI Command — role management (list, create, delete, assign, revoke, assignments).
 */

import type { Command } from '../router.js';
import { extractFlag, extractBoolFlag, formatTable, apiCall } from '../utils.js';

const DEFAULT_URL = 'http://localhost:18789/api/v1';

export const roleCommand: Command = {
  name: 'role',
  description: 'Manage RBAC roles and user assignments',
  usage: [
    'secureyeoman role list [--url <url>] [--json]',
    'secureyeoman role create --name <n> --permissions <res:act,...> [--description <d>] [--inherit <id,...>] [--url <url>]',
    'secureyeoman role delete <roleId> [--url <url>]',
    'secureyeoman role assign --user <userId> --role <roleId> [--url <url>]',
    'secureyeoman role revoke --user <userId> [--url <url>]',
    'secureyeoman role assignments [--url <url>] [--json]',
  ].join('\n'),

  async run({ argv, stdout, stderr }) {
    // Extract common flags
    const { value: baseUrl, rest: a1 } = extractFlag(argv, 'url');
    const { value: jsonFlag, rest: a2 } = extractBoolFlag(a1, 'json');
    const url = baseUrl ?? DEFAULT_URL;

    const action = a2[0] ?? 'list';
    const restArgs = a2.slice(1);

    switch (action) {
      case 'list': {
        const { ok, data } = await apiCall(url, '/auth/roles');
        if (!ok) {
          stderr.write(`Error: ${JSON.stringify(data)}\n`);
          return 1;
        }
        const roles = (data as { roles: Record<string, unknown>[] }).roles;
        if (jsonFlag) {
          stdout.write(JSON.stringify(roles, null, 2) + '\n');
        } else {
          const rows = roles.map((r) => ({
            id: String(r.id ?? ''),
            name: String(r.name ?? ''),
            builtin: r.isBuiltin ? 'yes' : 'no',
            permissions: Array.isArray(r.permissions)
              ? (r.permissions as { resource: string; action: string }[])
                  .map((p) => `${p.resource}:${p.action}`)
                  .join(', ')
              : '',
          }));
          stdout.write(formatTable(rows, ['id', 'name', 'builtin', 'permissions']) + '\n');
        }
        return 0;
      }

      case 'create': {
        const { value: name, rest: r1 } = extractFlag(restArgs, 'name');
        const { value: permsRaw, rest: r2 } = extractFlag(r1, 'permissions');
        const { value: description, rest: r3 } = extractFlag(r2, 'description');
        const { value: inheritRaw } = extractFlag(r3, 'inherit');

        if (!name) {
          stderr.write('Error: --name is required\n');
          return 1;
        }
        if (!permsRaw) {
          stderr.write('Error: --permissions is required (comma-separated resource:action)\n');
          return 1;
        }

        const permissions = permsRaw.split(',').map((s) => {
          const [resource, action] = s.trim().split(':');
          return { resource: resource ?? s.trim(), action: action ?? '*' };
        });
        const inheritFrom = inheritRaw
          ? inheritRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

        const { ok, data } = await apiCall(url, '/auth/roles', {
          method: 'POST',
          body: { name, description, permissions, inheritFrom },
        });

        if (!ok) {
          stderr.write(`Error: ${JSON.stringify(data)}\n`);
          return 1;
        }
        const created = (data as { role: Record<string, unknown> }).role;
        stdout.write(`Created role: ${String(created.id)} (${String(created.name)})\n`);
        return 0;
      }

      case 'delete': {
        const roleId = restArgs[0];
        if (!roleId) {
          stderr.write('Error: role ID argument is required\n');
          return 1;
        }

        const { ok, data } = await apiCall(url, `/auth/roles/${encodeURIComponent(roleId)}`, {
          method: 'DELETE',
        });
        if (!ok) {
          stderr.write(`Error: ${JSON.stringify(data)}\n`);
          return 1;
        }
        stdout.write(`Deleted role: ${roleId}\n`);
        return 0;
      }

      case 'assign': {
        const { value: userId, rest: r1 } = extractFlag(restArgs, 'user');
        const { value: roleId } = extractFlag(r1, 'role');

        if (!userId) {
          stderr.write('Error: --user is required\n');
          return 1;
        }
        if (!roleId) {
          stderr.write('Error: --role is required\n');
          return 1;
        }

        const { ok, data } = await apiCall(url, '/auth/assignments', {
          method: 'POST',
          body: { userId, roleId },
        });
        if (!ok) {
          stderr.write(`Error: ${JSON.stringify(data)}\n`);
          return 1;
        }
        stdout.write(`Assigned role ${roleId} to user ${userId}\n`);
        return 0;
      }

      case 'revoke': {
        const { value: userId } = extractFlag(restArgs, 'user');
        if (!userId) {
          stderr.write('Error: --user is required\n');
          return 1;
        }

        const { ok, data } = await apiCall(url, `/auth/assignments/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
        });
        if (!ok) {
          stderr.write(`Error: ${JSON.stringify(data)}\n`);
          return 1;
        }
        stdout.write(`Revoked role assignment for user ${userId}\n`);
        return 0;
      }

      case 'assignments': {
        const { ok, data } = await apiCall(url, '/auth/assignments');
        if (!ok) {
          stderr.write(`Error: ${JSON.stringify(data)}\n`);
          return 1;
        }
        const assignments = (data as { assignments: { userId: string; roleId: string }[] })
          .assignments;
        if (jsonFlag) {
          stdout.write(JSON.stringify(assignments, null, 2) + '\n');
        } else {
          const rows = assignments.map((a) => ({
            userId: a.userId,
            roleId: a.roleId,
          }));
          stdout.write(formatTable(rows, ['userId', 'roleId']) + '\n');
        }
        return 0;
      }

      default:
        stderr.write(
          `Unknown action: ${action}\nUsage: secureyeoman role [list|create|delete|assign|revoke|assignments]\n`
        );
        return 1;
    }
  },
};
