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

// Command blacklist for security
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  '> /dev/sda',
  'mkfs',
  'dd if=/dev/zero',
  ':(){ :|:& };:', // fork bomb
  'chmod -R 777 /',
];

// Check if command is potentially dangerous
function isBlockedCommand(command: string): boolean {
  const normalized = command.toLowerCase().trim();
  return BLOCKED_COMMANDS.some((blocked) => normalized.includes(blocked.toLowerCase()));
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

      // Ensure working directory is within allowed paths (prevent directory traversal)
      const allowedPrefixes = [process.cwd(), '/home', '/tmp', '/var/tmp'];

      const isAllowedPath = allowedPrefixes.some(
        (prefix) => workingDir.startsWith(prefix) || workingDir === prefix
      );

      if (!isAllowedPath && !workingDir.startsWith(process.cwd())) {
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
