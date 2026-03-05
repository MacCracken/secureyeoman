/**
 * Terminal Routes — Execute shell commands in a specific working directory.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { statSync, existsSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';
import { getLogger, type SecureLogger } from '../logging/logger.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { buildSafeEnv } from '../utils/process-env.js';

const execAsync = promisify(exec);

interface ExecuteCommandBody {
  command: string;
  cwd?: string;
  allowedCommands?: string[];
}

interface TechStackResponse {
  stacks: string[];
  allowedCommands: string[];
}

interface ExecuteCommandResponse {
  output: string;
  error: string;
  exitCode: number;
  cwd: string;
}

// Commands that destroy data or the system — checked case-insensitively
const BLOCKED_PATTERNS = [
  /rm\s+-[a-z]*r[a-z]*f?\s+[/~*]/, // rm -rf / or rm -r ~
  />\s*\/dev\/(sda|sdb|sdc|null|zero|random)/, // clobber devices
  /mkfs(\.[a-z0-9]+)?\s+\//, // format root
  /dd\s+if=\/dev\/(zero|urandom|random)/, // zero-fill
  /:\s*\(\s*\)\s*\{/, // fork bomb preamble :(){
  /chmod\s+-[a-z]*R[a-z]*\s+777\s+\//, // chmod -R 777 /
  /shutdown|reboot|halt|poweroff|init\s+0/, // system control
  /\bkill\s+-9\s+-1\b/, // kill all processes
  /chown\s+-[a-z]*R[a-z]*\s+.*\//, // recursive chown on root paths
  /passwd\s*$/, // interactive passwd change
  />\s*\/etc\//, // clobber system configs
];

// Shell injection patterns — block command chaining/substitution/redirection
// Matches: $(), ${}, backticks, &&, ||, ;, |, >, <
// Pipe (|) is allowed only for whitelisted patterns like `| grep`, `| head`, `| tail`, `| wc`, `| sort`
const SHELL_INJECTION_PATTERN = /[;&`]|(\$\()|(\${)|&&|\|\||>>|<<|[><]/;
const SAFE_PIPE_PATTERN = /\|\s*(grep|head|tail|wc|sort|uniq|less|more|cat|awk|sed|cut|tr)\b/;

function containsShellInjection(command: string): boolean {
  // Check for unsafe metacharacters
  if (SHELL_INJECTION_PATTERN.test(command)) return true;
  // Check for pipes — only allow safe pipe targets
  if (command.includes('|')) {
    const parts = command.split('|').slice(1); // skip the first segment (the base command)
    for (const part of parts) {
      const trimmed = part.trim();
      if (!SAFE_PIPE_PATTERN.test('| ' + trimmed)) return true;
    }
  }
  return false;
}

// Sensitive absolute paths that must not be the cwd
const SENSITIVE_PATH_PREFIXES = ['/etc', '/root', '/boot', '/proc', '/sys', '/dev'];

// Check if command is potentially dangerous
function isBlockedCommand(command: string): boolean {
  const lower = command.toLowerCase();
  if (BLOCKED_PATTERNS.some((re) => re.test(lower))) return true;
  // Block all shell injection metacharacters (command chaining, substitution, redirection)
  if (containsShellInjection(command)) return true;
  return false;
}

// Tech-stack detection: marker file → { stack name, allowed commands }
const TECH_STACK_DETECTORS: {
  files: string[];
  stack: string;
  commands: string[];
}[] = [
  {
    files: ['package.json'],
    stack: 'node',
    commands: ['npm', 'npx', 'node', 'yarn', 'pnpm', 'bun', 'tsc', 'vitest', 'jest', 'eslint'],
  },
  {
    files: ['Cargo.toml'],
    stack: 'rust',
    commands: ['cargo', 'rustc', 'rustfmt'],
  },
  {
    files: ['pyproject.toml', 'requirements.txt'],
    stack: 'python',
    commands: ['python', 'python3', 'pip', 'pip3', 'pytest', 'poetry', 'uv', 'black', 'ruff'],
  },
  {
    files: ['go.mod'],
    stack: 'go',
    commands: ['go', 'gofmt'],
  },
  {
    files: ['pom.xml', 'build.gradle'],
    stack: 'java',
    commands: ['java', 'javac', 'mvn', 'gradle'],
  },
  {
    files: ['Gemfile'],
    stack: 'ruby',
    commands: ['ruby', 'gem', 'bundle', 'rake'],
  },
  {
    files: ['docker-compose.yml', 'docker-compose.yaml'],
    stack: 'docker',
    commands: ['docker', 'docker-compose', 'docker compose'],
  },
  {
    files: ['.git'],
    stack: 'git',
    commands: ['git'],
  },
];

const COMMON_COMMANDS = [
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'mkdir',
  'touch',
  'cp',
  'mv',
  'echo',
  'pwd',
  'env',
  'which',
  'curl',
  'wget',
  'jq',
];

export function registerTerminalRoutes(app: FastifyInstance): void {
  const logger: SecureLogger = getLogger().child({ component: 'TerminalRoutes' });

  app.post(
    '/api/v1/terminal/execute',
    async (request: FastifyRequest<{ Body: ExecuteCommandBody }>, reply: FastifyReply) => {
      const { command, cwd, allowedCommands } = request.body;

      if (!command || typeof command !== 'string') {
        return sendError(reply, 400, 'Command is required');
      }

      // Allowlist enforcement: if a workspace-scoped allowedCommands list was provided,
      // check the base command against it before any other security checks.
      if (allowedCommands && Array.isArray(allowedCommands)) {
        const baseCmd = command.trim().split(/\s+/)[0] ?? '';
        if (!allowedCommands.includes(baseCmd)) {
          return sendError(
            reply,
            403,
            `Command blocked: ${baseCmd} is not in allowed set for this workspace`
          );
        }
      }

      // Security: Check for blocked commands
      if (isBlockedCommand(command)) {
        logger.warn('Blocked dangerous command', { command, ip: request.ip });
        return sendError(reply, 403, 'Command is not allowed for security reasons');
      }

      // Validate working directory
      const workingDir = cwd && typeof cwd === 'string' ? cwd : process.cwd();

      // Reject sensitive system path prefixes first (fast path, before allowlist check)
      if (SENSITIVE_PATH_PREFIXES.some((p) => workingDir === p || workingDir.startsWith(p + '/'))) {
        logger.warn('Blocked command with sensitive working directory', {
          command,
          cwd: workingDir,
          ip: request.ip,
        });
        return sendError(reply, 403, 'Working directory is not allowed.');
      }

      // Ensure working directory is within allowed paths (prevent directory traversal)
      const allowedPrefixes = [process.cwd(), '/home', '/tmp', '/var/tmp'];

      const isAllowedPath =
        allowedPrefixes.some(
          (prefix) => workingDir === prefix || workingDir.startsWith(prefix + '/')
        ) || workingDir.startsWith(process.cwd() + '/');

      if (!isAllowedPath) {
        logger.warn('Blocked command with disallowed working directory', {
          command,
          cwd: workingDir,
          ip: request.ip,
        });
        return sendError(
          reply,
          403,
          'Working directory is not allowed. Must be within project directory or standard system paths.'
        );
      }

      // ── cd interception ────────────────────────────────────────────────────
      // Each execAsync call runs in an isolated subprocess, so `cd` has no
      // persistent effect.  We resolve the path ourselves and return the new
      // cwd without spawning a child process.
      const cdMatch = /^\s*cd(?:\s+(.*?))?\s*$/.exec(command);
      if (cdMatch) {
        const arg = cdMatch[1]?.trim() ?? '';

        if (arg === '-') {
          // cd - requires OLDPWD which we don't track
          return {
            output: '',
            error: 'cd: OLDPWD not set (stateless terminal)',
            exitCode: 1,
            cwd: workingDir,
          } satisfies ExecuteCommandResponse;
        }

        // Expand ~ prefix
        const expanded =
          !arg || arg === '~'
            ? (process.env.HOME ?? '/tmp')
            : arg.startsWith('~/')
              ? (process.env.HOME ?? '/tmp') + arg.slice(1)
              : arg;

        const target = resolvePath(workingDir, expanded);

        // Apply the same security checks to the target directory
        if (SENSITIVE_PATH_PREFIXES.some((p) => target === p || target.startsWith(p + '/'))) {
          return {
            output: '',
            error: `cd: ${target}: Permission denied`,
            exitCode: 1,
            cwd: workingDir,
          } satisfies ExecuteCommandResponse;
        }

        const targetAllowed =
          allowedPrefixes.some((prefix) => target === prefix || target.startsWith(prefix + '/')) ||
          target.startsWith(process.cwd() + '/');

        if (!targetAllowed) {
          return {
            output: '',
            error: `cd: ${target}: Permission denied`,
            exitCode: 1,
            cwd: workingDir,
          } satisfies ExecuteCommandResponse;
        }

        // Verify the target actually exists and is a directory
        let isDir = false;
        try {
          isDir = statSync(target).isDirectory();
        } catch {
          isDir = false;
        }
        if (!isDir) {
          return {
            output: '',
            error: `cd: ${target}: No such file or directory`,
            exitCode: 1,
            cwd: workingDir,
          } satisfies ExecuteCommandResponse;
        }

        logger.debug('cd resolved', { from: workingDir, to: target });
        return { output: '', error: '', exitCode: 0, cwd: target } satisfies ExecuteCommandResponse;
      }
      // ───────────────────────────────────────────────────────────────────────

      try {
        logger.debug('Executing terminal command', { command, cwd: workingDir });

        const { stdout, stderr } = await execAsync(command, {
          cwd: workingDir,
          timeout: 30000, // 30 second timeout
          maxBuffer: 1024 * 1024, // 1MB max output
          env: buildSafeEnv(),
        });

        const response: ExecuteCommandResponse = {
          output: stdout,
          error: stderr,
          exitCode: 0,
          cwd: workingDir,
        };

        logger.debug('Command executed successfully', {
          command,
          cwd: workingDir,
          outputLength: stdout.length,
        });

        return response;
      } catch (error) {
        const execError = error as { stdout?: string; stderr?: string; code?: number };

        const response: ExecuteCommandResponse = {
          output: execError.stdout ?? '',
          error: execError.stderr ?? toErrorMessage(error),
          exitCode: execError.code ?? 1,
          cwd: workingDir,
        };

        logger.debug('Command executed with non-zero exit code', {
          command,
          cwd: workingDir,
          exitCode: response.exitCode,
        });

        // Return 200 with error details - this is expected for commands that fail
        return response;
      }
    }
  );

  // Tech-stack detection endpoint
  app.get(
    '/api/v1/terminal/tech-stack',
    async (request: FastifyRequest<{ Querystring: { cwd?: string } }>, _reply: FastifyReply) => {
      const dir = request.query.cwd ?? process.cwd();
      const stacks: string[] = [];
      const allowedCommandsSet = new Set<string>(COMMON_COMMANDS);

      for (const detector of TECH_STACK_DETECTORS) {
        const matched = detector.files.some((file) => existsSync(join(dir, file)));
        if (matched) {
          stacks.push(detector.stack);
          for (const cmd of detector.commands) {
            allowedCommandsSet.add(cmd);
          }
        }
      }

      // Always include 'common' stack
      stacks.push('common');

      const response: TechStackResponse = {
        stacks,
        allowedCommands: Array.from(allowedCommandsSet),
      };

      return response;
    }
  );

  // Health check endpoint
  app.get('/api/v1/terminal/health', async () => {
    return { status: 'ok', shell: process.env.SHELL ?? '/bin/sh' };
  });
}
