/**
 * Docker Tools — container and image management as MCP tools.
 *
 * Requires MCP_EXPOSE_DOCKER=true to enable.
 *
 * Supports two deployment modes via MCP_DOCKER_MODE:
 *   socket (default) — `docker` CLI uses the mounted host socket (/var/run/docker.sock).
 *                      Add this to your docker-compose.yml service:
 *                        volumes:
 *                          - /var/run/docker.sock:/var/run/docker.sock:ro
 *   dind             — Docker-in-Docker sidecar; set MCP_DOCKER_HOST (e.g. tcp://docker:2376).
 *                      Requires a `docker:dind` service in your compose stack with TLS disabled
 *                      or properly configured certs.
 *
 * Write operations (start, stop, restart, exec, pull, compose up/down) are gated
 * by MCP_EXPOSE_DOCKER=true. Read operations (ps, logs, inspect, stats, images,
 * compose ps/logs) follow the same gate — all tools are off by default.
 */

import { execFile } from 'node:child_process';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, errorResponse } from './tool-utils.js';

const MAX_OUTPUT = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT = 60_000; // 1 minute
const COMPOSE_TIMEOUT = 300_000; // 5 minutes for up/down

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildDockerEnv(config: McpServiceConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (config.dockerMode === 'dind' && config.dockerHost) {
    env.DOCKER_HOST = config.dockerHost;
  }
  return env;
}

function runDocker(
  config: McpServiceConfig,
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      args,
      { env: buildDockerEnv(config), maxBuffer: MAX_OUTPUT, timeout: timeoutMs },
      (error: Error | null, stdout: string, stderr: string) => {
        if (error && !stdout && !stderr) {
          reject(error);
          return;
        }
        resolve({
          stdout:
            stdout.length > MAX_OUTPUT ? stdout.slice(0, MAX_OUTPUT) + '\n...[truncated]' : stdout,
          stderr:
            stderr.length > MAX_OUTPUT ? stderr.slice(0, MAX_OUTPUT) + '\n...[truncated]' : stderr,
        });
      }
    );
  });
}

const DOCKER_DISABLED_MSG = 'Docker tools are disabled. Set MCP_EXPOSE_DOCKER=true to enable.';

function disabled() {
  return errorResponse(DOCKER_DISABLED_MSG);
}

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerDockerTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  // ── docker_ps ───────────────────────────────────────────────────────────
  server.tool(
    'docker_ps',
    'List Docker containers (running by default, use all=true to include stopped)',
    {
      all: z.boolean().default(false).describe('Include stopped containers'),
    },
    wrapToolHandler('docker_ps', middleware, async ({ all }) => {
      if (!config.exposeDockerTools) return disabled();
      const args = ['ps', '--format', '{{json .}}'];
      if (all) args.push('--all');
      const { stdout, stderr } = await runDocker(config, args);
      // Each line is a JSON object; parse and re-emit as a JSON array
      const lines = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      let containers: unknown[];
      try {
        containers = lines.map((l) => JSON.parse(l));
      } catch {
        containers = lines;
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { containers, count: containers.length, stderr: stderr || undefined },
              null,
              2
            ),
          },
        ],
      };
    })
  );

  // ── docker_logs ─────────────────────────────────────────────────────────
  server.tool(
    'docker_logs',
    'Fetch logs from a Docker container',
    {
      container: z.string().min(1).describe('Container name or ID'),
      tail: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(100)
        .describe('Number of lines from the end'),
      timestamps: z.boolean().default(false).describe('Include timestamps'),
    },
    wrapToolHandler('docker_logs', middleware, async ({ container, tail, timestamps }) => {
      if (!config.exposeDockerTools) return disabled();
      const args = ['logs', '--tail', String(tail)];
      if (timestamps) args.push('--timestamps');
      args.push(container);
      const { stdout, stderr } = await runDocker(config, args);
      return {
        content: [{ type: 'text', text: stdout || stderr || '(no output)' }],
      };
    })
  );

  // ── docker_inspect ───────────────────────────────────────────────────────
  server.tool(
    'docker_inspect',
    'Return detailed metadata for a container or image as JSON',
    {
      target: z.string().min(1).describe('Container or image name/ID to inspect'),
      type: z.enum(['container', 'image']).default('container'),
    },
    wrapToolHandler('docker_inspect', middleware, async ({ target, type }) => {
      if (!config.exposeDockerTools) return disabled();
      const args =
        type === 'image' ? ['image', 'inspect', target] : ['container', 'inspect', target];
      const { stdout, stderr } = await runDocker(config, args);
      return {
        content: [{ type: 'text', text: stdout || stderr || '(no output)' }],
      };
    })
  );

  // ── docker_stats ─────────────────────────────────────────────────────────
  server.tool(
    'docker_stats',
    'Get a one-shot snapshot of resource usage (CPU, memory, network I/O) for running containers',
    {
      containers: z
        .array(z.string())
        .default([])
        .describe('Container names/IDs to query; empty = all running containers'),
    },
    wrapToolHandler('docker_stats', middleware, async ({ containers }) => {
      if (!config.exposeDockerTools) return disabled();
      const args = ['stats', '--no-stream', '--format', '{{json .}}', ...containers];
      const { stdout, stderr } = await runDocker(config, args);
      const lines = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      let stats: unknown[];
      try {
        stats = lines.map((l) => JSON.parse(l));
      } catch {
        stats = lines;
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { stats, count: stats.length, stderr: stderr || undefined },
              null,
              2
            ),
          },
        ],
      };
    })
  );

  // ── docker_images ────────────────────────────────────────────────────────
  server.tool(
    'docker_images',
    'List locally available Docker images',
    {
      filter: z
        .string()
        .default('')
        .describe('Optional filter (e.g. "dangling=true", "label=env=prod")'),
    },
    wrapToolHandler('docker_images', middleware, async ({ filter }) => {
      if (!config.exposeDockerTools) return disabled();
      const args = ['images', '--format', '{{json .}}'];
      if (filter) args.push('--filter', filter);
      const { stdout, stderr } = await runDocker(config, args);
      const lines = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      let images: unknown[];
      try {
        images = lines.map((l) => JSON.parse(l));
      } catch {
        images = lines;
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { images, count: images.length, stderr: stderr || undefined },
              null,
              2
            ),
          },
        ],
      };
    })
  );

  // ── docker_start ─────────────────────────────────────────────────────────
  server.tool(
    'docker_start',
    'Start one or more stopped Docker containers',
    {
      containers: z.array(z.string().min(1)).min(1).describe('Container names or IDs to start'),
    },
    wrapToolHandler('docker_start', middleware, async ({ containers }) => {
      if (!config.exposeDockerTools) return disabled();
      const { stdout, stderr } = await runDocker(config, ['start', ...containers]);
      return {
        content: [{ type: 'text', text: stdout || stderr || '(started)' }],
      };
    })
  );

  // ── docker_stop ──────────────────────────────────────────────────────────
  server.tool(
    'docker_stop',
    'Stop one or more running Docker containers',
    {
      containers: z.array(z.string().min(1)).min(1).describe('Container names or IDs to stop'),
      timeout: z
        .number()
        .int()
        .min(0)
        .max(300)
        .default(10)
        .describe('Seconds to wait before SIGKILL'),
    },
    wrapToolHandler('docker_stop', middleware, async ({ containers, timeout }) => {
      if (!config.exposeDockerTools) return disabled();
      const { stdout, stderr } = await runDocker(config, [
        'stop',
        '--time',
        String(timeout),
        ...containers,
      ]);
      return {
        content: [{ type: 'text', text: stdout || stderr || '(stopped)' }],
      };
    })
  );

  // ── docker_restart ───────────────────────────────────────────────────────
  server.tool(
    'docker_restart',
    'Restart one or more Docker containers',
    {
      containers: z.array(z.string().min(1)).min(1).describe('Container names or IDs to restart'),
      timeout: z
        .number()
        .int()
        .min(0)
        .max(300)
        .default(10)
        .describe('Seconds to wait before SIGKILL'),
    },
    wrapToolHandler('docker_restart', middleware, async ({ containers, timeout }) => {
      if (!config.exposeDockerTools) return disabled();
      const { stdout, stderr } = await runDocker(config, [
        'restart',
        '--time',
        String(timeout),
        ...containers,
      ]);
      return {
        content: [{ type: 'text', text: stdout || stderr || '(restarted)' }],
      };
    })
  );

  // ── docker_exec ──────────────────────────────────────────────────────────
  server.tool(
    'docker_exec',
    'Execute a command inside a running Docker container and return its output',
    {
      container: z.string().min(1).describe('Container name or ID'),
      command: z
        .array(z.string())
        .min(1)
        .describe('Command and arguments as a string array — e.g. ["sh", "-c", "ls /app"]'),
      workdir: z.string().optional().describe('Working directory inside the container'),
      user: z.string().optional().describe('Run as this user (name or UID[:GID])'),
    },
    wrapToolHandler('docker_exec', middleware, async ({ container, command, workdir, user }) => {
      if (!config.exposeDockerTools) return disabled();
      const args = ['exec'];
      if (workdir) args.push('--workdir', workdir);
      if (user) args.push('--user', user);
      args.push(container, ...command);
      const { stdout, stderr } = await runDocker(config, args);
      return {
        content: [{ type: 'text', text: stdout || stderr || '(no output)' }],
      };
    })
  );

  // ── docker_pull ──────────────────────────────────────────────────────────
  server.tool(
    'docker_pull',
    'Pull a Docker image from a registry',
    {
      image: z
        .string()
        .min(1)
        .describe('Image reference to pull (e.g. "nginx:latest", "ghcr.io/org/app:v1.2")'),
    },
    wrapToolHandler('docker_pull', middleware, async ({ image }) => {
      if (!config.exposeDockerTools) return disabled();
      const { stdout, stderr } = await runDocker(config, ['pull', image], COMPOSE_TIMEOUT);
      return {
        content: [{ type: 'text', text: stdout || stderr || '(pulled)' }],
      };
    })
  );

  // ── docker_compose_ps ────────────────────────────────────────────────────
  server.tool(
    'docker_compose_ps',
    'List services defined in a Docker Compose project',
    {
      workdir: z.string().min(1).describe('Directory containing the docker-compose.yml file'),
      all: z.boolean().default(false).describe('Include stopped services'),
    },
    wrapToolHandler('docker_compose_ps', middleware, async ({ workdir, all }) => {
      if (!config.exposeDockerTools) return disabled();
      const args = ['compose', '--project-directory', workdir, 'ps', '--format', 'json'];
      if (all) args.push('--all');
      const { stdout, stderr } = await runDocker(config, args);
      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = stdout;
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ services: parsed, stderr: stderr || undefined }, null, 2),
          },
        ],
      };
    })
  );

  // ── docker_compose_logs ──────────────────────────────────────────────────
  server.tool(
    'docker_compose_logs',
    'Fetch recent logs from a Docker Compose project or a specific service within it',
    {
      workdir: z.string().min(1).describe('Directory containing the docker-compose.yml file'),
      service: z.string().default('').describe('Specific service name; empty = all services'),
      tail: z.number().int().min(1).max(10000).default(100).describe('Lines per service'),
      timestamps: z.boolean().default(false),
    },
    wrapToolHandler(
      'docker_compose_logs',
      middleware,
      async ({ workdir, service, tail, timestamps }) => {
        if (!config.exposeDockerTools) return disabled();
        const args = [
          'compose',
          '--project-directory',
          workdir,
          'logs',
          '--tail',
          String(tail),
          '--no-color',
        ];
        if (timestamps) args.push('--timestamps');
        if (service) args.push(service);
        const { stdout, stderr } = await runDocker(config, args);
        return {
          content: [{ type: 'text', text: stdout || stderr || '(no output)' }],
        };
      }
    )
  );

  // ── docker_compose_up ────────────────────────────────────────────────────
  server.tool(
    'docker_compose_up',
    'Start services defined in a Docker Compose file (detached mode)',
    {
      workdir: z.string().min(1).describe('Directory containing the docker-compose.yml file'),
      services: z
        .array(z.string())
        .default([])
        .describe('Specific service names to start; empty = all services'),
      build: z.boolean().default(false).describe('Rebuild images before starting'),
      pull: z
        .enum(['always', 'missing', 'never'])
        .default('missing')
        .describe('Pull policy for images'),
    },
    wrapToolHandler('docker_compose_up', middleware, async ({ workdir, services, build, pull }) => {
      if (!config.exposeDockerTools) return disabled();
      const args = ['compose', '--project-directory', workdir, 'up', '--detach', '--pull', pull];
      if (build) args.push('--build');
      args.push(...services);
      const { stdout, stderr } = await runDocker(config, args, COMPOSE_TIMEOUT);
      return {
        content: [{ type: 'text', text: stdout || stderr || '(started)' }],
      };
    })
  );

  // ── docker_compose_down ──────────────────────────────────────────────────
  server.tool(
    'docker_compose_down',
    'Stop and remove containers, networks defined in a Docker Compose file',
    {
      workdir: z.string().min(1).describe('Directory containing the docker-compose.yml file'),
      volumes: z
        .boolean()
        .default(false)
        .describe('Also remove named volumes declared in the compose file'),
      removeOrphans: z
        .boolean()
        .default(false)
        .describe('Remove containers for services not defined in the compose file'),
    },
    wrapToolHandler(
      'docker_compose_down',
      middleware,
      async ({ workdir, volumes, removeOrphans }) => {
        if (!config.exposeDockerTools) return disabled();
        const args = ['compose', '--project-directory', workdir, 'down'];
        if (volumes) args.push('--volumes');
        if (removeOrphans) args.push('--remove-orphans');
        const { stdout, stderr } = await runDocker(config, args, COMPOSE_TIMEOUT);
        return {
          content: [{ type: 'text', text: stdout || stderr || '(stopped)' }],
        };
      }
    )
  );
}
