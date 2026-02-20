/**
 * Terminal Routes — Execute shell commands in a specific working directory.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getLogger, type SecureLogger } from '../logging/logger.js';
import { sendError } from '../utils/errors.js';

const execAsync = promisify(exec);

interface ExecuteCommandBody {
  command: string;
  cwd?: string;
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

// Shell metacharacter injection — block command chaining/substitution against sensitive targets
const SHELL_INJECTION_PATTERN = /[;&|`]|(\$\()|(\${)/;

// Sensitive absolute paths that must not be the cwd
const SENSITIVE_PATH_PREFIXES = ['/etc', '/root', '/boot', '/proc', '/sys', '/dev'];

// Check if command is potentially dangerous
function isBlockedCommand(command: string): boolean {
  const lower = command.toLowerCase();
  if (BLOCKED_PATTERNS.some((re) => re.test(lower))) return true;
  // Block commands containing shell injection operators targeting sensitive paths
  if (SHELL_INJECTION_PATTERN.test(command) && SENSITIVE_PATH_PREFIXES.some((p) => command.includes(p))) return true;
  return false;
}

export function registerTerminalRoutes(app: FastifyInstance): void {
  const logger: SecureLogger = getLogger().child({ component: 'TerminalRoutes' });

  app.post(
    '/api/v1/terminal/execute',
    async (request: FastifyRequest<{ Body: ExecuteCommandBody }>, reply: FastifyReply) => {
      const { command, cwd } = request.body;

      if (!command || typeof command !== 'string') {
        return sendError(reply, 400, 'Command is required');
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
        logger.warn('Blocked command with sensitive working directory', { command, cwd: workingDir, ip: request.ip });
        return sendError(reply, 403, 'Working directory is not allowed.');
      }

      // Ensure working directory is within allowed paths (prevent directory traversal)
      const allowedPrefixes = [process.cwd(), '/home', '/tmp', '/var/tmp'];

      const isAllowedPath =
        allowedPrefixes.some((prefix) => workingDir === prefix || workingDir.startsWith(prefix + '/'))
        || workingDir.startsWith(process.cwd() + '/');

      if (!isAllowedPath) {
        logger.warn('Blocked command with disallowed working directory', {
          command,
          cwd: workingDir,
          ip: request.ip,
        });
        return sendError(reply, 403, 'Working directory is not allowed. Must be within project directory or standard system paths.');
      }

      try {
        logger.debug('Executing terminal command', { command, cwd: workingDir });

        const { stdout, stderr } = await execAsync(command, {
          cwd: workingDir,
          timeout: 30000, // 30 second timeout
          maxBuffer: 1024 * 1024, // 1MB max output
          env: {
            ...process.env,
            // Restrict PATH for security
            PATH: '/usr/local/bin:/usr/bin:/bin',
          },
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
          error: execError.stderr ?? (error instanceof Error ? error.message : String(error)),
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

  // Health check endpoint
  app.get('/api/v1/terminal/health', async () => {
    return { status: 'ok', shell: process.env.SHELL ?? '/bin/sh' };
  });
}
