import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cable,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Power,
  PowerOff,
  Terminal,
  Globe,
  Wrench,
  GitBranch,
  CreditCard,
  Zap,
  Building2,
  FolderOpen,
  Info,
  Eye,
  EyeOff,
  MessageCircle,
  MessageSquare,
  Mail,
  Radio,
  CheckCircle,
  XCircle,
  AlertCircle,
  GitBranch as GitBranchIcon,
  HelpCircle,
  ArrowRightLeft,
  Loader2,
  Send,
  Hash,
  Smartphone,
  Users,
  Calendar,
  BookOpen,
  GitMerge,
  LayoutGrid,
  Database,
  ListTodo,
  Music2,
  PlayCircle,
  Monitor,
  Network,
  Key,
  Copy,
  Check,
  Pencil,
  X,
  Save,
  ToggleLeft,
  ToggleRight,
  Box,
  Share2,
  Target,
} from 'lucide-react';
import {
  fetchMcpServers,
  addMcpServer,
  deleteMcpServer,
  patchMcpServer,
  fetchMcpTools,
  fetchMcpConfig,
  updateMcpConfig,
  fetchIntegrations,
  fetchAvailablePlatforms,
  createIntegration,
  claimGmailOAuth,
  startIntegration,
  stopIntegration,
  deleteIntegration,
  updateIntegration,
  testIntegration,
  fetchSecurityPolicy,
  updateSecurityPolicy,
  fetchOAuthConfig,
  fetchOAuthTokens,
  revokeOAuthToken,
  refreshOAuthToken,
  reloadOAuthConfig,
  setSecret,
  createApiKey,
  fetchApiKeys,
  revokeApiKey,
  fetchEcosystemServices,
  enableEcosystemService,
  disableEcosystemService,
  fetchAgnosSandboxProfiles,
} from '../api/client';
import type { EcosystemServiceInfo, AgnosSandboxProfile } from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';
import type {
  McpServerConfig,
  McpToolDef,
  McpFeatureConfig,
  IntegrationInfo,
  OAuthConnectedToken,
} from '../types';
import type { SecurityPolicy } from '../api/client';
import { sanitizeText } from '../utils/sanitize';
import { McpPrebuilts } from './McpPrebuilts';
import { RoutingRulesPage } from './RoutingRulesPage';
import { FederationTab } from './federation/FederationTab';
import { FeatureLock } from './FeatureLock';

const LOCAL_MCP_NAME = 'YEOMAN MCP';

type TransportType = 'stdio' | 'sse' | 'streamable-http';

interface AddServerForm {
  name: string;
  description: string;
  transport: TransportType;
  command: string;
  args: string;
  url: string;
  env: { key: string; value: string }[];
}

const EMPTY_FORM: AddServerForm = {
  name: '',
  description: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  env: [],
};

interface PlatformMeta {
  name: string;
  description: string;
  icon: React.ReactNode;
  fields: FormFieldDef[];
  setupSteps?: string[];
  oauthUrl?: string;
}

interface FormFieldDef {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder: string;
  helpText?: string;
}

const BASE_FIELDS: FormFieldDef[] = [
  { key: 'displayName', label: 'Display Name', type: 'text', placeholder: 'Display Name' },
];

const TOKEN_FIELD: FormFieldDef = {
  key: 'botToken',
  label: 'Bot Token',
  type: 'password',
  placeholder: 'Bot Token',
};

const PLATFORM_META: Record<string, PlatformMeta> = {
  telegram: {
    name: 'Telegram',
    description: 'Connect to Telegram Bot API for messaging',
    icon: <Send className="w-6 h-6" />,
    fields: [...BASE_FIELDS, { ...TOKEN_FIELD, helpText: 'Get from @BotFather on Telegram' }],
    setupSteps: [
      'Open Telegram and search for @BotFather',
      'Send /newbot to create a new bot',
      'Copy the bot token provided',
      'Paste the token above and connect',
    ],
  },
  discord: {
    name: 'Discord',
    description: 'Integrate with Discord servers and channels',
    icon: <Radio className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      { ...TOKEN_FIELD, helpText: 'Bot token from Discord Developer Portal' },
    ],
    setupSteps: [
      'Go to Discord Developer Portal',
      'Create a new application and add a bot',
      'Enable Message Content Intent',
      'Copy the bot token and use it above',
    ],
  },
  slack: {
    name: 'Slack',
    description: 'Connect to Slack workspaces via Bot API',
    icon: <Hash className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      { ...TOKEN_FIELD, helpText: 'Bot token (xoxb-...) from Slack App' },
      {
        key: 'appToken',
        label: 'App Token',
        type: 'password',
        placeholder: 'xapp-...',
        helpText: 'App-level token for Socket Mode',
      },
    ],
    setupSteps: [
      'Create app at api.slack.com',
      'Enable Socket Mode',
      'Add bot token scopes: chat:write, app_mentions:read',
      'Install to workspace and copy tokens',
    ],
  },
  github: {
    name: 'GitHub',
    description: 'Receive webhooks from GitHub repositories',
    icon: <GitBranchIcon className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'personalAccessToken',
        label: 'Personal Access Token',
        type: 'password' as const,
        placeholder: 'ghp_...',
        helpText: 'Token with repo scope',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Secret',
        type: 'password' as const,
        placeholder: 'Webhook Secret',
        helpText: 'Secret to verify webhook authenticity',
      },
    ],
    setupSteps: [
      'Generate a Personal Access Token at github.com/settings/tokens',
      'Create a webhook in repo Settings > Webhooks',
      'Set URL to your /api/v1/webhooks/github endpoint',
      'Select events: push, pull_request, issues',
    ],
  },
  cli: {
    name: 'CLI',
    description: 'Local command-line interface (built-in)',
    icon: <Terminal className="w-6 h-6" />,
    fields: BASE_FIELDS,
    setupSteps: [
      'CLI is built-in and always available',
      'Use secureyeoman CLI or REST API to interact',
    ],
  },
  webhook: {
    name: 'Webhook',
    description: 'Generic HTTP webhook for custom integrations',
    icon: <Globe className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'webhookUrl',
        label: 'Webhook URL',
        type: 'text',
        placeholder: 'https://...',
        helpText: 'URL that will receive POST requests',
      },
      {
        key: 'secret',
        label: 'Secret',
        type: 'password',
        placeholder: 'Webhook Secret',
        helpText: 'Used to sign/verify requests',
      },
    ],
    setupSteps: [
      'Configure your external service to send webhooks',
      'Set the URL to your /api/v1/webhooks/custom endpoint',
      'Optionally set a secret for request verification',
      'Test the connection by triggering an event',
    ],
  },
  gmail: {
    name: 'Gmail',
    description: 'Connect your Gmail account for email messaging',
    icon: <Mail className="w-6 h-6" />,
    fields: BASE_FIELDS,
  },
  email: {
    name: 'Email (IMAP/SMTP)',
    description:
      'Connect any email provider via IMAP/SMTP (ProtonMail Bridge, Outlook, Yahoo, Fastmail, etc.)',
    icon: <Mail className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'imapHost',
        label: 'IMAP Host',
        type: 'text',
        placeholder: '127.0.0.1',
        helpText: 'IMAP server hostname',
      },
      {
        key: 'imapPort',
        label: 'IMAP Port',
        type: 'text',
        placeholder: '993',
        helpText: 'IMAP port (993 for TLS, 143 for plain)',
      },
      {
        key: 'smtpHost',
        label: 'SMTP Host',
        type: 'text',
        placeholder: '127.0.0.1',
        helpText: 'SMTP server hostname',
      },
      {
        key: 'smtpPort',
        label: 'SMTP Port',
        type: 'text',
        placeholder: '465',
        helpText: 'SMTP port (465 for TLS, 587 for STARTTLS)',
      },
      { key: 'username', label: 'Username', type: 'text', placeholder: 'user@example.com' },
      {
        key: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Password or app-specific password',
      },
    ],
    setupSteps: [
      'Enter your mail server IMAP and SMTP connection details',
      'For ProtonMail: install Bridge, use 127.0.0.1:1143/1025 (or host.docker.internal in Docker) with self-signed certs',
      'For Outlook/Yahoo: use their IMAP/SMTP settings with an app password',
      'Configure read/send preferences and connect',
    ],
  },
  googlechat: {
    name: 'Google Chat',
    description: 'Connect to Google Chat spaces via Bot API',
    icon: <MessageSquare className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      { ...TOKEN_FIELD, helpText: 'Service account JSON key or Bot token' },
      {
        key: 'spaceId',
        label: 'Space ID',
        type: 'text',
        placeholder: 'Spaces/...',
        helpText: 'The Google Chat space to connect to',
      },
    ],
    setupSteps: [
      'Go to Google Cloud Console',
      'Create a project and enable Google Chat API',
      'Create a Service Account and download JSON key',
      'Configure Chat API: add bot, set permissions',
      'Copy the Space ID from the Chat space URL',
    ],
  },
  whatsapp: {
    name: 'WhatsApp',
    description: 'Connect to WhatsApp via WhatsApp Web Protocol',
    icon: <Smartphone className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'sessionDir',
        label: 'Session Directory',
        type: 'text',
        placeholder: 'Optional custom session path',
        helpText: 'Directory to store session data (default: .sessions/whatsapp)',
      },
    ],
    setupSteps: [
      'Start the integration',
      'Scan the QR code with your phone (WhatsApp > Settings > Linked Devices)',
      'Keep your phone connected for initial setup',
      'Session will be saved for future connections',
    ],
  },
  signal: {
    name: 'Signal',
    description: 'Connect to Signal via signal-cli or bot gateway',
    icon: <Radio className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'signalCliUrl',
        label: 'Signal CLI URL',
        type: 'text',
        placeholder: 'http://localhost:8080',
        helpText: 'URL of signal-cli REST API server',
      },
      {
        key: 'signalCliToken',
        label: 'Signal CLI Token',
        type: 'password',
        placeholder: 'Optional API token',
        helpText: 'Token for signal-cli REST API authentication',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Secret',
        type: 'password',
        placeholder: 'Optional webhook verification',
        helpText: 'Secret to verify incoming webhook messages',
      },
    ],
    setupSteps: [
      'Run signal-cli in daemon mode: signal-cli -u +1234567890 daemon',
      'Or use a signal bot gateway service',
      'Configure the REST API URL above',
      'For inbound: configure webhook endpoint /api/v1/webhooks/signal',
    ],
  },
  teams: {
    name: 'Microsoft Teams',
    description: 'Connect to Microsoft Teams via Bot Framework',
    icon: <Users className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'botId',
        label: 'Bot ID (Application ID)',
        type: 'text',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        helpText: 'Azure AD Application ID',
      },
      {
        key: 'botPassword',
        label: 'Bot Password',
        type: 'password',
        placeholder: 'Client Secret',
        helpText: 'Application client secret from Azure Portal',
      },
      {
        key: 'tenantId',
        label: 'Tenant ID',
        type: 'text',
        placeholder: 'Optional for multi-tenant',
        helpText: 'Azure tenant ID (optional for single-tenant)',
      },
    ],
    setupSteps: [
      'Go to Azure Portal > App registrations',
      'Create a new application',
      'Add Messaging endpoint (ngrok recommended for dev)',
      'Create Client Secret in Certificates & secrets',
      'Register bot in Bot Framework Portal',
      'Add Teams channel',
    ],
  },
  imessage: {
    name: 'iMessage',
    description: 'Connect to macOS Messages.app (macOS only)',
    icon: <Smartphone className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'pollIntervalMs',
        label: 'Poll Interval (ms)',
        type: 'text',
        placeholder: '5000',
        helpText: 'How often to check for new messages (default: 5000)',
      },
    ],
    setupSteps: [
      'Grant Full Disk Access to SecureYeoman in System Settings > Privacy & Security',
      'Enable Messages.app in Accessibility (if needed)',
      'Start the integration on macOS',
    ],
  },
  googlecalendar: {
    name: 'Google Calendar',
    description: 'Connect to Google Calendar for event management',
    icon: <Calendar className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password',
        placeholder: 'OAuth2 access token',
        helpText: 'OAuth2 access token from Google',
      },
      {
        key: 'refreshToken',
        label: 'Refresh Token',
        type: 'password',
        placeholder: 'OAuth2 refresh token',
        helpText: 'Used to refresh expired access tokens',
      },
      {
        key: 'calendarId',
        label: 'Calendar ID',
        type: 'text',
        placeholder: 'primary',
        helpText: 'Calendar ID to poll (default: primary)',
      },
    ],
    setupSteps: [
      'Go to Google Cloud Console and enable Calendar API',
      'Create OAuth2 credentials (Web Application)',
      'Complete the OAuth consent flow to get tokens',
      'Paste access and refresh tokens above',
    ],
  },
  notion: {
    name: 'Notion',
    description: 'Connect to Notion workspaces for page and database access',
    icon: <BookOpen className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'apiKey',
        label: 'Integration Token',
        type: 'password',
        placeholder: 'ntn_...',
        helpText: 'Internal integration token from Notion',
      },
      {
        key: 'databaseId',
        label: 'Database ID',
        type: 'text',
        placeholder: 'Optional database ID',
        helpText: 'Specific database to poll (optional)',
      },
    ],
    setupSteps: [
      'Go to notion.so/my-integrations',
      'Create a new internal integration',
      'Copy the integration token',
      'Share your database/pages with the integration',
    ],
  },
  gitlab: {
    name: 'GitLab',
    description: 'Receive webhooks from GitLab repositories',
    icon: <GitMerge className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'personalAccessToken',
        label: 'Personal Access Token',
        type: 'password' as const,
        placeholder: 'glpat-...',
        helpText: 'Token with api scope',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Secret',
        type: 'password' as const,
        placeholder: 'Webhook Secret Token',
        helpText: 'Secret token to verify webhook authenticity',
      },
      {
        key: 'gitlabUrl',
        label: 'GitLab URL',
        type: 'text',
        placeholder: 'https://gitlab.com',
        helpText: 'GitLab instance URL (default: gitlab.com)',
      },
    ],
    setupSteps: [
      'Generate a Personal Access Token at GitLab > User Settings > Access Tokens',
      'Create a webhook in repo Settings > Webhooks',
      'Set URL to your /api/v1/webhooks/gitlab endpoint',
      'Add a Secret Token and select events: push, merge request, issues, note',
    ],
  },
  jira: {
    name: 'Jira',
    description: 'Connect to Jira for issue tracking and project management',
    icon: <Wrench className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'instanceUrl',
        label: 'Instance URL',
        type: 'text' as const,
        placeholder: 'https://your-domain.atlassian.net',
        helpText: 'Your Jira Cloud or Server instance URL',
      },
      {
        key: 'email',
        label: 'Email',
        type: 'text' as const,
        placeholder: 'you@example.com',
        helpText: 'Email associated with your Jira account',
      },
      {
        key: 'apiToken',
        label: 'API Token',
        type: 'password' as const,
        placeholder: 'Jira API token',
        helpText: 'Generate at id.atlassian.com/manage-profile/security/api-tokens',
      },
      {
        key: 'projectKey',
        label: 'Project Key',
        type: 'text' as const,
        placeholder: 'PROJ',
        helpText: 'Default project key for issue operations',
      },
    ],
    setupSteps: [
      'Go to id.atlassian.com and generate an API token',
      'Enter your Jira instance URL and email',
      'Paste the API token above',
      'Optionally set a project key for default operations',
      'For webhooks: configure at Jira > System > WebHooks',
    ],
  },
  aws: {
    name: 'AWS',
    description: 'Connect to AWS services (Lambda, STS) for cloud operations',
    icon: <Globe className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'accessKeyId',
        label: 'Access Key ID',
        type: 'text' as const,
        placeholder: 'AKIAIOSFODNN7EXAMPLE',
        helpText: 'IAM Access Key ID',
      },
      {
        key: 'secretAccessKey',
        label: 'Secret Access Key',
        type: 'password' as const,
        placeholder: 'Secret Access Key',
        helpText: 'IAM Secret Access Key',
      },
      {
        key: 'region',
        label: 'Region',
        type: 'text' as const,
        placeholder: 'us-east-1',
        helpText: 'AWS region (e.g. us-east-1, eu-west-1)',
      },
      {
        key: 'defaultLambda',
        label: 'Default Lambda',
        type: 'text' as const,
        placeholder: 'Optional function name',
        helpText: 'Default Lambda function for message delivery',
      },
    ],
    setupSteps: [
      'Create an IAM user with programmatic access',
      'Attach policies for Lambda invoke and STS',
      'Copy the Access Key ID and Secret Access Key',
      'Set the AWS region for your resources',
    ],
  },
  azure: {
    name: 'Azure DevOps',
    description: 'Connect to Azure DevOps for work items, builds, and pipelines',
    icon: <GitBranch className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'organizationUrl',
        label: 'Organization URL',
        type: 'text' as const,
        placeholder: 'https://dev.azure.com/your-org',
        helpText: 'Your Azure DevOps organization URL',
      },
      {
        key: 'personalAccessToken',
        label: 'Personal Access Token',
        type: 'password' as const,
        placeholder: 'Azure DevOps PAT',
        helpText: 'Generate at dev.azure.com > User Settings > PATs',
      },
      {
        key: 'project',
        label: 'Project',
        type: 'text' as const,
        placeholder: 'MyProject',
        helpText: 'Azure DevOps project name',
      },
    ],
    setupSteps: [
      'Go to dev.azure.com > User Settings > Personal Access Tokens',
      'Create a token with Work Items (Read & Write) and Build scopes',
      'Enter your organization URL and project name',
      'For webhooks: configure at Project Settings > Service Hooks',
    ],
  },
  figma: {
    name: 'Figma',
    description: 'Access Figma files, comments, and design metadata',
    icon: <Globe className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'accessToken',
        label: 'Personal Access Token',
        type: 'password' as const,
        placeholder: 'figd_...',
        helpText: 'Generate at figma.com > Account Settings > Personal access tokens',
      },
      {
        key: 'fileKey',
        label: 'File Key',
        type: 'text' as const,
        placeholder: 'File key from URL',
        helpText: 'From the Figma file URL: figma.com/file/<FILE_KEY>/...',
      },
    ],
    setupSteps: [
      'Go to figma.com > Account Settings > Personal access tokens',
      'Generate a new token with file read access',
      'Copy the file key from your design file URL',
      'Paste both above to start polling for comments',
    ],
  },
  stripe: {
    name: 'Stripe',
    description: 'Receive payment, customer, and invoice events via Stripe webhooks',
    icon: <CreditCard className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'secretKey',
        label: 'Secret Key',
        type: 'password' as const,
        placeholder: 'sk_live_... or sk_test_...',
        helpText: 'Stripe API secret key from dashboard.stripe.com/apikeys',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Secret',
        type: 'password' as const,
        placeholder: 'whsec_...',
        helpText: 'Webhook signing secret from Stripe Dashboard > Webhooks',
      },
    ],
    setupSteps: [
      'Copy your Secret Key from dashboard.stripe.com/apikeys',
      'Create a webhook at dashboard.stripe.com/webhooks',
      'Set endpoint URL to your /api/v1/webhooks/stripe path',
      'Select events: payment_intent.*, customer.*, invoice.*',
      'Copy the signing secret (whsec_...) into Webhook Secret',
    ],
  },
  zapier: {
    name: 'Zapier',
    description: 'Trigger and receive Zap events for workflow automation',
    icon: <Zap className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'outboundUrl',
        label: 'Outbound Webhook URL',
        type: 'text' as const,
        placeholder: 'https://hooks.zapier.com/hooks/catch/...',
        helpText: 'Zapier catch-hook URL for outbound triggers',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Secret',
        type: 'password' as const,
        placeholder: 'Optional signing secret',
        helpText: 'Optional HMAC secret to verify inbound Zap payloads',
      },
    ],
    setupSteps: [
      'In Zapier, create a new Zap with "Webhooks by Zapier" trigger (Catch Hook)',
      'Copy the catch-hook URL into Outbound Webhook URL above',
      'Point Zap actions at your /api/v1/webhooks/zapier endpoint for inbound',
      'Optionally configure a signing secret for payload verification',
    ],
  },
  qq: {
    name: 'QQ',
    description: 'Connect to QQ messaging via CQ-HTTP (OneBot v11) API',
    icon: <MessageCircle className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'httpUrl',
        label: 'CQ-HTTP URL',
        type: 'text' as const,
        placeholder: 'http://localhost:5700',
        helpText: 'go-cqhttp or CQ-HTTP HTTP API endpoint',
      },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password' as const,
        placeholder: 'Optional auth token',
        helpText: 'Access token for CQ-HTTP (if configured)',
      },
    ],
    setupSteps: [
      'Install go-cqhttp: github.com/Mrs4s/go-cqhttp',
      'Configure HTTP API mode with your QQ account',
      'Set the HTTP API URL (default: http://localhost:5700)',
      'Configure event post URL to /api/v1/webhooks/qq for inbound events',
    ],
  },
  dingtalk: {
    name: 'DingTalk',
    description: 'Enterprise messaging and workflow integration via DingTalk robots',
    icon: <Building2 className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'outboundWebhookUrl',
        label: 'Robot Webhook URL',
        type: 'text' as const,
        placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=...',
        helpText: 'Custom robot incoming webhook URL from DingTalk',
      },
      {
        key: 'webhookToken',
        label: 'Signing Token',
        type: 'password' as const,
        placeholder: 'Optional signing secret',
        helpText: 'Security token for verifying inbound webhook signatures',
      },
    ],
    setupSteps: [
      'In DingTalk, go to a group > Settings > Intelligent Group Assistant',
      'Add a Custom Robot and copy the webhook URL',
      'Configure outgoing robot to POST to /api/v1/webhooks/dingtalk',
      'Paste the robot webhook URL above for outbound messages',
    ],
  },
  line: {
    name: 'Line',
    description: 'Line messaging with sticker support and rich menu handling',
    icon: <MessageCircle className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'channelSecret',
        label: 'Channel Secret',
        type: 'password' as const,
        placeholder: 'Channel Secret',
        helpText: 'From Line Developers console > Basic Settings',
      },
      {
        key: 'channelAccessToken',
        label: 'Channel Access Token',
        type: 'password' as const,
        placeholder: 'Long-lived channel access token',
        helpText: 'From Line Developers console > Messaging API > Channel access token',
      },
    ],
    setupSteps: [
      'Go to developers.line.biz and create a Messaging API channel',
      'Copy the Channel Secret from Basic Settings',
      'Issue a long-lived Channel Access Token from Messaging API tab',
      'Set webhook URL to your /api/v1/webhooks/line endpoint',
      'Enable "Use webhook" in the Line Developers console',
    ],
  },
  linear: {
    name: 'Linear',
    description: 'Issue tracking with sprint management and webhook listeners',
    icon: <LayoutGrid className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password' as const,
        placeholder: 'lin_api_...',
        helpText: 'Personal API key from Linear Settings > API',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Secret',
        type: 'password' as const,
        placeholder: 'Webhook signing secret',
        helpText: 'Signing secret to verify inbound Linear webhooks (optional)',
      },
      {
        key: 'teamId',
        label: 'Default Team ID',
        type: 'text' as const,
        placeholder: 'Team ID',
        helpText: 'Default team for issue creation (optional)',
      },
    ],
    setupSteps: [
      'Go to Linear Settings > API and create a personal API key',
      'Copy the API key and paste it above',
      'In Linear Settings > API > Webhooks, create a new webhook',
      'Set the URL to your /api/v1/webhooks/linear endpoint',
      'Copy the signing secret and paste it above',
      'Select the event types: Issues and Comments',
    ],
  },
  airtable: {
    name: 'Airtable',
    description: 'Connect to Airtable bases for record management and view filtering',
    icon: <Database className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'apiKey',
        label: 'Personal Access Token',
        type: 'password' as const,
        placeholder: 'pat...',
        helpText: 'Personal access token from airtable.com/create/tokens',
      },
      {
        key: 'baseId',
        label: 'Base ID',
        type: 'text' as const,
        placeholder: 'appXXXXXXXXXXXXXX',
        helpText: 'Airtable Base ID from the URL (optional — scopes access to one base)',
      },
    ],
    setupSteps: [
      'Go to airtable.com/create/tokens',
      'Create a personal access token with data.records:read and data.records:write scopes',
      'Copy the token and paste it above',
      'Optionally add your Base ID to restrict access to a single base',
    ],
  },
  todoist: {
    name: 'Todoist',
    description: 'Connect to Todoist for task and project management',
    icon: <ListTodo className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'apiToken',
        label: 'API Token',
        type: 'password' as const,
        placeholder: 'API token',
        helpText: 'Found in Todoist Settings > Integrations > Developer',
      },
    ],
    setupSteps: [
      'Open Todoist and go to Settings > Integrations > Developer',
      'Copy your API token',
      'Paste the token above and connect',
    ],
  },
  spotify: {
    name: 'Spotify',
    description: 'Control Spotify playback and access playlist and track data',
    icon: <Music2 className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'clientId',
        label: 'Client ID',
        type: 'text' as const,
        placeholder: 'Spotify Client ID',
        helpText: 'From developer.spotify.com/dashboard',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        type: 'password' as const,
        placeholder: 'Spotify Client Secret',
        helpText: 'From developer.spotify.com/dashboard',
      },
      {
        key: 'refreshToken',
        label: 'Refresh Token',
        type: 'password' as const,
        placeholder: 'Spotify OAuth2 refresh token',
        helpText: 'Refresh token with user-read-playback-state and playlist scopes',
      },
    ],
    setupSteps: [
      'Go to developer.spotify.com/dashboard and create an app',
      'Copy the Client ID and Client Secret',
      'Run the OAuth2 Authorization Code flow to obtain a refresh token',
      'Grant scopes: user-read-playback-state, user-modify-playback-state, playlist-read-private',
      'Paste all three credentials above',
    ],
  },
  youtube: {
    name: 'YouTube',
    description: 'Search videos, access channel data, and manage playlists via YouTube Data API',
    icon: <PlayCircle className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password' as const,
        placeholder: 'AIza...',
        helpText: 'YouTube Data API v3 key from console.cloud.google.com',
      },
    ],
    setupSteps: [
      'Go to console.cloud.google.com and create or select a project',
      'Enable the YouTube Data API v3',
      'Create an API key under APIs & Services > Credentials',
      'Optionally restrict the key to the YouTube Data API v3',
      'Paste the API key above',
    ],
  },
  twitter: {
    name: 'Twitter / X',
    description: 'Monitor mentions and post replies via Twitter API v2',
    icon: <MessageCircle className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'bearerToken',
        label: 'Bearer Token',
        type: 'password' as const,
        placeholder: 'AAAA...',
        helpText: 'App-only Bearer Token — required for reading mentions',
      },
      {
        key: 'apiKey',
        label: 'API Key (Consumer Key)',
        type: 'password' as const,
        placeholder: 'API Key',
        helpText: 'OAuth 1.0a API Key — required for posting tweets',
      },
      {
        key: 'apiKeySecret',
        label: 'API Key Secret',
        type: 'password' as const,
        placeholder: 'API Key Secret',
        helpText: 'OAuth 1.0a API Key Secret',
      },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password' as const,
        placeholder: 'Access Token',
        helpText: 'OAuth 1.0a Access Token for your account',
      },
      {
        key: 'accessTokenSecret',
        label: 'Access Token Secret',
        type: 'password' as const,
        placeholder: 'Access Token Secret',
        helpText: 'OAuth 1.0a Access Token Secret',
      },
      {
        key: 'oauth2AccessToken',
        label: 'OAuth 2.0 Access Token (alternative to OAuth 1.0a)',
        type: 'password' as const,
        placeholder: 'OAuth 2.0 access token',
        helpText:
          'User-context OAuth 2.0 token — alternative to OAuth 1.0a for posting. Note: media upload requires OAuth 1.0a.',
      },
      {
        key: 'oauth2RefreshToken',
        label: 'OAuth 2.0 Refresh Token (optional)',
        type: 'password' as const,
        placeholder: 'OAuth 2.0 refresh token',
        helpText:
          'Refresh token for OAuth 2.0 — stored for reference; manual refresh not yet supported.',
      },
    ],
    setupSteps: [
      'Go to developer.twitter.com and create a project + app',
      'Enable Read and Write permissions on your app',
      'Copy the Bearer Token from the Keys and Tokens tab',
      'Generate Access Token & Secret under Authentication Tokens',
      'Paste all tokens above — Bearer Token alone enables read-only monitoring',
      'Alternatively, use an OAuth 2.0 user-context token (from your app portal or PKCE flow) for posting without OAuth 1.0a — note that media upload (images/video) requires OAuth 1.0a',
    ],
  },
};

type TabType = 'integrations' | 'mcp' | 'routing' | 'federation';
type IntegrationSubTab = 'messaging' | 'email' | 'productivity' | 'devops' | 'oauth';

// Platform categorization for tab filtering
const DEVOPS_PLATFORMS = new Set(['github', 'gitlab', 'jira', 'aws', 'azure', 'figma', 'zapier']);
const EMAIL_PLATFORMS = new Set(['gmail', 'email']);
const PRODUCTIVITY_PLATFORMS = new Set([
  'notion',
  'stripe',
  'linear',
  'googlecalendar',
  'airtable',
  'todoist',
  'spotify',
  'youtube',
]);
// Messaging = everything not in the above sets

const STATUS_CONFIG: Record<
  IntegrationInfo['status'],
  { color: string; icon: React.ReactNode; label: string }
> = {
  connected: {
    color: 'text-green-400',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    label: 'Connected',
  },
  disconnected: {
    color: 'text-muted',
    icon: <XCircle className="w-3.5 h-3.5" />,
    label: 'Disconnected',
  },
  error: { color: 'text-red-400', icon: <AlertCircle className="w-3.5 h-3.5" />, label: 'Error' },
  configuring: {
    color: 'text-yellow-400',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    label: 'Configuring',
  },
};

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function ConnectionsPage() {
  const queryClient = useQueryClient();
  const location = useLocation();

  const getInitialTab = (): { tab: TabType; subTab: IntegrationSubTab } => {
    const path = location.pathname;
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');

    if (path.includes('/mcp') || tabParam === 'mcp') {
      return { tab: 'mcp', subTab: 'messaging' };
    }

    // Map legacy flat tab params to the new nested structure
    const subTabMap: Record<string, IntegrationSubTab> = {
      messaging: 'messaging',
      email: 'email',
      productivity: 'productivity',
      devops: 'devops',
      oauth: 'oauth',
    };

    if (tabParam && subTabMap[tabParam]) {
      return { tab: 'integrations', subTab: subTabMap[tabParam] };
    }

    if (path.includes('/email')) return { tab: 'integrations', subTab: 'email' };
    if (path.includes('/oauth')) return { tab: 'integrations', subTab: 'oauth' };

    return { tab: 'mcp', subTab: 'messaging' };
  };

  const initialState = getInitialTab();
  const [activeTab, setActiveTab] = useState<TabType>(initialState.tab);
  const [activeSubTab, setActiveSubTab] = useState<IntegrationSubTab>(initialState.subTab);
  const [showAddMcpForm, setShowAddMcpForm] = useState(false);
  const [mcpForm, setMcpForm] = useState<AddServerForm>(EMPTY_FORM);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'mcp' | 'integration';
    item: McpServerConfig | IntegrationInfo;
  } | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [hiddenTools, setHiddenTools] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('mcp-hidden-tools');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    localStorage.setItem('mcp-hidden-tools', JSON.stringify([...hiddenTools]));
  }, [hiddenTools]);

  const toggleToolVisibility = useCallback((toolKey: string) => {
    setHiddenTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolKey)) {
        next.delete(toolKey);
      } else {
        next.add(toolKey);
      }
      return next;
    });
  }, []);

  const { data: featureConfig } = useQuery({
    queryKey: ['mcpConfig'],
    queryFn: fetchMcpConfig,
    refetchInterval: 30000,
  });

  const { data: securityPolicy } = useQuery({
    queryKey: ['securityPolicy'],
    queryFn: fetchSecurityPolicy,
    refetchInterval: 60000,
  });

  const { data: serversData } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: fetchMcpServers,
    refetchInterval: 10000,
  });

  const { data: toolsData } = useQuery({
    queryKey: ['mcpTools'],
    queryFn: fetchMcpTools,
    refetchInterval: 15000,
  });

  const { data: integrationsData } = useQuery({
    queryKey: ['integrations'],
    queryFn: fetchIntegrations,
    refetchInterval: 10000,
  });

  const { data: platformsData } = useQuery({
    queryKey: ['availablePlatforms'],
    queryFn: fetchAvailablePlatforms,
  });

  const servers = serversData?.servers ?? [];
  const allTools = toolsData?.tools ?? [];
  const integrations = [...(integrationsData?.integrations ?? [])].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
  const availablePlatforms = new Set(platformsData?.platforms ?? []);
  const hasRegisteredPlatforms = availablePlatforms.size > 0;

  const localServer = servers.find((s) => s.name === LOCAL_MCP_NAME);
  const tools = allTools;

  const externalServers = servers.filter((s) => s.name !== LOCAL_MCP_NAME);
  const activePlatformIds = new Set(integrations.map((i) => i.platform));
  const unregisteredPlatforms = Object.keys(PLATFORM_META)
    .filter(
      (p) =>
        !activePlatformIds.has(p) &&
        !EMAIL_PLATFORMS.has(p) &&
        !DEVOPS_PLATFORMS.has(p) &&
        !PRODUCTIVITY_PLATFORMS.has(p)
    )
    .sort((a, b) => PLATFORM_META[a].name.localeCompare(PLATFORM_META[b].name));

  const unregisteredProductivityPlatforms = Object.keys(PLATFORM_META)
    .filter((p) => !activePlatformIds.has(p) && PRODUCTIVITY_PLATFORMS.has(p))
    .sort((a, b) => PLATFORM_META[a].name.localeCompare(PLATFORM_META[b].name));

  const unregisteredDevopsPlatforms = Object.keys(PLATFORM_META)
    .filter((p) => !activePlatformIds.has(p) && DEVOPS_PLATFORMS.has(p))
    .sort((a, b) => PLATFORM_META[a].name.localeCompare(PLATFORM_META[b].name));

  const toolsByServer = tools.reduce<Record<string, McpToolDef[]>>((acc, tool) => {
    const key = tool.serverName || tool.serverId;
    (acc[key] ??= []).push(tool);
    return acc;
  }, {});

  const featureToggleMut = useMutation({
    mutationFn: async (data: Partial<McpFeatureConfig>) => {
      setIsRestarting(true);
      setToggleError(null);
      return updateMcpConfig(data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mcpConfig'] }),
        queryClient.invalidateQueries({ queryKey: ['mcpTools'] }),
        queryClient.invalidateQueries({ queryKey: ['mcpServers'] }),
      ]);
      setIsRestarting(false);
    },
    onError: (err: Error) => {
      setIsRestarting(false);
      setToggleError(err.message || 'Failed to update MCP config');
    },
  });

  const ecosystemQuery = useQuery({
    queryKey: ['ecosystemServices'],
    queryFn: fetchEcosystemServices,
    refetchInterval: 30_000,
  });

  const enableServiceMut = useMutation({
    mutationFn: enableEcosystemService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecosystemServices'] });
      queryClient.invalidateQueries({ queryKey: ['mcpConfig'] });
      queryClient.invalidateQueries({ queryKey: ['mcpTools'] });
    },
  });

  const disableServiceMut = useMutation({
    mutationFn: disableEcosystemService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecosystemServices'] });
      queryClient.invalidateQueries({ queryKey: ['mcpConfig'] });
      queryClient.invalidateQueries({ queryKey: ['mcpTools'] });
    },
  });

  // AGNOS sandbox profiles — only fetch when AGNOS is connected
  const agnosService = (ecosystemQuery.data ?? []).find((s) => s.id === 'agnos');
  const agnosSandboxQuery = useQuery({
    queryKey: ['agnosSandboxProfiles'],
    queryFn: fetchAgnosSandboxProfiles,
    enabled: agnosService?.status === 'connected',
    refetchInterval: 60_000,
  });

  const addMcpMut = useMutation({
    mutationFn: () => {
      const envRecord: Record<string, string> = {};
      for (const entry of mcpForm.env) {
        if (entry.key.trim()) envRecord[entry.key.trim()] = entry.value;
      }
      return addMcpServer({
        name: mcpForm.name,
        description: mcpForm.description || undefined,
        transport: mcpForm.transport,
        command: mcpForm.transport === 'stdio' ? mcpForm.command || undefined : undefined,
        args:
          mcpForm.transport === 'stdio' && mcpForm.args.trim()
            ? mcpForm.args.split(/\s+/)
            : undefined,
        url: mcpForm.transport !== 'stdio' ? mcpForm.url || undefined : undefined,
        env: Object.keys(envRecord).length > 0 ? envRecord : undefined,
        enabled: true,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      void queryClient.invalidateQueries({ queryKey: ['mcpTools'] });
      setMcpForm(EMPTY_FORM);
      setShowAddMcpForm(false);
    },
  });

  const deleteMcpMut = useMutation({
    mutationFn: (id: string) => deleteMcpServer(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      void queryClient.invalidateQueries({ queryKey: ['mcpTools'] });
    },
  });

  const toggleMcpMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      patchMcpServer(id, { enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      void queryClient.invalidateQueries({ queryKey: ['mcpTools'] });
    },
  });

  const createIntegrationMut = useMutation({
    mutationFn: async () => {
      const meta = PLATFORM_META[connectingPlatform!];
      const configFields = meta.fields.filter((f) => f.key !== 'displayName');
      const config: Record<string, unknown> = {};
      for (const field of configFields) {
        if (formData[field.key]) config[field.key] = formData[field.key];
      }
      const integration = await createIntegration({
        platform: connectingPlatform!,
        displayName: formData.displayName || connectingPlatform!,
        enabled: true,
        config,
      });
      await startIntegration(integration.id);
      return integration;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setConnectingPlatform(null);
      setFormData({});
    },
  });

  const startIntegrationMut = useMutation({
    mutationFn: (id: string) => startIntegration(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const stopIntegrationMut = useMutation({
    mutationFn: (id: string) => stopIntegration(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const deleteIntegrationMut = useMutation({
    mutationFn: (id: string) => deleteIntegration(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(
    null
  );

  const testIntegrationMut = useMutation({
    mutationFn: (id: string) => testIntegration(id),
    onSuccess: (data, id) => {
      setTestResult({ id, ...data });
      setTimeout(() => {
        setTestResult(null);
      }, 5000);
    },
    onError: (err: Error, id) => {
      setTestResult({ id, ok: false, message: err.message || 'Test failed' });
      setTimeout(() => {
        setTestResult(null);
      }, 5000);
    },
  });

  const handleAddEnvVar = () => {
    setMcpForm((f) => ({ ...f, env: [...f.env, { key: '', value: '' }] }));
  };

  const handleRemoveEnvVar = (index: number) => {
    setMcpForm((f) => ({ ...f, env: f.env.filter((_, i) => i !== index) }));
  };

  const handleEnvChange = (index: number, field: 'key' | 'value', val: string) => {
    setMcpForm((f) => ({
      ...f,
      env: f.env.map((entry, i) => (i === index ? { ...entry, [field]: val } : entry)),
    }));
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'mcp') {
      deleteMcpMut.mutate((deleteTarget.item as McpServerConfig).id);
    } else {
      deleteIntegrationMut.mutate((deleteTarget.item as IntegrationInfo).id);
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget?.type === 'mcp' ? 'Remove MCP Server' : 'Delete Integration'}
        message={
          deleteTarget
            ? `Are you sure you want to remove "${
                deleteTarget.type === 'mcp'
                  ? (deleteTarget.item as McpServerConfig).name
                  : (deleteTarget.item as IntegrationInfo).displayName
              }"? This cannot be undone.`
            : ''
        }
        confirmLabel="Remove"
        destructive
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Connections</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage integrations, MCP servers, and authentication
          </p>
        </div>
      </div>

      <div className="flex overflow-x-auto scrollbar-hide gap-0.5 sm:gap-1 border-b border-border -mx-1 px-1">
        {(
          [
            ['mcp', 'MCP', <Wrench key="mcp" className="w-4 h-4" />],
            ['integrations', 'Integrations', <Cable key="int" className="w-4 h-4" />],
            ['routing', 'Routing Rules', <ArrowRightLeft key="routing" className="w-4 h-4" />],
            ['federation', 'Federation', <Share2 key="fed" className="w-4 h-4" />],
          ] as [TabType, string, React.ReactNode][]
        ).map(([tab, label, icon]) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
            }}
            className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {toggleError && (
        <div className="p-3 rounded border border-destructive bg-destructive/10 text-destructive text-sm">
          MCP toggle error: {toggleError}
        </div>
      )}

      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <div className="flex overflow-x-auto scrollbar-hide gap-0.5 sm:gap-1 -mx-1 px-1">
            {(
              [
                ['messaging', 'Messaging', <MessageCircle key="msg" className="w-3.5 h-3.5" />],
                ['email', 'Email', <Mail key="email" className="w-3.5 h-3.5" />],
                [
                  'productivity',
                  'Productivity',
                  <LayoutGrid key="productivity" className="w-3.5 h-3.5" />,
                ],
                ['devops', 'DevOps', <GitBranchIcon key="devops" className="w-3.5 h-3.5" />],
                ['oauth', 'OAuth', <ArrowRightLeft key="oauth" className="w-3.5 h-3.5" />],
              ] as [IntegrationSubTab, string, React.ReactNode][]
            ).map(([subTab, label, icon]) => (
              <button
                key={subTab}
                onClick={() => {
                  setActiveSubTab(subTab);
                }}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeSubTab === subTab
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {activeSubTab === 'messaging' && (
            <MessagingTab
              integrations={integrations.filter(
                (i) =>
                  !DEVOPS_PLATFORMS.has(i.platform) &&
                  !EMAIL_PLATFORMS.has(i.platform) &&
                  !PRODUCTIVITY_PLATFORMS.has(i.platform)
              )}
              platformsData={availablePlatforms}
              hasRegisteredPlatforms={hasRegisteredPlatforms}
              unregisteredPlatforms={unregisteredPlatforms}
              connectingPlatform={connectingPlatform}
              formData={formData}
              onConnectPlatform={setConnectingPlatform}
              onFormDataChange={setFormData}
              onCreateIntegration={createIntegrationMut.mutate}
              isCreating={createIntegrationMut.isPending}
              createError={createIntegrationMut.error}
              onStart={startIntegrationMut.mutate}
              onStop={stopIntegrationMut.mutate}
              onDelete={(id) => {
                setDeleteTarget({
                  type: 'integration',
                  item: integrations.find((i) => i.id === id)!,
                });
              }}
              isStarting={startIntegrationMut.isPending}
              isStopping={stopIntegrationMut.isPending}
              isDeleting={deleteIntegrationMut.isPending}
              onTest={testIntegrationMut.mutate}
              isTesting={testIntegrationMut.isPending}
              testResult={testResult}
            />
          )}

          {activeSubTab === 'email' && (
            <EmailTab
              integrations={integrations.filter(
                (i) => i.platform === 'gmail' || i.platform === 'email'
              )}
              onStart={startIntegrationMut.mutate}
              onStop={stopIntegrationMut.mutate}
              onDelete={(id) => {
                setDeleteTarget({
                  type: 'integration',
                  item: integrations.find((i) => i.id === id)!,
                });
              }}
              isStarting={startIntegrationMut.isPending}
              isStopping={stopIntegrationMut.isPending}
              isDeleting={deleteIntegrationMut.isPending}
              availablePlatforms={availablePlatforms}
            />
          )}

          {activeSubTab === 'productivity' && (
            <MessagingTab
              integrations={integrations.filter((i) => PRODUCTIVITY_PLATFORMS.has(i.platform))}
              platformsData={availablePlatforms}
              hasRegisteredPlatforms={hasRegisteredPlatforms}
              unregisteredPlatforms={unregisteredProductivityPlatforms}
              connectingPlatform={connectingPlatform}
              formData={formData}
              onConnectPlatform={setConnectingPlatform}
              onFormDataChange={setFormData}
              onCreateIntegration={createIntegrationMut.mutate}
              isCreating={createIntegrationMut.isPending}
              createError={createIntegrationMut.error}
              onStart={startIntegrationMut.mutate}
              onStop={stopIntegrationMut.mutate}
              onDelete={(id) => {
                setDeleteTarget({
                  type: 'integration',
                  item: integrations.find((i) => i.id === id)!,
                });
              }}
              isStarting={startIntegrationMut.isPending}
              isStopping={stopIntegrationMut.isPending}
              isDeleting={deleteIntegrationMut.isPending}
              onTest={testIntegrationMut.mutate}
              isTesting={testIntegrationMut.isPending}
              testResult={testResult}
            />
          )}

          {activeSubTab === 'devops' && (
            <MessagingTab
              integrations={integrations.filter((i) => DEVOPS_PLATFORMS.has(i.platform))}
              platformsData={availablePlatforms}
              hasRegisteredPlatforms={hasRegisteredPlatforms}
              unregisteredPlatforms={unregisteredDevopsPlatforms}
              connectingPlatform={connectingPlatform}
              formData={formData}
              onConnectPlatform={setConnectingPlatform}
              onFormDataChange={setFormData}
              onCreateIntegration={createIntegrationMut.mutate}
              isCreating={createIntegrationMut.isPending}
              createError={createIntegrationMut.error}
              onStart={startIntegrationMut.mutate}
              onStop={stopIntegrationMut.mutate}
              onDelete={(id) => {
                setDeleteTarget({
                  type: 'integration',
                  item: integrations.find((i) => i.id === id)!,
                });
              }}
              isStarting={startIntegrationMut.isPending}
              isStopping={stopIntegrationMut.isPending}
              isDeleting={deleteIntegrationMut.isPending}
              onTest={testIntegrationMut.mutate}
              isTesting={testIntegrationMut.isPending}
              testResult={testResult}
            />
          )}

          {activeSubTab === 'oauth' && (
            <OAuthTab
              integrations={integrations}
              onDelete={(id) => {
                setDeleteTarget({
                  type: 'integration',
                  item: integrations.find((i) => i.id === id)!,
                });
              }}
              isDeleting={deleteIntegrationMut.isPending}
            />
          )}
        </div>
      )}

      {activeTab === 'routing' && <RoutingRulesTab />}

      {activeTab === 'federation' && <FederationTab />}

      {activeTab === 'mcp' && (
        <>
          <McpPrebuilts />

          {/* Ecosystem Services */}
          {(ecosystemQuery.data ?? []).length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Ecosystem Services
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(ecosystemQuery.data ?? []).map((svc: EcosystemServiceInfo) => (
                  <div key={svc.id} className="card p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            background:
                              svc.status === 'connected'
                                ? '#22c55e'
                                : svc.status === 'unreachable'
                                  ? '#ef4444'
                                  : svc.status === 'error'
                                    ? '#f59e0b'
                                    : '#64748b',
                          }}
                        />
                        <span className="text-sm font-medium">{svc.displayName}</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={svc.enabled}
                          onChange={() => {
                            if (svc.enabled) {
                              disableServiceMut.mutate(svc.id);
                            } else {
                              enableServiceMut.mutate(svc.id);
                            }
                          }}
                          disabled={enableServiceMut.isPending || disableServiceMut.isPending}
                          className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{svc.description}</p>
                    <p className="text-[10px] text-muted-foreground/70">
                      {svc.status === 'connected' &&
                        svc.lastProbeLatencyMs != null &&
                        `Connected (${svc.lastProbeLatencyMs}ms)`}
                      {svc.status === 'unreachable' && 'Service unreachable'}
                      {svc.status === 'error' && (svc.error ?? 'Connection error')}
                      {svc.status === 'disconnected' && 'Not connected'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AGNOS Sandbox Profiles */}
          {agnosService?.status === 'connected' && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                AGNOS Sandbox Profiles
              </h3>
              {agnosSandboxQuery.isLoading && (
                <p className="text-xs text-muted-foreground">Loading profiles...</p>
              )}
              {agnosSandboxQuery.error && (
                <p className="text-xs text-red-500">
                  Failed to load profiles: {(agnosSandboxQuery.error as Error).message}
                </p>
              )}
              {agnosSandboxQuery.data && agnosSandboxQuery.data.length === 0 && (
                <p className="text-xs text-muted-foreground">No sandbox profiles configured</p>
              )}
              {agnosSandboxQuery.data && agnosSandboxQuery.data.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {agnosSandboxQuery.data.map((profile: AgnosSandboxProfile) => (
                    <div key={profile.id} className="card p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{profile.name}</span>
                        <span className="text-[10px] text-muted-foreground/60 font-mono">
                          {profile.id}
                        </span>
                      </div>
                      {profile.description && (
                        <p className="text-xs text-muted-foreground mb-2">{profile.description}</p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: profile.seccomp ? '#22c55e' : '#64748b' }}
                        >
                          seccomp {profile.seccomp ? 'ON' : 'OFF'}
                        </span>
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: profile.landlock ? '#22c55e' : '#64748b' }}
                        >
                          landlock {profile.landlock ? 'ON' : 'OFF'}
                        </span>
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: profile.networkEnabled ? '#22c55e' : '#64748b' }}
                        >
                          network {profile.networkEnabled ? 'ON' : 'OFF'}
                        </span>
                        {profile.maxMemoryMb != null && (
                          <span className="text-[10px] text-muted-foreground">
                            {profile.maxMemoryMb}MB
                          </span>
                        )}
                        {profile.allowedHosts && profile.allowedHosts.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            hosts: {profile.allowedHosts.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <McpTab
            servers={servers}
            externalServers={externalServers}
            localServer={localServer}
            tools={tools}
            toolsByServer={toolsByServer}
            featureConfig={featureConfig}
            securityPolicy={securityPolicy}
            showAddForm={showAddMcpForm}
            form={mcpForm}
            toolsExpanded={toolsExpanded}
            hiddenTools={hiddenTools}
            isRestarting={isRestarting}
            onShowAddForm={(show) => {
              setShowAddMcpForm(show);
              setMcpForm(EMPTY_FORM);
            }}
            onFormChange={setMcpForm}
            onAddMcp={addMcpMut.mutate}
            isAdding={addMcpMut.isPending}
            addError={addMcpMut.error}
            onAddEnvVar={handleAddEnvVar}
            onRemoveEnvVar={handleRemoveEnvVar}
            onEnvChange={handleEnvChange}
            onToggle={(id, enabled) => {
              toggleMcpMut.mutate({ id, enabled });
            }}
            isToggling={toggleMcpMut.isPending}
            onDelete={(id) => {
              setDeleteTarget({ type: 'mcp', item: servers.find((s) => s.id === id)! });
            }}
            isDeleting={deleteMcpMut.isPending}
            onFeatureToggle={(data) => {
              featureToggleMut.mutate(data);
            }}
            isFeatureToggling={featureToggleMut.isPending}
            onToggleToolsExpanded={() => {
              setToolsExpanded(!toolsExpanded);
            }}
            onToggleToolVisibility={toggleToolVisibility}
          />
        </>
      )}
    </div>
  );
}

function RoutingRulesTab() {
  return <RoutingRulesPage />;
}

function MessagingTab({
  integrations,
  platformsData,
  hasRegisteredPlatforms: _hasRegisteredPlatforms,
  unregisteredPlatforms,
  connectingPlatform,
  formData,
  onConnectPlatform,
  onFormDataChange,
  onCreateIntegration,
  isCreating,
  createError,
  onStart,
  onStop,
  onDelete,
  isStarting,
  isStopping,
  isDeleting,
  onTest,
  isTesting,
  testResult,
}: {
  integrations: IntegrationInfo[];
  platformsData: Set<string>;
  hasRegisteredPlatforms: boolean;
  unregisteredPlatforms: string[];
  connectingPlatform: string | null;
  formData: Record<string, string>;
  onConnectPlatform: (platform: string | null) => void;
  onFormDataChange: (data: Record<string, string>) => void;
  onCreateIntegration: () => void;
  isCreating: boolean;
  createError: Error | null;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  isStarting: boolean;
  isStopping: boolean;
  isDeleting: boolean;
  onTest: (id: string) => void;
  isTesting: boolean;
  testResult: { id: string; ok: boolean; message: string } | null;
}) {
  const [showAddPicker, setShowAddPicker] = useState(false);

  // Platforms available to add (registered in core, not yet connected, and have metadata)
  const addablePlatforms = unregisteredPlatforms.filter((p) => platformsData.has(p));

  return (
    <div className="space-y-6">
      {/* ── Connect form (inline, replaces picker when a platform is selected) ── */}
      {connectingPlatform && PLATFORM_META[connectingPlatform] && (
        <div className="card overflow-hidden border-primary/60">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-primary/20">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                {PLATFORM_META[connectingPlatform].icon}
              </div>
              <div>
                <h3 className="font-semibold text-sm">
                  Connect {PLATFORM_META[connectingPlatform].name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {PLATFORM_META[connectingPlatform].description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onConnectPlatform(null);
                setShowAddPicker(false);
              }}
              className="text-muted-foreground hover:text-foreground text-lg leading-none"
              aria-label="Cancel"
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Setup steps */}
            {PLATFORM_META[connectingPlatform].setupSteps && (
              <div className="p-3 bg-muted/40 rounded-lg border border-border/60">
                <p className="text-xs font-semibold text-foreground mb-2">Setup Steps</p>
                <ol className="space-y-1.5">
                  {PLATFORM_META[connectingPlatform].setupSteps.map((step, idx) => (
                    <li key={idx} className="flex gap-2.5 text-xs text-muted-foreground">
                      <span className="text-primary font-medium shrink-0">{idx + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Fields */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onCreateIntegration();
              }}
              className="space-y-3"
            >
              {PLATFORM_META[connectingPlatform].fields.map((field) => (
                <div key={field.key}>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={formData[field.key] || ''}
                    onChange={(e) => {
                      onFormDataChange({ ...formData, [field.key]: e.target.value });
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {field.helpText && (
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                      {field.helpText}
                    </p>
                  )}
                </div>
              ))}

              {createError && (
                <div className="p-2.5 rounded-md bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {createError.message || 'Connection failed'}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={!formData.displayName || isCreating}
                  className="btn btn-primary text-sm px-4 py-2"
                >
                  {isCreating ? 'Connecting…' : 'Connect'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onConnectPlatform(null);
                    setShowAddPicker(false);
                  }}
                  className="btn btn-ghost text-sm px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Connected integrations grid ── */}
      {integrations.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted">{integrations.length} Connected</h3>
            {addablePlatforms.length > 0 && !connectingPlatform && (
              <button
                onClick={() => {
                  setShowAddPicker(!showAddPicker);
                }}
                className="btn btn-ghost text-xs px-3 py-1.5 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onStart={onStart}
                onStop={onStop}
                onDelete={onDelete}
                isStarting={isStarting}
                isStopping={isStopping}
                isDeleting={isDeleting}
                onTest={onTest}
                isTesting={isTesting}
                testResult={testResult?.id === integration.id ? testResult : null}
              />
            ))}
          </div>
        </div>
      ) : !connectingPlatform ? (
        <div className="text-center py-12 space-y-3">
          <Cable className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No integrations connected yet</p>
          {addablePlatforms.length > 0 && (
            <button
              onClick={() => {
                setShowAddPicker(true);
              }}
              className="btn btn-ghost text-xs px-4 py-2 inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Integration
            </button>
          )}
        </div>
      ) : null}

      {/* ── Add-integration picker (compact dropdown-style list) ── */}
      {showAddPicker && !connectingPlatform && addablePlatforms.length > 0 && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Choose a platform</h3>
            <button
              onClick={() => {
                setShowAddPicker(false);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {addablePlatforms.map((platformId) => {
              const meta = PLATFORM_META[platformId];
              if (!meta) return null;
              return (
                <button
                  key={platformId}
                  onClick={() => {
                    onConnectPlatform(platformId);
                    setShowAddPicker(false);
                  }}
                  className="flex items-center gap-2.5 p-2.5 rounded-md border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                >
                  <div className="p-1.5 rounded bg-surface text-muted shrink-0">{meta.icon}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{meta.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{meta.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrationCard({
  integration,
  onStart,
  onStop,
  onDelete,
  isStarting,
  isStopping,
  isDeleting,
  onTest,
  isTesting,
  testResult,
}: {
  integration: IntegrationInfo;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  isStarting: boolean;
  isStopping: boolean;
  isDeleting: boolean;
  onTest?: (id: string) => void;
  isTesting?: boolean;
  testResult?: { ok: boolean; message: string } | null;
}) {
  const meta = PLATFORM_META[integration.platform] ?? {
    name: integration.platform,
    description: '',
    icon: <Globe className="w-6 h-6" />,
    fields: BASE_FIELDS,
  };
  const statusConfig = STATUS_CONFIG[integration.status];
  const isConnected = integration.status === 'connected';
  const isLoading = isStarting || isStopping || isDeleting;

  const accountEmail = integration.config?.email as string | undefined;
  const isEmailPlatform = integration.platform === 'gmail' || integration.platform === 'email';

  const [isEditing, setIsEditing] = useState(false);
  const [editEnabled, setEditEnabled] = useState(integration.enabled);
  const [editRead, setEditRead] = useState((integration.config?.enableRead as boolean) ?? true);
  const [editSend, setEditSend] = useState((integration.config?.enableSend as boolean) ?? false);

  const queryClient = useQueryClient();
  const saveMut = useMutation({
    mutationFn: () =>
      updateIntegration(integration.id, {
        enabled: editEnabled,
        config: isEmailPlatform
          ? { ...integration.config, enableRead: editRead, enableSend: editSend }
          : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setIsEditing(false);
    },
  });

  return (
    <div
      className={`card overflow-hidden transition-colors ${
        isConnected
          ? 'border-green-500/50 bg-green-500/5'
          : integration.status === 'error'
            ? 'border-red-500/50 bg-red-500/5'
            : ''
      }`}
    >
      {/* Status bar across top */}
      <div
        className={`h-1 w-full ${
          isConnected ? 'bg-green-500' : integration.status === 'error' ? 'bg-red-500' : 'bg-border'
        }`}
      />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div
            className={`p-2.5 rounded-xl shrink-0 ${
              isConnected
                ? 'bg-green-500/15 text-green-500'
                : integration.status === 'error'
                  ? 'bg-red-500/15 text-red-500'
                  : 'bg-muted/50 text-muted-foreground'
            }`}
          >
            {meta.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm leading-tight truncate">
                  {integration.displayName}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{meta.name}</p>
              </div>
              <span
                className={`text-xs flex items-center gap-1 shrink-0 px-2 py-1 rounded-full font-medium border ${
                  isConnected
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30'
                    : integration.status === 'error'
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                      : 'bg-muted/50 text-muted-foreground border-border'
                }`}
              >
                {statusConfig.icon}
                <span>{statusConfig.label}</span>
              </span>
            </div>

            {/* Account email */}
            {accountEmail && (
              <p className="text-xs text-foreground/70 mt-1.5 font-mono truncate">{accountEmail}</p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{integration.messageCount} messages</span>
          </div>
          {integration.lastMessageAt && (
            <div className="flex items-center gap-1.5">
              <span className="text-border">·</span>
              <span>Last activity {formatRelativeTime(integration.lastMessageAt)}</span>
            </div>
          )}
        </div>

        {/* Error message */}
        {integration.errorMessage && (
          <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-600 dark:text-red-400 break-words">
              {sanitizeText(integration.errorMessage)}
            </p>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div
            className={`flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-md text-xs border ${
              testResult.ok
                ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
                : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
            }`}
          >
            {testResult.ok ? (
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <XCircle className="w-3.5 h-3.5 shrink-0" />
            )}
            {testResult.message}
          </div>
        )}

        {/* Inline edit form */}
        {isEditing && (
          <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
            {/* Enabled toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Account enabled</p>
                <p className="text-xs text-muted-foreground">Disable to pause without deleting</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditEnabled((v) => !v);
                }}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${editEnabled ? 'text-green-500' : 'text-muted-foreground'}`}
              >
                {editEnabled ? (
                  <ToggleRight className="w-7 h-7" />
                ) : (
                  <ToggleLeft className="w-7 h-7" />
                )}
                {editEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            {/* Read / Send permissions (email platforms only) */}
            {isEmailPlatform && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Permissions
                </p>
                <label className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div>
                    <span className="text-sm font-medium block">Read emails</span>
                    <span className="text-xs text-muted-foreground">
                      Poll inbox for new messages
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editRead}
                    onChange={(e) => {
                      setEditRead(e.target.checked);
                    }}
                    className="w-4 h-4 rounded accent-primary"
                  />
                </label>
                <label className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div>
                    <span className="text-sm font-medium block">Send emails</span>
                    <span className="text-xs text-muted-foreground">
                      Allow sending and replying
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editSend}
                    onChange={(e) => {
                      setEditSend(e.target.checked);
                    }}
                    className="w-4 h-4 rounded accent-primary"
                  />
                </label>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  saveMut.mutate();
                }}
                disabled={saveMut.isPending}
                className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {saveMut.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                }}
                className="btn btn-ghost text-xs px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60">
          {isConnected ? (
            <button
              onClick={() => {
                onStop(integration.id);
              }}
              disabled={isLoading}
              className="btn btn-ghost text-xs px-3 py-1.5"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => {
                onStart(integration.id);
              }}
              disabled={isLoading}
              className="btn btn-ghost text-xs px-3 py-1.5"
            >
              {integration.status === 'error' ? 'Retry' : 'Start'}
            </button>
          )}
          {onTest && (
            <button
              onClick={() => {
                onTest(integration.id);
              }}
              disabled={isLoading || isTesting}
              className="btn btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Test
            </button>
          )}
          <button
            onClick={() => {
              setIsEditing((v) => !v);
            }}
            className={`btn btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 ${isEditing ? 'text-primary' : ''}`}
            title="Edit settings"
          >
            {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {isEditing ? 'Close' : 'Edit'}
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete ${integration.displayName}?`)) onDelete(integration.id);
            }}
            disabled={isLoading}
            className="btn btn-ghost text-xs px-3 py-1.5 text-destructive hover:bg-destructive/10 ml-auto"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function McpTab({
  servers,
  externalServers,
  localServer,
  tools,
  toolsByServer,
  featureConfig,
  securityPolicy,
  showAddForm,
  form,
  toolsExpanded,
  hiddenTools,
  isRestarting,
  onShowAddForm,
  onFormChange,
  onAddMcp,
  isAdding,
  addError,
  onAddEnvVar,
  onRemoveEnvVar,
  onEnvChange,
  onToggle,
  isToggling,
  onDelete,
  isDeleting,
  onFeatureToggle,
  isFeatureToggling,
  onToggleToolsExpanded,
  onToggleToolVisibility,
}: {
  servers: McpServerConfig[];
  externalServers: McpServerConfig[];
  localServer?: McpServerConfig;
  tools: McpToolDef[];
  toolsByServer: Record<string, McpToolDef[]>;
  featureConfig?: McpFeatureConfig;
  securityPolicy?: SecurityPolicy;
  showAddForm: boolean;
  form: AddServerForm;
  toolsExpanded: boolean;
  hiddenTools: Set<string>;
  isRestarting: boolean;
  onShowAddForm: (show: boolean) => void;
  onFormChange: (form: AddServerForm) => void;
  onAddMcp: () => void;
  isAdding: boolean;
  addError: Error | null;
  onAddEnvVar: () => void;
  onRemoveEnvVar: (index: number) => void;
  onEnvChange: (index: number, field: 'key' | 'value', val: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  isToggling: boolean;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  onFeatureToggle: (data: Partial<McpFeatureConfig>) => void;
  isFeatureToggling: boolean;
  onToggleToolsExpanded: () => void;
  onToggleToolVisibility: (toolKey: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
          {servers.filter((s) => s.enabled).length} enabled / {servers.length} configured
        </span>
        <button
          className="btn btn-ghost text-sm px-3 py-1.5 flex items-center gap-1 whitespace-nowrap"
          onClick={() => {
            onShowAddForm(!showAddForm);
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Server
        </button>
      </div>

      {showAddForm && (
        <div className="card p-4 border-primary border-2">
          <h3 className="font-medium text-sm mb-3">Add MCP Server</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAddMcp();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    onFormChange({ ...form, name: e.target.value });
                  }}
                  placeholder="e.g. filesystem-server"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Transport</label>
                <select
                  value={form.transport}
                  onChange={(e) => {
                    onFormChange({ ...form, transport: e.target.value as TransportType });
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="stdio">stdio</option>
                  <option value="sse">sse</option>
                  <option value="streamable-http">streamable-http</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => {
                  onFormChange({ ...form, description: e.target.value });
                }}
                placeholder="Optional description"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {form.transport === 'stdio' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Command</label>
                  <input
                    type="text"
                    value={form.command}
                    onChange={(e) => {
                      onFormChange({ ...form, command: e.target.value });
                    }}
                    placeholder="e.g. npx or python"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Args (space-separated)
                  </label>
                  <input
                    type="text"
                    value={form.args}
                    onChange={(e) => {
                      onFormChange({ ...form, args: e.target.value });
                    }}
                    placeholder="e.g. -y @modelcontextprotocol/server-filesystem /tmp"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => {
                    onFormChange({ ...form, url: e.target.value });
                  }}
                  placeholder="https://example.com/mcp"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">Environment Variables</label>
                <button
                  type="button"
                  onClick={onAddEnvVar}
                  className="text-xs text-primary hover:text-primary/80"
                >
                  + Add Variable
                </button>
              </div>
              {form.env.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={entry.key}
                    onChange={(e) => {
                      onEnvChange(i, 'key', e.target.value);
                    }}
                    placeholder="KEY"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-muted-foreground">=</span>
                  <input
                    type="text"
                    value={entry.value}
                    onChange={(e) => {
                      onEnvChange(i, 'value', e.target.value);
                    }}
                    placeholder="value"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveEnvVar(i);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {addError && (
              <p className="text-xs text-red-400">{addError.message || 'Failed to add server'}</p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!form.name.trim() || isAdding}
                className="btn btn-ghost text-sm px-3 py-1.5"
              >
                {isAdding ? 'Adding...' : 'Add Server'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onShowAddForm(false);
                }}
                className="btn btn-ghost text-sm px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {localServer && (
        <LocalServerCard
          server={localServer}
          toolCount={
            tools
              .filter((t) => t.serverName === LOCAL_MCP_NAME)
              .filter((t) => {
                const NETWORK_PREFIXES = [
                  'network_',
                  'netbox_',
                  'nvd_',
                  'subnet_',
                  'wildcard_',
                  'pcap_',
                ];
                if (
                  NETWORK_PREFIXES.some((p) => t.name.startsWith(p)) &&
                  !featureConfig?.exposeNetworkTools
                )
                  return false;
                if (t.name.startsWith('netbox_') && !securityPolicy?.allowNetBoxWrite) return false;
                if (t.name.startsWith('twingate_') && !featureConfig?.exposeTwingateTools)
                  return false;
                if (t.name.startsWith('gmail_') && !featureConfig?.exposeGmail) return false;
                if (t.name.startsWith('twitter_') && !featureConfig?.exposeTwitter) return false;
                if (t.name.startsWith('github_') && !featureConfig?.exposeGithub) return false;
                if (t.name.startsWith('intent_') && !featureConfig?.exposeOrgIntentTools)
                  return false;
                if (t.name.startsWith('kb_') && !featureConfig?.exposeKnowledgeBase) return false;
                if (t.name.startsWith('docker_') && !featureConfig?.exposeDockerTools) return false;
                if (t.name.startsWith('terminal_') && !featureConfig?.exposeTerminal) return false;
                if (t.name.startsWith('gha_') && !featureConfig?.exposeGithubActions) return false;
                if (t.name.startsWith('jenkins_') && !featureConfig?.exposeJenkins) return false;
                if (t.name.startsWith('gitlab_') && !featureConfig?.exposeGitlabCi) return false;
                if (t.name.startsWith('northflank_') && !featureConfig?.exposeNorthflank)
                  return false;
                return true;
              }).length
          }
          onDelete={() => {
            onDelete(localServer.id);
          }}
          onToggle={(enabled) => {
            onToggle(localServer.id, enabled);
          }}
          isToggling={isToggling}
          isDeleting={isDeleting}
          isRestarting={isRestarting}
          featureConfig={featureConfig}
          securityPolicy={securityPolicy}
          onFeatureToggle={onFeatureToggle}
          isFeatureToggling={isFeatureToggling}
        />
      )}

      {externalServers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Configured Servers</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {externalServers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                toolCount={tools.filter((t) => t.serverId === server.id).length}
                onDelete={() => {
                  onDelete(server.id);
                }}
                onToggle={(enabled) => {
                  onToggle(server.id, enabled);
                }}
                isToggling={isToggling}
                isDeleting={isDeleting}
              />
            ))}
          </div>
        </div>
      )}

      {!localServer && externalServers.length === 0 && (
        <div className="card p-6 text-center text-sm text-muted-foreground">
          No MCP servers configured yet. Click "Add Server" to connect one.
        </div>
      )}

      {tools.length > 0 && (
        <div className="card p-4">
          <button
            onClick={onToggleToolsExpanded}
            className="flex items-center gap-2 w-full text-left"
          >
            {toolsExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Wrench className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Discovered Tools</span>
            <span className="text-xs text-muted-foreground ml-auto">{tools.length} tools</span>
          </button>

          {toolsExpanded && (
            <div className="mt-3 space-y-3">
              {Object.entries(toolsByServer).map(([serverName, serverTools]) => (
                <div key={serverName}>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">{serverName}</h4>
                  <div className="space-y-1">
                    {serverTools.map((tool) => {
                      const toolKey = `${tool.serverId}:${tool.name}`;
                      const isHidden = hiddenTools.has(toolKey);
                      return (
                        <div
                          key={toolKey}
                          className={`flex items-start gap-2 p-2 rounded bg-muted/30 text-sm ${isHidden ? 'opacity-40' : ''}`}
                        >
                          <Wrench className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-xs">{tool.name}</span>
                            {tool.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {tool.description}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              onToggleToolVisibility(toolKey);
                            }}
                            className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
                            title={isHidden ? 'Show tool' : 'Hide tool'}
                          >
                            {isHidden ? (
                              <EyeOff className="w-3 h-3" />
                            ) : (
                              <Eye className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LocalServerCard({
  server,
  toolCount,
  onDelete,
  onToggle,
  isToggling,
  isDeleting,
  isRestarting,
  featureConfig,
  securityPolicy,
  onFeatureToggle,
  isFeatureToggling,
}: {
  server: McpServerConfig;
  toolCount: number;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  isToggling: boolean;
  isDeleting: boolean;
  isRestarting: boolean;
  featureConfig?: McpFeatureConfig;
  securityPolicy?: SecurityPolicy;
  onFeatureToggle: (data: Partial<McpFeatureConfig>) => void;
  isFeatureToggling: boolean;
}) {
  const queryClient = useQueryClient();
  const policyMut = useMutation({
    mutationFn: (patch: Parameters<typeof updateSecurityPolicy>[0]) => updateSecurityPolicy(patch),
    onSuccess: () =>
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['securityPolicy'] }),
        queryClient.invalidateQueries({ queryKey: ['mcpTools'] }),
        queryClient.invalidateQueries({ queryKey: ['mcpServers'] }),
      ]),
  });

  const [expanded, setExpanded] = useState(false);
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const autoGenRef = useRef(false);

  const { data: keysData, isLoading: mcpKeysLoading } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: fetchApiKeys,
  });
  const mcpKeys = (keysData?.keys ?? []).filter((k) => k.name === LOCAL_MCP_NAME);

  const createMcpKeyMut = useMutation({
    mutationFn: () => createApiKey({ name: LOCAL_MCP_NAME, role: 'operator' }),
    onSuccess: (result) => {
      setMcpToken(result.rawKey);
      void queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });

  const revokeMcpKeyMut = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['apiKeys'] }),
  });

  // Auto-generate a key on first load if none exist
  useEffect(() => {
    if (autoGenRef.current || !keysData || mcpKeys.length > 0) return;
    autoGenRef.current = true;
    createMcpKeyMut.mutate();
  }, [keysData]); // eslint-disable-line react-hooks/exhaustive-deps

  const mcpUrl = server.url ?? `${window.location.origin}/mcp/v1`;

  function copyText(text: string, setter: (v: boolean) => void) {
    void navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => {
        setter(false);
      }, 2000);
    });
  }

  const mcpJsonConfig = JSON.stringify(
    {
      mcpServers: {
        yeoman: {
          url: mcpUrl,
          headers: { Authorization: `Bearer ${mcpToken ?? '<your-token>'}` },
        },
      },
    },
    null,
    2
  );

  return (
    <div className={`card ${!server.enabled ? 'opacity-60' : ''}`}>
      {/* Collapsible header — always visible */}
      <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
        <button
          onClick={() => {
            setExpanded((v) => !v);
          }}
          className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 text-left"
        >
          <div
            className={`p-1.5 sm:p-2 rounded-lg shrink-0 transition-colors ${isRestarting ? 'bg-yellow-500/20 text-yellow-400 animate-pulse' : 'bg-surface text-muted-foreground'}`}
          >
            <Wrench className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate">{server.name}</h3>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs text-muted-foreground">
              <span className="px-1.5 py-0.5 rounded bg-muted/50">{server.transport}</span>
              <span className="shrink-0">{toolCount} tools</span>
              {isRestarting && <span className="text-yellow-400 animate-pulse">Reloading...</span>}
            </div>
          </div>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </button>
        <button
          onClick={() => {
            onToggle(!server.enabled);
          }}
          disabled={isToggling}
          className={`text-xs flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full transition-colors ${
            server.enabled
              ? 'text-green-400 hover:bg-green-400/10'
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          {server.enabled ? (
            <>
              <Power className="w-3 h-3" /> Enabled
            </>
          ) : (
            <>
              <PowerOff className="w-3 h-3" /> Disabled
            </>
          )}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-0">
          {server.description && (
            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{server.description}</p>
          )}

          {/* Connection Setup */}
          <div className="pt-3 border-t border-border">
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Key className="w-3 h-3" />
              Connect your MCP client
            </h4>

            {/* URL row */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] text-muted-foreground shrink-0">URL</span>
              <code className="flex-1 text-[10px] bg-muted/40 rounded px-2 py-1 font-mono truncate">
                {mcpUrl}
              </code>
              <button
                onClick={() => {
                  copyText(mcpUrl, setCopiedUrl);
                }}
                className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground"
                title="Copy URL"
              >
                {copiedUrl ? (
                  <Check className="w-3 h-3 text-green-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
              {createMcpKeyMut.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />
              ) : (
                <button
                  onClick={() => {
                    createMcpKeyMut.mutate();
                  }}
                  className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground"
                  title="Generate new token"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Newly generated key — shown once */}
            {mcpToken && (
              <div className="mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                <p className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                  <Info className="w-2.5 h-2.5 shrink-0" />
                  New key generated — copy it now, shown once only
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[10px] bg-black/20 rounded px-2 py-1 font-mono truncate text-amber-300">
                    {showToken ? mcpToken : '••••••••••••••••••••••••••••••••'}
                  </code>
                  <button
                    onClick={() => {
                      setShowToken((v) => !v);
                    }}
                    className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground"
                    title={showToken ? 'Hide token' : 'Reveal token'}
                  >
                    {showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => {
                      copyText(mcpToken, setCopiedToken);
                    }}
                    className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground"
                    title="Copy token"
                  >
                    {copiedToken ? (
                      <Check className="w-3 h-3 text-green-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground">Config snippet</span>
                    <button
                      onClick={() => {
                        copyText(mcpJsonConfig, setCopiedConfig);
                      }}
                      className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedConfig ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      {copiedConfig ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-[9px] bg-black/20 rounded p-2 font-mono overflow-x-auto whitespace-pre text-amber-200/70">
                    {mcpJsonConfig}
                  </pre>
                </div>
              </div>
            )}

            {/* Active keys listing */}
            {mcpKeysLoading ? (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-1 mb-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading keys...
              </div>
            ) : mcpKeys.length > 0 ? (
              <div className="space-y-1 mb-2">
                {mcpKeys.map((k) => (
                  <div key={k.id} className="flex items-center gap-2 p-1.5 rounded-md bg-muted/30">
                    <Key className="w-3 h-3 text-muted-foreground shrink-0" />
                    <code className="flex-1 text-[10px] font-mono text-muted-foreground truncate">
                      {k.prefix}••••••••••••
                    </code>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(k.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => {
                        revokeMcpKeyMut.mutate(k.id);
                      }}
                      disabled={revokeMcpKeyMut.isPending}
                      className="shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Revoke key"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {createMcpKeyMut.isError && (
              <p className="text-[10px] text-destructive mt-1">
                Failed to generate token — try again.
              </p>
            )}
          </div>

          {featureConfig && server.enabled && (
            <div className="mt-3 pt-3 border-t border-border">
              <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Wrench className="w-3 h-3" />
                Feature Toggles
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                  <GitBranchIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Git & GitHub</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig.exposeGit}
                    onChange={(e) => {
                      onFeatureToggle({ exposeGit: e.target.checked });
                    }}
                    disabled={isFeatureToggling}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                  <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Filesystem</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig.exposeFilesystem}
                    onChange={(e) => {
                      onFeatureToggle({ exposeFilesystem: e.target.checked });
                    }}
                    disabled={isFeatureToggling}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Web Tools</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig.exposeWeb}
                    onChange={(e) => {
                      onFeatureToggle({ exposeWeb: e.target.checked });
                    }}
                    disabled={isFeatureToggling}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
                <label
                  className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  title="Browser automation via Playwright"
                >
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Browser Automation</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig.exposeBrowser}
                    onChange={(e) => {
                      onFeatureToggle({ exposeBrowser: e.target.checked });
                    }}
                    disabled={isFeatureToggling}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
                {/* Desktop Control — locked if allowDesktopControl=false in security policy (.env gate) */}
                <label
                  className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                    securityPolicy?.allowDesktopControl
                      ? 'bg-muted/30 cursor-pointer hover:bg-muted/50'
                      : 'bg-muted/10 cursor-not-allowed opacity-50'
                  }`}
                  title={
                    securityPolicy?.allowDesktopControl
                      ? 'Remote desktop control — screen capture, keyboard/mouse, clipboard'
                      : 'Enable Desktop Control in Security Settings first'
                  }
                >
                  <Monitor className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Remote Desktop Control</span>
                    {!securityPolicy?.allowDesktopControl && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        Enable in Security Settings first
                      </p>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig.exposeDesktopControl}
                    onChange={(e) => {
                      onFeatureToggle({ exposeDesktopControl: e.target.checked });
                    }}
                    disabled={isFeatureToggling || !securityPolicy?.allowDesktopControl}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
                {/* Network Tools — gated on allowNetworkTools security policy */}
                <label
                  className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                    securityPolicy?.allowNetworkTools
                      ? 'bg-muted/30 cursor-pointer hover:bg-muted/50'
                      : 'bg-muted/10 cursor-not-allowed opacity-50'
                  }`}
                  title={
                    securityPolicy?.allowNetworkTools
                      ? 'SSH automation, topology discovery, security auditing, NetBox, NVD'
                      : 'Enable Network Tools in Security Settings first'
                  }
                >
                  <Network className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Network Tools</span>
                    {!securityPolicy?.allowNetworkTools && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        Enable in Security Settings first
                      </p>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig.exposeNetworkTools}
                    onChange={(e) => {
                      onFeatureToggle({ exposeNetworkTools: e.target.checked });
                    }}
                    disabled={isFeatureToggling || !securityPolicy?.allowNetworkTools}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
                {/* NetBox Write — sub-gate, only meaningful when Network Tools enabled */}
                <label
                  className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                    featureConfig.exposeNetworkTools
                      ? 'bg-muted/30 cursor-pointer hover:bg-muted/50'
                      : 'bg-muted/10 cursor-not-allowed opacity-50'
                  }`}
                  title={
                    featureConfig.exposeNetworkTools
                      ? 'Allow agents to create, update, or delete NetBox records'
                      : 'Enable Network Tools first'
                  }
                >
                  <Database className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">NetBox Write</span>
                    {!featureConfig.exposeNetworkTools && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        Enable Network Tools first
                      </p>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={securityPolicy?.allowNetBoxWrite ?? false}
                    onChange={(e) => {
                      policyMut.mutate({ allowNetBoxWrite: e.target.checked });
                    }}
                    disabled={policyMut.isPending || !featureConfig.exposeNetworkTools}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
              </div>

              {/* Connected-account API tools — Gmail + Twitter */}
              <div className="mt-3 pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  Connected Account Tools
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="Gmail tools — list, read, draft, and send emails via the Gmail API (gmail_*)"
                  >
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">Gmail</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        gmail_list_messages, read, draft, send
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeGmail ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeGmail: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="Twitter/X tools — search, read timeline, post tweets, like, retweet (twitter_*)"
                  >
                    <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">Twitter / X</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        twitter_search, post, like, retweet
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeTwitter ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeTwitter: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="GitHub API tools — list repos, read issues/PRs, create issues, open PRs, comment (github_*)"
                  >
                    <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">GitHub</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        github_list_repos, issues, PRs, comment
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeGithub ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeGithub: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                </div>
              </div>

              {/* Knowledge Base & Organizational Intent */}
              <div className="mt-3 pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  Knowledge &amp; Intent
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="Knowledge Base tools (kb_*) — search, add, list, and delete documents in the RAG knowledge base."
                  >
                    <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">Knowledge Base Access</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        kb_search, kb_add_document, kb_list, kb_delete
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeKnowledgeBase ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeKnowledgeBase: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="Organizational Intent tools (intent_*) — read signals, list/create/update/activate/delete intent documents, query enforcement log."
                  >
                    <Target className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">Organizational Intent Access</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        intent_signal_read, list, create, update, activate
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeOrgIntentTools ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeOrgIntentTools: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                </div>
              </div>

              {/* Infrastructure Tools — Docker */}
              <div className="mt-3 pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Box className="w-3 h-3" />
                  Infrastructure Tools
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="Docker tools — ps, logs, start/stop, exec, pull, compose up/down (docker_*). Requires MCP_EXPOSE_DOCKER=true and host socket mount or DinD sidecar."
                  >
                    <Box className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">Docker</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        docker_ps, logs, exec, compose up/down
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeDockerTools ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeDockerTools: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                  {/* Terminal */}
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="Terminal tools — execute shell commands in workspace directories with security filtering (terminal_execute, terminal_tech_stack). Set MCP_EXPOSE_TERMINAL=true."
                  >
                    <Terminal className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">Terminal</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        terminal_execute, terminal_tech_stack
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeTerminal ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeTerminal: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                </div>
              </div>

              {/* CI/CD Platforms — Phase 90 */}
              <FeatureLock feature="cicd_integration">
                <div className="mt-3 pt-2 border-t border-border/50">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    CI/CD Platforms
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* GitHub Actions */}
                    <label
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                      title="GitHub Actions tools (gha_*) — list/trigger/cancel workflows, fetch logs. Reuses existing GitHub OAuth token."
                    >
                      <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">GitHub Actions</span>
                        <p className="text-[10px] text-muted-foreground truncate">
                          gha_list_workflows, dispatch, cancel, logs
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={featureConfig.exposeGithubActions ?? false}
                        onChange={(e) => {
                          onFeatureToggle({ exposeGithubActions: e.target.checked });
                        }}
                        disabled={isFeatureToggling}
                        className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                      />
                    </label>

                    {/* Jenkins */}
                    <label
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                      title="Jenkins tools (jenkins_*) — list jobs, trigger/get builds, fetch logs. Requires jenkinsUrl, username, API token."
                    >
                      <Wrench className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">Jenkins</span>
                        <p className="text-[10px] text-muted-foreground truncate">
                          jenkins_list_jobs, trigger_build, get_build_log
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={featureConfig.exposeJenkins ?? false}
                        onChange={(e) => {
                          onFeatureToggle({ exposeJenkins: e.target.checked });
                        }}
                        disabled={isFeatureToggling}
                        className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                      />
                    </label>

                    {/* GitLab CI */}
                    <label
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                      title="GitLab CI tools (gitlab_*) — list/trigger/cancel pipelines, fetch job logs. Requires gitlabToken."
                    >
                      <GitMerge className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">GitLab CI</span>
                        <p className="text-[10px] text-muted-foreground truncate">
                          gitlab_list_pipelines, trigger, cancel, job_log
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={featureConfig.exposeGitlabCi ?? false}
                        onChange={(e) => {
                          onFeatureToggle({ exposeGitlabCi: e.target.checked });
                        }}
                        disabled={isFeatureToggling}
                        className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                      />
                    </label>

                    {/* Northflank */}
                    <label
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                      title="Northflank tools (northflank_*) — list services, trigger builds/deployments. Requires northflankApiKey."
                    >
                      <Zap className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">Northflank</span>
                        <p className="text-[10px] text-muted-foreground truncate">
                          northflank_list_services, trigger_build, deploy
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={featureConfig.exposeNorthflank ?? false}
                        onChange={(e) => {
                          onFeatureToggle({ exposeNorthflank: e.target.checked });
                        }}
                        disabled={isFeatureToggling}
                        className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                      />
                    </label>
                  </div>
                </div>
              </FeatureLock>

              {/* Markdown for Agents — Content-Signal enforcement policy */}
              <div className="mt-3 pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Content Negotiation
                </p>
                <label
                  className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  title="Refuse content from URLs that respond with Content-Signal: ai-input=no"
                >
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Respect Content-Signal</span>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Block pages that opt out of AI indexing (Content-Signal: ai-input=no)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig?.respectContentSignal ?? true}
                    onChange={(e) => {
                      onFeatureToggle({ respectContentSignal: e.target.checked });
                    }}
                    disabled={isFeatureToggling}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
              </div>

              {/* Twingate Remote Access */}
              <div className="mt-3 pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Network className="w-3 h-3" />
                  Twingate Remote Access
                </p>
                <label
                  className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                    securityPolicy?.allowTwingate
                      ? 'bg-muted/30 cursor-pointer hover:bg-muted/50'
                      : 'bg-muted/10 cursor-not-allowed opacity-50'
                  }`}
                  title={
                    securityPolicy?.allowTwingate
                      ? 'Zero-trust tunnel — agents can reach private MCP servers and resources'
                      : 'Enable Twingate in Security settings first'
                  }
                >
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Twingate Zero-Trust Tunnel</span>
                    {!securityPolicy?.allowTwingate ? (
                      <p className="text-[10px] text-muted-foreground truncate">
                        Enable Twingate in Security settings first
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground truncate">
                        Agents can reach private MCP servers and resources via Twingate
                      </p>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig?.exposeTwingateTools ?? false}
                    onChange={(e) => {
                      onFeatureToggle({ exposeTwingateTools: e.target.checked });
                    }}
                    disabled={isFeatureToggling || !securityPolicy?.allowTwingate}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
            {featureConfig && server.enabled && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Info className="w-2.5 h-2.5" />
                Feature toggles control which tool categories are available. To grant a personality
                access, edit the personality and enable MCP connections.
              </p>
            )}
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ServerCard({
  server,
  toolCount,
  onDelete,
  onToggle,
  isToggling,
  isDeleting,
}: {
  server: McpServerConfig;
  toolCount: number;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  isToggling: boolean;
  isDeleting: boolean;
}) {
  const transportIcon =
    server.transport === 'stdio' ? <Terminal className="w-5 h-5" /> : <Globe className="w-5 h-5" />;

  return (
    <div className={`card p-3 sm:p-4 ${!server.enabled ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="p-1.5 sm:p-2 rounded-lg bg-surface text-muted-foreground shrink-0">
          {transportIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-sm truncate">{server.name}</h3>
            <button
              onClick={() => {
                onToggle(!server.enabled);
              }}
              disabled={isToggling}
              className={`text-xs flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full transition-colors ${
                server.enabled
                  ? 'text-green-400 hover:bg-green-400/10'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {server.enabled ? (
                <>
                  <Power className="w-3 h-3" /> Enabled
                </>
              ) : (
                <>
                  <PowerOff className="w-3 h-3" /> Disabled
                </>
              )}
            </button>
          </div>
          {server.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{server.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-xs text-muted-foreground">
            <span className="px-1.5 py-0.5 rounded bg-muted/50">{server.transport}</span>
            {server.transport === 'stdio' && server.command && (
              <span className="truncate font-mono max-w-[120px] sm:max-w-[200px]">
                {server.command}
              </span>
            )}
            {server.transport !== 'stdio' && server.url && (
              <span className="truncate font-mono max-w-[120px] sm:max-w-[200px]">
                {server.url}
              </span>
            )}
            <span className="shrink-0">{toolCount} tools</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" />
          Remove
        </button>
      </div>
    </div>
  );
}

function EmailTab({
  integrations,
  onStart,
  onStop,
  onDelete,
  isStarting,
  isStopping,
  isDeleting,
  availablePlatforms,
}: {
  integrations: IntegrationInfo[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  isStarting: boolean;
  isStopping: boolean;
  isDeleting: boolean;
  availablePlatforms: Set<string>;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [showConfig, setShowConfig] = useState(false);
  const [gmailForm, setGmailForm] = useState({
    displayName: '',
    enableRead: true,
    enableSend: false,
    labelFilter: 'all' as 'all' | 'label' | 'custom',
    labelName: '',
  });
  const [claimError, setClaimError] = useState<string | null>(null);
  const [showImapForm, setShowImapForm] = useState(false);
  const [imapForm, setImapForm] = useState({
    displayName: '',
    imapHost: '',
    imapPort: '993',
    smtpHost: '',
    smtpPort: '465',
    username: '',
    password: '',
    tls: true,
    rejectUnauthorized: true,
    enableRead: true,
    enableSend: false,
    preset: 'custom' as 'protonmail' | 'outlook' | 'yahoo' | 'custom',
  });
  const [imapError, setImapError] = useState<string | null>(null);

  // Parse OAuth callback params
  const searchParams = new URLSearchParams(location.search);
  const isConnected = searchParams.get('connected') === 'true';
  const oauthEmail = searchParams.get('email') || '';
  const connectionToken = searchParams.get('token') || '';
  const oauthError = searchParams.get('error');

  // Pre-fill display name from email
  useEffect(() => {
    if (oauthEmail && !gmailForm.displayName) {
      setGmailForm((f) => ({ ...f, displayName: oauthEmail }));
    }
  }, [oauthEmail]);

  // Show config form when we get a successful OAuth callback
  useEffect(() => {
    if (isConnected && connectionToken) {
      setShowConfig(true);
    }
  }, [isConnected, connectionToken]);

  const claimMut = useMutation({
    mutationFn: async () => {
      setClaimError(null);
      const result = await claimGmailOAuth({
        connectionToken,
        displayName: gmailForm.displayName,
        enableRead: gmailForm.enableRead,
        enableSend: gmailForm.enableSend,
        labelFilter: gmailForm.labelFilter,
        labelName: gmailForm.labelFilter !== 'all' ? gmailForm.labelName : undefined,
      });

      // Create the integration using the claimed config
      const integration = await createIntegration(result.config);
      await startIntegration(integration.id);
      return integration;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setShowConfig(false);
      // Clear URL params
      window.history.replaceState({}, '', '/connections/email');
    },
    onError: (err: Error) => {
      // Still refresh the list — the integration was created even if start failed
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setClaimError(err.message || 'Failed to set up Gmail integration');
    },
  });

  const imapCreateMut = useMutation({
    mutationFn: async () => {
      setImapError(null);
      const integration = await createIntegration({
        platform: 'email',
        displayName: imapForm.displayName || 'Email (IMAP/SMTP)',
        enabled: true,
        config: {
          imapHost: imapForm.imapHost,
          imapPort: parseInt(imapForm.imapPort, 10),
          smtpHost: imapForm.smtpHost,
          smtpPort: parseInt(imapForm.smtpPort, 10),
          username: imapForm.username,
          password: imapForm.password,
          tls: imapForm.tls,
          rejectUnauthorized: imapForm.rejectUnauthorized,
          enableRead: imapForm.enableRead,
          enableSend: imapForm.enableSend,
        },
      });
      await startIntegration(integration.id);
      return integration;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setShowImapForm(false);
      setImapForm((f) => ({ ...f, displayName: '', username: '', password: '' }));
    },
    onError: (err: Error) => {
      setImapError(err.message || 'Failed to connect email');
    },
  });

  const applyPreset = (preset: string) => {
    switch (preset) {
      case 'protonmail':
        setImapForm((f) => ({
          ...f,
          preset: 'protonmail',
          imapHost: '127.0.0.1',
          imapPort: '1143',
          smtpHost: '127.0.0.1',
          smtpPort: '1025',
          tls: false,
          rejectUnauthorized: false,
        }));
        break;
      case 'outlook':
        setImapForm((f) => ({
          ...f,
          preset: 'outlook',
          imapHost: 'outlook.office365.com',
          imapPort: '993',
          smtpHost: 'smtp.office365.com',
          smtpPort: '587',
          tls: true,
          rejectUnauthorized: true,
        }));
        break;
      case 'yahoo':
        setImapForm((f) => ({
          ...f,
          preset: 'yahoo',
          imapHost: 'imap.mail.yahoo.com',
          imapPort: '993',
          smtpHost: 'smtp.mail.yahoo.com',
          smtpPort: '465',
          tls: true,
          rejectUnauthorized: true,
        }));
        break;
      default:
        setImapForm((f) => ({ ...f, preset: 'custom' }));
        break;
    }
  };

  const hasGmail = integrations.length > 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Connect email accounts for direct email integration. SecureYeoman can read incoming emails
        and optionally send replies on your behalf. Supports Gmail (OAuth) and any IMAP/SMTP
        provider.
      </p>

      {oauthError && (
        <div className="p-3 rounded border border-destructive bg-destructive/10 text-destructive text-sm">
          Gmail connection error: {decodeURIComponent(oauthError)}
        </div>
      )}

      {/* Connected Gmail integrations */}
      {hasGmail && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Connected Accounts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onStart={onStart}
                onStop={onStop}
                onDelete={onDelete}
                isStarting={isStarting}
                isStopping={isStopping}
                isDeleting={isDeleting}
              />
            ))}
          </div>
        </div>
      )}

      {/* Config form after OAuth callback */}
      {showConfig && (
        <div className="card p-4 border-primary border-2">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-5 h-5 text-primary" />
            <h3 className="font-medium text-sm">Configure Gmail — {oauthEmail}</h3>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              claimMut.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="text-xs text-muted block mb-1">Display Name</label>
              <input
                type="text"
                value={gmailForm.displayName}
                onChange={(e) => {
                  setGmailForm((f) => ({ ...f, displayName: e.target.value }));
                }}
                placeholder="e.g. My Gmail"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex-1">
                  <span className="text-xs font-medium block">Read Emails</span>
                  <span className="text-xs text-muted">Poll inbox for new messages</span>
                </div>
                <input
                  type="checkbox"
                  checked={gmailForm.enableRead}
                  onChange={(e) => {
                    setGmailForm((f) => ({ ...f, enableRead: e.target.checked }));
                  }}
                  className="w-4 h-4 rounded accent-primary"
                />
              </label>
              <label className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex-1">
                  <span className="text-xs font-medium block">Send Emails</span>
                  <span className="text-xs text-muted">Allow sending replies</span>
                </div>
                <input
                  type="checkbox"
                  checked={gmailForm.enableSend}
                  onChange={(e) => {
                    setGmailForm((f) => ({ ...f, enableSend: e.target.checked }));
                  }}
                  className="w-4 h-4 rounded accent-primary"
                />
              </label>
            </div>

            <div>
              <label className="text-xs text-muted block mb-1">Inbox Filter</label>
              <select
                value={gmailForm.labelFilter}
                onChange={(e) => {
                  setGmailForm((f) => ({
                    ...f,
                    labelFilter: e.target.value as 'all' | 'label' | 'custom',
                  }));
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Inbox</option>
                <option value="label">Specific Label</option>
                <option value="custom">Custom App Label (auto-created)</option>
              </select>
              <p className="text-xs text-muted mt-1 flex items-center gap-1">
                <HelpCircle className="w-3 h-3" />
                {gmailForm.labelFilter === 'all'
                  ? 'Process all incoming inbox messages'
                  : gmailForm.labelFilter === 'label'
                    ? 'Only process messages with this Gmail label'
                    : 'Auto-creates a dedicated label for SecureYeoman'}
              </p>
            </div>

            {gmailForm.labelFilter !== 'all' && (
              <div>
                <label className="text-xs text-muted block mb-1">Label Name</label>
                <input
                  type="text"
                  value={gmailForm.labelName}
                  onChange={(e) => {
                    setGmailForm((f) => ({ ...f, labelName: e.target.value }));
                  }}
                  placeholder={
                    gmailForm.labelFilter === 'custom'
                      ? `secureyeoman.${oauthEmail}`
                      : 'e.g. SecureYeoman'
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            )}

            {claimError && <p className="text-xs text-red-400">{claimError}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!gmailForm.displayName || claimMut.isPending}
                className="btn btn-ghost text-xs px-3 py-1.5"
              >
                {claimMut.isPending ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Setting up...
                  </span>
                ) : (
                  'Finish Setup'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfig(false);
                  window.history.replaceState({}, '', '/connections/email');
                }}
                className="btn btn-ghost text-xs px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Connect button */}
      {!showConfig && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Add Email Account</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="card p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted/30 text-foreground">
                  <Mail className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">Gmail</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      Available
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect your Gmail account for email messaging
                  </p>
                  <div className="mt-3 p-3 bg-muted/20 rounded-md">
                    <p className="text-xs font-medium text-muted-foreground mb-2">How it works</p>
                    <ol className="text-xs space-y-1">
                      <li className="flex gap-2">
                        <span className="text-muted-foreground">1.</span>
                        <span>Click &quot;Connect with Google&quot; to authorize</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-muted-foreground">2.</span>
                        <span>Grant permissions to read and/or send emails</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-muted-foreground">3.</span>
                        <span>Configure read/send preferences and label filter</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-muted-foreground">4.</span>
                        <span>Gmail will be polled every 30 seconds for new messages</span>
                      </li>
                    </ol>
                  </div>
                  <button
                    onClick={() => {
                      window.location.href = '/api/v1/auth/oauth/gmail';
                    }}
                    className="btn btn-ghost text-xs px-3 py-1.5 mt-3 flex items-center gap-1.5"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Connect with Google
                  </button>
                </div>
              </div>
            </div>

            {/* IMAP/SMTP Card */}
            {showImapForm ? (
              <div className="card p-4 border-primary border-2 md:col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="w-5 h-5 text-primary" />
                  <h3 className="font-medium text-sm">Connect Email (IMAP/SMTP)</h3>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    imapCreateMut.mutate();
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="text-xs text-muted block mb-1">Provider Preset</label>
                    <select
                      value={imapForm.preset}
                      onChange={(e) => {
                        applyPreset(e.target.value);
                      }}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="custom">Custom</option>
                      <option value="protonmail">ProtonMail Bridge (localhost)</option>
                      <option value="outlook">Outlook / Office 365</option>
                      <option value="yahoo">Yahoo Mail</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-muted block mb-1">Display Name</label>
                    <input
                      type="text"
                      value={imapForm.displayName}
                      onChange={(e) => {
                        setImapForm((f) => ({ ...f, displayName: e.target.value }));
                      }}
                      placeholder="e.g. My ProtonMail"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted block mb-1">IMAP Host</label>
                      <input
                        type="text"
                        value={imapForm.imapHost}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, imapHost: e.target.value }));
                        }}
                        placeholder="127.0.0.1"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">IMAP Port</label>
                      <input
                        type="text"
                        value={imapForm.imapPort}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, imapPort: e.target.value }));
                        }}
                        placeholder="993"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted block mb-1">SMTP Host</label>
                      <input
                        type="text"
                        value={imapForm.smtpHost}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, smtpHost: e.target.value }));
                        }}
                        placeholder="127.0.0.1"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">SMTP Port</label>
                      <input
                        type="text"
                        value={imapForm.smtpPort}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, smtpPort: e.target.value }));
                        }}
                        placeholder="465"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted block mb-1">Username</label>
                      <input
                        type="text"
                        value={imapForm.username}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, username: e.target.value }));
                        }}
                        placeholder="user@example.com"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">Password</label>
                      <input
                        type="password"
                        value={imapForm.password}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, password: e.target.value }));
                        }}
                        placeholder="Password or app password"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex-1">
                        <span className="text-xs font-medium block">TLS</span>
                        <span className="text-xs text-muted">Use encrypted connection</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={imapForm.tls}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, tls: e.target.checked }));
                        }}
                        className="w-4 h-4 rounded accent-primary"
                      />
                    </label>
                    <label className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex-1">
                        <span className="text-xs font-medium block">Allow Self-Signed</span>
                        <span className="text-xs text-muted">For ProtonMail Bridge</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={!imapForm.rejectUnauthorized}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, rejectUnauthorized: !e.target.checked }));
                        }}
                        className="w-4 h-4 rounded accent-primary"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex-1">
                        <span className="text-xs font-medium block">Read Emails</span>
                        <span className="text-xs text-muted">Poll via IMAP for new messages</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={imapForm.enableRead}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, enableRead: e.target.checked }));
                        }}
                        className="w-4 h-4 rounded accent-primary"
                      />
                    </label>
                    <label className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex-1">
                        <span className="text-xs font-medium block">Send Emails</span>
                        <span className="text-xs text-muted">Send via SMTP</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={imapForm.enableSend}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, enableSend: e.target.checked }));
                        }}
                        className="w-4 h-4 rounded accent-primary"
                      />
                    </label>
                  </div>

                  {imapError && <p className="text-xs text-red-400">{imapError}</p>}

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={
                        !imapForm.displayName ||
                        !imapForm.imapHost ||
                        !imapForm.username ||
                        !imapForm.password ||
                        imapCreateMut.isPending
                      }
                      className="btn btn-ghost text-xs px-3 py-1.5"
                    >
                      {imapCreateMut.isPending ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Connecting...
                        </span>
                      ) : (
                        'Connect'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowImapForm(false);
                      }}
                      className="btn btn-ghost text-xs px-3 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted/30 text-foreground">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-sm">Email (IMAP/SMTP)</h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${availablePlatforms.has('email') ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground'}`}
                      >
                        {availablePlatforms.has('email') ? 'Available' : 'Coming Soon'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Connect any IMAP/SMTP provider: ProtonMail Bridge, Outlook, Yahoo, Fastmail
                    </p>
                    {availablePlatforms.has('email') && (
                      <button
                        onClick={() => {
                          setShowImapForm(true);
                        }}
                        className="btn btn-ghost text-xs px-3 py-1.5 mt-3"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const OAUTH_PROVIDER_META: Record<
  string,
  { name: string; icon: ReactNode; description: string; oauthUrl: string }
> = {
  google: {
    name: 'Google',
    description: 'Sign in with your Google account',
    icon: (
      // Monochrome "G" — uses currentColor so it matches the theme and GitHub icon style
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
    oauthUrl: '/api/v1/auth/oauth/google',
  },
  github: {
    name: 'GitHub',
    description: 'Sign in with your GitHub account',
    icon: <GitBranchIcon className="w-5 h-5" />,
    oauthUrl: '/api/v1/auth/oauth/github',
  },
  gmail: {
    name: 'Gmail',
    description: 'Connected Gmail account (managed via Email tab)',
    icon: <Mail className="w-5 h-5" />,
    oauthUrl: '/api/v1/auth/oauth/gmail',
  },
  googlecalendar: {
    name: 'Google Calendar',
    description: 'Connected Google Calendar account',
    icon: <Calendar className="w-5 h-5" />,
    oauthUrl: '/api/v1/auth/oauth/googlecalendar',
  },
  googledrive: {
    name: 'Google Drive',
    description: 'Connected Google Drive account',
    icon: <FolderOpen className="w-5 h-5" />,
    oauthUrl: '/api/v1/auth/oauth/googledrive',
  },
};

const AVAILABLE_OAUTH_PROVIDERS = ['google', 'github'];

/** Known OAuth provider env var names for credential setup */
const OAUTH_CREDENTIAL_KEYS: Record<
  string,
  { clientIdKey: string; clientSecretKey: string; label: string; note?: string }
> = {
  google: {
    clientIdKey: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretKey: 'GOOGLE_OAUTH_CLIENT_SECRET',
    label: 'Google',
    note: 'Also used by Gmail, Google Calendar, and Google Drive integrations.',
  },
  github: {
    clientIdKey: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecretKey: 'GITHUB_OAUTH_CLIENT_SECRET',
    label: 'GitHub',
  },
};

function OAuthCredentialSetup({
  configuredIds,
  onReload,
}: {
  configuredIds: Set<string>;
  onReload: () => void;
}) {
  const [forms, setForms] = useState<Record<string, { clientId: string; clientSecret: string }>>(
    {}
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const unconfigured = Object.entries(OAUTH_CREDENTIAL_KEYS).filter(
    ([id]) => !configuredIds.has(id)
  );

  if (unconfigured.length === 0) return null;

  const handleSave = async (providerId: string) => {
    const creds = OAUTH_CREDENTIAL_KEYS[providerId];
    const form = forms[providerId];
    if (!creds || !form?.clientId.trim() || !form?.clientSecret.trim()) return;

    setSaving(providerId);
    setError(null);
    try {
      await setSecret(creds.clientIdKey, form.clientId.trim());
      await setSecret(creds.clientSecretKey, form.clientSecret.trim());
      await reloadOAuthConfig();
      setSaved(providerId);
      setForms((prev) => ({ ...prev, [providerId]: { clientId: '', clientSecret: '' } }));
      onReload();
      setTimeout(() => {
        setSaved(null);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">OAuth Provider Setup</h3>
      <p className="text-xs text-muted-foreground">
        Enter OAuth client credentials for providers not yet configured. Credentials are stored
        securely in Security &gt; Secrets.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {unconfigured.map(([id, creds]) => {
          const form = forms[id] ?? { clientId: '', clientSecret: '' };
          const meta = OAUTH_PROVIDER_META[id];
          return (
            <div key={id} className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                {meta && <div className="p-1.5 rounded-lg bg-muted/30">{meta.icon}</div>}
                <h4 className="font-medium text-sm">{creds.label}</h4>
                {saved === id && (
                  <span className="text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>
              {creds.note && <p className="text-xs text-muted-foreground">{creds.note}</p>}
              <input
                type="text"
                placeholder="Client ID"
                value={form.clientId}
                onChange={(e) => {
                  setForms((prev) => ({
                    ...prev,
                    [id]: { ...form, clientId: e.target.value },
                  }));
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="password"
                placeholder="Client Secret"
                value={form.clientSecret}
                onChange={(e) => {
                  setForms((prev) => ({
                    ...prev,
                    [id]: { ...form, clientSecret: e.target.value },
                  }));
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => void handleSave(id)}
                disabled={!form.clientId.trim() || !form.clientSecret.trim() || saving === id}
                className="btn btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
              >
                {saving === id ? 'Saving…' : 'Save Credentials'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OAuthTab({
  integrations: _integrations,
  onDelete: _onDelete,
  isDeleting: _isDeleting,
}: {
  integrations: IntegrationInfo[];
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [successBanner, setSuccessBanner] = useState<{
    provider: string;
    email: string;
    name: string;
  } | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<OAuthConnectedToken | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const connected = params.get('connected') === 'true';
    const provider = params.get('provider') || '';
    if (connected && (provider === 'google' || provider === 'github')) {
      setSuccessBanner({
        provider,
        email: params.get('email') || '',
        name: params.get('name') || '',
      });
      window.history.replaceState({}, '', '/connections/oauth');
      void queryClient.invalidateQueries({ queryKey: ['oauth-tokens'] });
    }
  }, [location.search, queryClient]);

  const { data: oauthConfig } = useQuery({
    queryKey: ['oauth-config'],
    queryFn: fetchOAuthConfig,
  });

  const { data: tokens = [], isLoading: tokensLoading } = useQuery({
    queryKey: ['oauth-tokens'],
    queryFn: fetchOAuthTokens,
  });

  const revokeMut = useMutation({
    mutationFn: revokeOAuthToken,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['oauth-tokens'] });
      setDisconnectTarget(null);
    },
  });

  const refreshMut = useMutation({
    mutationFn: refreshOAuthToken,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['oauth-tokens'] });
    },
  });

  // Only show providers that are actually configured on the server
  const configuredIds = new Set((oauthConfig?.providers ?? []).map((p) => p.id));
  const availableProviders = AVAILABLE_OAUTH_PROVIDERS.filter((id) => configuredIds.has(id));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Connect your accounts with OAuth providers. Multiple accounts per provider are supported —
        connect as many Google or GitHub accounts as you need.
      </p>

      {successBanner && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <div className="text-sm">
            <span className="font-medium capitalize">{successBanner.provider}</span> account
            connected
            {successBanner.email && (
              <span>
                {' '}
                as <span className="font-medium">{successBanner.email}</span>
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setSuccessBanner(null);
            }}
            className="ml-auto text-xs opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {tokensLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading connected accounts…
        </div>
      )}

      <OAuthCredentialSetup
        configuredIds={configuredIds}
        onReload={() => {
          void queryClient.invalidateQueries({ queryKey: ['oauth-config'] });
        }}
      />

      {availableProviders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            {tokens.length > 0 ? 'Add Another Account' : 'Connect an Account'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {availableProviders.map((providerId) => {
              const meta = OAUTH_PROVIDER_META[providerId];
              if (!meta) return null;
              return (
                <div key={providerId} className="card p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted/30">{meta.icon}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm">{meta.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
                      <button
                        onClick={() => {
                          window.location.href = meta.oauthUrl;
                        }}
                        className="btn btn-ghost text-xs px-3 py-1.5 mt-2"
                      >
                        Connect
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tokens.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Connected Accounts</h3>
          <div className="space-y-3">
            {tokens.map((token) => {
              const meta = OAUTH_PROVIDER_META[token.provider];
              return (
                <div key={token.id} className="card p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-muted/40 shrink-0">
                      {meta?.icon ?? <Globe className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{meta?.name ?? token.provider}</span>
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Connected
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80 mt-0.5 truncate">{token.email}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Since {new Date(token.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          refreshMut.mutate(token.id);
                        }}
                        disabled={refreshMut.isPending}
                        className="btn btn-ghost text-xs"
                        title="Force-refresh this token"
                      >
                        {refreshMut.isPending ? 'Refreshing…' : 'Refresh Token'}
                      </button>
                      <button
                        onClick={() => {
                          setDisconnectTarget(token);
                        }}
                        disabled={revokeMut.isPending}
                        className="btn btn-ghost text-xs text-destructive hover:bg-destructive/10"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {disconnectTarget && (
        <ConfirmDialog
          open={true}
          title={`Disconnect ${OAUTH_PROVIDER_META[disconnectTarget.provider]?.name ?? disconnectTarget.provider}?`}
          message={`This will remove the connection for ${disconnectTarget.email}. You can reconnect at any time.`}
          confirmLabel="Disconnect"
          destructive
          onConfirm={() => {
            revokeMut.mutate(disconnectTarget.id);
          }}
          onCancel={() => {
            setDisconnectTarget(null);
          }}
        />
      )}
    </div>
  );
}
