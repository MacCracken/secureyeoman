/* eslint-disable react-refresh/only-export-components */
import { type ReactNode } from 'react';

export const LOCAL_MCP_NAME = 'YEOMAN MCP';
import {
  Terminal,
  Globe,
  Wrench,
  GitBranch,
  CreditCard,
  Zap,
  Building2,
  FolderOpen,
  MessageCircle,
  MessageSquare,
  Mail,
  Radio,
  CheckCircle,
  XCircle,
  AlertCircle,
  GitBranch as GitBranchIcon,
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
} from 'lucide-react';
import type { IntegrationInfo } from '../../types';

export interface PlatformMeta {
  name: string;
  description: string;
  icon: React.ReactNode;
  fields: FormFieldDef[];
  setupSteps?: string[];
  oauthUrl?: string;
}

export interface FormFieldDef {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder: string;
  helpText?: string;
}

export const BASE_FIELDS: FormFieldDef[] = [
  { key: 'displayName', label: 'Display Name', type: 'text', placeholder: 'Display Name' },
];

export const TOKEN_FIELD: FormFieldDef = {
  key: 'botToken',
  label: 'Bot Token',
  type: 'password',
  placeholder: 'Bot Token',
};

export const PLATFORM_META: Record<string, PlatformMeta> = {
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

export type TabType = 'integrations' | 'mcp' | 'routing' | 'federation';
export type IntegrationSubTab = 'messaging' | 'email' | 'productivity' | 'devops' | 'oauth';

// Platform categorization for tab filtering
export const DEVOPS_PLATFORMS = new Set([
  'github',
  'gitlab',
  'jira',
  'aws',
  'azure',
  'figma',
  'zapier',
]);
export const EMAIL_PLATFORMS = new Set(['gmail', 'email']);
export const PRODUCTIVITY_PLATFORMS = new Set([
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

export const STATUS_CONFIG: Record<
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

export function formatRelativeTime(dateString: string): string {
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

export type TransportType = 'stdio' | 'sse' | 'streamable-http';

export interface AddServerForm {
  name: string;
  description: string;
  transport: TransportType;
  command: string;
  args: string;
  url: string;
  env: { key: string; value: string }[];
}

export const EMPTY_FORM: AddServerForm = {
  name: '',
  description: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  env: [],
};

export const OAUTH_PROVIDER_META: Record<
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

export const AVAILABLE_OAUTH_PROVIDERS = ['google', 'github'];

/** Known OAuth provider env var names for credential setup */
export const OAUTH_CREDENTIAL_KEYS: Record<
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
