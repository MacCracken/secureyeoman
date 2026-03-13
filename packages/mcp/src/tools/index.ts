/**
 * Tool Registry — registers all MCP tools.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { RateLimiterMiddleware } from '../middleware/rate-limiter.js';
import type { InputValidatorMiddleware } from '../middleware/input-validator.js';
import type { AuditLoggerMiddleware } from '../middleware/audit-logger.js';
import type { SecretRedactorMiddleware } from '../middleware/secret-redactor.js';
import { registerBrainTools } from './brain-tools.js';
import { registerTaskTools } from './task-tools.js';
import { registerSystemTools } from './system-tools.js';
import { registerIntegrationTools } from './integration-tools.js';
import { registerSoulTools } from './soul-tools.js';
import { registerAuditTools } from './audit-tools.js';
import { registerFilesystemTools } from './filesystem-tools.js';
import { registerGitTools } from './git-tools.js';
import { registerWebTools } from './web-tools.js';
import { registerBrowserTools, type OnBrowserSessionEvent } from './browser-tools.js';
import { registerMultimodalTools } from './multimodal-tools.js';
import { registerSecurityTools } from './security-tools.js';
import { registerAgnosticTools } from './agnostic-tools.js';
import { registerAgnosTools } from './agnos-tools.js';
import { registerTradingTools } from './trading-tools.js';
import { registerPhotisnadiTools } from './photisnadi-tools.js';
import { registerSynapseTools } from './synapse-tools.js';
import { registerDeltaTools } from './delta-tools.js';
import { registerWorkflowTools } from './workflow-tools.js';
import { registerQuickBooksTools } from './quickbooks-tools.js';
import { registerDiagnosticTools } from './diagnostic-tools.js';
import { registerDesktopTools } from './desktop-tools.js';
import { registerVideoStreamTools } from './video-tools.js';
import { registerNetworkTools } from './network-tools.js';
import { registerTwingateTools } from './twingate-tools.js';
import { registerIntentTools } from './intent-tools.js';
import { registerGmailTools } from './gmail-tools.js';
import { registerTwitterTools } from './twitter-tools.js';
import { registerGithubApiTools } from './github-api-tools.js';
import { registerOllamaTools } from './ollama-tools.js';
import { registerDockerTools } from './docker-tools.js';
import { registerKnowledgeBaseTools } from './knowledge-base-tools.js';
import { registerGithubActionsTools } from './github-actions-tools.js';
import { registerJenkinsTools } from './jenkins-tools.js';
import { registerGitlabCiTools } from './gitlab-ci-tools.js';
import { registerNorthflankTools } from './northflank-tools.js';
import { registerSraTools } from './sra-tools.js';
import { registerExcalidrawTools } from './excalidraw-tools.js';
import { registerPdfTools } from './pdf-tools.js';
import { registerChartTools } from './chart-tools.js';
import { registerConstitutionalTools } from './constitutional-tools.js';
import { registerResponsibleAiTools } from './responsible-ai-tools.js';
import { registerTeeTools } from './tee-tools.js';
import { registerTrainingTools } from './training-tools.js';
import { registerEvalTools } from './eval-tools.js';
import { registerDlpTools } from './dlp-tools.js';
import { registerTerminalTools } from './terminal-tools.js';
import { registerGoogleCalendarTools } from './googlecalendar-tools.js';
import { registerLinearTools } from './linear-tools.js';
import { registerTodoistTools } from './todoist-tools.js';
import { registerJiraTools } from './jira-tools.js';
import { registerNotionTools } from './notion-tools.js';
import { registerGoogleWorkspaceTools } from './google-workspace-tools.js';
import { registerVoiceTools } from './voice-tools.js';
import { registerEdgeTools } from './edge-tools.js';

export interface ToolMiddleware {
  rateLimiter: RateLimiterMiddleware;
  inputValidator: InputValidatorMiddleware;
  auditLogger: AuditLoggerMiddleware;
  secretRedactor: SecretRedactorMiddleware;
}

export async function registerAllTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware,
  onBrowserSessionEvent?: OnBrowserSessionEvent
): Promise<void> {
  registerBrainTools(server, client, middleware);
  registerTaskTools(server, client, middleware);
  registerSystemTools(server, client, config, middleware);
  registerIntegrationTools(server, client, middleware);
  registerSoulTools(server, client, middleware);
  registerAuditTools(server, client, middleware);

  // Git & filesystem tools are always registered at the MCP protocol level.
  // Feature toggles (exposeGit, exposeFilesystem) control visibility in the
  // core API response, not whether the tools exist on the MCP server.
  registerGitTools(server, config, middleware);
  registerFilesystemTools(server, config, middleware);
  registerWebTools(server, config, middleware, client);
  registerBrowserTools(server, config, middleware, onBrowserSessionEvent);
  registerMultimodalTools(server, client, middleware);
  await registerSecurityTools(server, config, middleware);
  registerAgnosticTools(server, config, middleware);
  registerAgnosTools(server, config, middleware);
  registerTradingTools(server, config, middleware);
  registerPhotisnadiTools(server, config, middleware);
  registerSynapseTools(server, config, middleware);
  registerDeltaTools(server, config, middleware);
  registerWorkflowTools(server, client, middleware);
  registerQuickBooksTools(server, config, middleware);
  registerDiagnosticTools(server, client, middleware);
  registerDesktopTools(server, client, config, middleware);
  registerVideoStreamTools(server, client, config, middleware);
  await registerNetworkTools(server, config, middleware);
  registerTwingateTools(server, client, config, middleware);
  registerIntentTools(server, client, config, middleware);
  registerGmailTools(server, client, middleware);
  registerTwitterTools(server, client, middleware);
  registerGithubApiTools(server, client, middleware, config.tokenSecret);
  registerOllamaTools(server, client, middleware);
  registerDockerTools(server, config, middleware);
  registerKnowledgeBaseTools(server, client, config, middleware);
  // CI/CD tools (Phase 90)
  registerGithubActionsTools(server, config, middleware);
  registerJenkinsTools(server, config, middleware);
  registerGitlabCiTools(server, config, middleware);
  registerNorthflankTools(server, config, middleware);
  // SRA tools (Phase 123)
  registerSraTools(server, client, config, middleware);
  // Excalidraw diagramming tools (Phase 117)
  registerExcalidrawTools(server, config, middleware);
  // PDF analysis tools (Phase 122-A)
  registerPdfTools(server, client, config, middleware);
  // Financial charting tools (Phase 125)
  registerChartTools(server, config, middleware);
  // Constitutional AI tools
  registerConstitutionalTools(server, client, config, middleware);
  // Responsible AI tools (Phase 130)
  registerResponsibleAiTools(server, client, middleware);
  // TEE / Confidential Computing tools (Phase 129-D)
  registerTeeTools(server, client, config, middleware);
  // Training, inference optimization, and continual learning tools (Phases 131-133)
  registerTrainingTools(server, client, middleware);
  // Agent Eval Harness tools (Phase 135)
  registerEvalTools(server, client, middleware);
  // DLP tools (Phase 136-F)
  registerDlpTools(server, client, config, middleware);
  // Terminal tools
  registerTerminalTools(server, client, config, middleware);
  // Integration adapter tools (Google Calendar, Linear, Todoist, Jira, Notion)
  registerGoogleCalendarTools(server, client, middleware);
  registerLinearTools(server, client, middleware);
  registerTodoistTools(server, client, middleware);
  registerJiraTools(server, client, middleware);
  registerNotionTools(server, client, middleware);
  // Google Workspace tools (Drive, Sheets, Docs)
  registerGoogleWorkspaceTools(server, client, middleware);
  // Voice profile tools
  registerVoiceTools(server, client, config, middleware);
  // Edge fleet tools (Phase 14D)
  registerEdgeTools(server, config, middleware);
}
