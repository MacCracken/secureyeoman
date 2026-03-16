/**
 * Security Settings Page
 *
 * Policy toggles dashboard for security-related feature flags.
 * RBAC, service keys, and model management are in dedicated files under ./security/.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  Lock,
  CheckCircle,
  XCircle,
  Loader2,
  Users,
  Network,
  Layers,
  Puzzle,
  Terminal,
  Blocks,
  Sparkles,
  Image,
  FlaskConical,
  Code2,
  BookOpen,
  Wrench,
  Brain,
  Cpu,
  GitMerge,
  GitBranch,
  Monitor,
  Camera,
  Globe,
  Target,
  Code,
  LayoutPanelLeft,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { fetchSecurityPolicy, fetchAgentConfig, fetchMcpServers } from '../api/client';
import { useSecurityPolicyMutations } from './security/hooks';
import { ModelManagement } from './security/ModelManagement';

// Re-export extracted components so existing consumers keep working
export { RolesSettings, UserRoleAssignments } from './security/RbacManager';
export { ServiceKeysPanel, SecretsPanel } from './security/ServiceKeysPanel';

// ── Policy Toggle ───────────────────────────────────────────────────

function PolicyToggle({
  label,
  icon,
  enabled,
  isPending,
  onToggle,
  description,
}: {
  label: string;
  icon?: React.ReactNode;
  enabled: boolean;
  isPending: boolean;
  onToggle: () => void;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          {icon && <span className="text-sm font-medium">{label}</span>}
          {enabled ? (
            <>
              <CheckCircle className="w-5 h-5 text-success" />
              <span className="font-medium text-success">Allowed</span>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="font-medium text-destructive">Disabled</span>
            </>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Toggle ${label}`}
          disabled={isPending}
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
            enabled ? 'bg-primary' : 'bg-muted'
          } ${isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {isPending ? (
            <Loader2 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-white" />
          ) : (
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          )}
        </button>
      </div>
      <p className="text-sm text-muted-foreground mt-2">{description}</p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function SecuritySettings() {
  const navigate = useNavigate();

  // ── Collapse states ───────────────────────────────────────────────
  const [promptSecurityOpen, setPromptSecurityOpen] = useState(false);
  const [contentGuardrailsOpen, setContentGuardrailsOpen] = useState(false);

  // ── Queries ─────────────────────────────────────────────────────
  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
  });

  const { data: agentConfigData } = useQuery({
    queryKey: ['agentConfig'],
    queryFn: fetchAgentConfig,
  });

  const { data: mcpData } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: fetchMcpServers,
  });

  // ── Mutations ───────────────────────────────────────────────────
  const { policyMutation, agentConfigMutation } = useSecurityPolicyMutations();

  // ── Derived state ─────────────────────────────────────────────────
  const subAgentsAllowed = securityPolicy?.allowSubAgents ?? false;
  const delegationEnabled = (agentConfigData?.config?.enabled as boolean | undefined) ?? false;
  const a2aAllowed = securityPolicy?.allowA2A ?? false;
  const swarmsAllowed = securityPolicy?.allowSwarms ?? false;
  const extensionsAllowed = securityPolicy?.allowExtensions ?? false;
  const executionAllowed = securityPolicy?.allowExecution ?? true;
  const proactiveAllowed = securityPolicy?.allowProactive ?? false;
  const workflowsAllowed = securityPolicy?.allowWorkflows ?? false;
  const communityGitFetchAllowed = securityPolicy?.allowCommunityGitFetch ?? false;
  const multimodalAllowed = securityPolicy?.allowMultimodal ?? false;
  const desktopControlAllowed = securityPolicy?.allowDesktopControl ?? false;
  const cameraAllowed = securityPolicy?.allowCamera ?? false;
  const networkToolsAllowed = securityPolicy?.allowNetworkTools ?? false;
  const twingateAllowed = securityPolicy?.allowTwingate ?? false;
  const experimentsAllowed = securityPolicy?.allowExperiments ?? false;
  const storybookAllowed = securityPolicy?.allowStorybook ?? false;
  const orgIntentAllowed = securityPolicy?.allowOrgIntent ?? false;
  const intentAllowed = securityPolicy?.allowIntent ?? false;
  const intentEditorAllowed = securityPolicy?.allowIntentEditor ?? false;
  const knowledgeBaseAllowed = securityPolicy?.allowKnowledgeBase ?? false;
  const codeEditorAllowed = securityPolicy?.allowCodeEditor ?? false;
  const advancedEditorAllowed = securityPolicy?.allowAdvancedEditor ?? false;
  const dtcAllowed = securityPolicy?.allowDynamicTools ?? false;
  const sandboxDtcAllowed = securityPolicy?.sandboxDynamicTools ?? true;
  const anomalyDetectionAllowed = securityPolicy?.allowAnomalyDetection ?? false;
  const promptGuardMode = securityPolicy?.promptGuardMode ?? 'block';
  const responseGuardMode = securityPolicy?.responseGuardMode ?? 'block';
  const jailbreakThreshold = securityPolicy?.jailbreakThreshold ?? 0.5;
  const jailbreakAction = securityPolicy?.jailbreakAction ?? 'block';
  const strictSystemPromptConf = securityPolicy?.strictSystemPromptConfidentiality ?? false;
  const abuseDetectionEnabled = securityPolicy?.abuseDetectionEnabled ?? true;
  const cgEnabled = securityPolicy?.contentGuardrailsEnabled ?? true;
  const cgPiiMode = securityPolicy?.contentGuardrailsPiiMode ?? 'redact';
  const cgToxicityEnabled = securityPolicy?.contentGuardrailsToxicityEnabled ?? true;
  const cgToxicityMode = securityPolicy?.contentGuardrailsToxicityMode ?? 'block';
  const cgToxicityUrl = securityPolicy?.contentGuardrailsToxicityClassifierUrl ?? '';
  const cgToxicityThreshold = securityPolicy?.contentGuardrailsToxicityThreshold ?? 0.7;
  const cgBlockList = securityPolicy?.contentGuardrailsBlockList ?? [];
  const cgBlockedTopics = securityPolicy?.contentGuardrailsBlockedTopics ?? [];
  const cgGroundingEnabled = securityPolicy?.contentGuardrailsGroundingEnabled ?? true;
  const cgGroundingMode = securityPolicy?.contentGuardrailsGroundingMode ?? 'block';
  const gvisorAllowed = securityPolicy?.sandboxGvisor ?? false;
  const wasmAllowed = securityPolicy?.sandboxWasm ?? false;
  const credentialProxyAllowed = securityPolicy?.sandboxCredentialProxy ?? false;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Security</h2>

      {/* AI Model Default */}
      <ModelManagement />

      {/* MCP Servers */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Blocks className="w-4 h-4" />
            MCP Servers
          </h3>
          <button
            className="text-xs text-primary hover:text-primary/80"
            onClick={() => void navigate('/connections?tab=mcp')}
          >
            Manage
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground block">Configured</span>
            <span>{(mcpData as unknown as { total?: number })?.total ?? 0} servers</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Enabled</span>
            <span>
              {(mcpData as unknown as { servers?: { enabled: boolean }[] })?.servers?.filter(
                (s) => s.enabled
              ).length ?? 0}{' '}
              servers
            </span>
          </div>
        </div>
      </div>

      {/* ML Security */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h3 className="font-medium">ML Security</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Anomaly Detection"
            icon={<Brain className="w-4 h-4 text-muted-foreground" />}
            enabled={anomalyDetectionAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowAnomalyDetection: !anomalyDetectionAllowed });
            }}
            description="Use machine learning to detect unusual patterns in agent behavior, API calls, and security events. Disabled by default."
          />
        </div>
      </div>

      {/* Prompt Security */}
      <div className="card">
        <button
          type="button"
          onClick={() => {
            setPromptSecurityOpen(!promptSecurityOpen);
          }}
          className="w-full p-4 border-b flex items-center gap-2 text-left"
        >
          {promptSecurityOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Prompt Security</h3>
        </button>
        {promptSecurityOpen && (
          <div className="p-4 space-y-5">
            {/* Prompt Guard mode */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Prompt Guard Mode</label>
              <p className="text-xs text-muted-foreground mb-2">
                Scans assembled prompts before the LLM call for indirect injection attempts.
              </p>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={promptGuardMode}
                onChange={(e) => {
                  policyMutation.mutate({
                    promptGuardMode: e.target.value as 'block' | 'warn' | 'disabled',
                  });
                }}
                disabled={policyMutation.isPending}
              >
                <option value="block">Block — reject request on high-severity finding</option>
                <option value="warn">Warn — log and allow (default)</option>
                <option value="disabled">Disabled — skip scanning</option>
              </select>
            </div>

            {/* Response Guard mode */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Response Guard Mode</label>
              <p className="text-xs text-muted-foreground mb-2">
                Scans LLM responses for output-side injection, role confusion, and exfiltration
                patterns.
              </p>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={responseGuardMode}
                onChange={(e) => {
                  policyMutation.mutate({
                    responseGuardMode: e.target.value as 'block' | 'warn' | 'disabled',
                  });
                }}
                disabled={policyMutation.isPending}
              >
                <option value="block">Block — reject response on high-severity finding</option>
                <option value="warn">Warn — log and allow (default)</option>
                <option value="disabled">Disabled — skip scanning</option>
              </select>
            </div>

            {/* Jailbreak threshold */}
            <div className="space-y-1">
              <label className="text-sm font-medium flex items-center justify-between">
                <span>Jailbreak Score Threshold</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {jailbreakThreshold.toFixed(2)}
                </span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Weighted injection risk score [0–1] that triggers the jailbreak action. Lower = more
                sensitive.
              </p>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={jailbreakThreshold}
                onChange={(e) => {
                  policyMutation.mutate({ jailbreakThreshold: parseFloat(e.target.value) });
                }}
                disabled={policyMutation.isPending}
                className="w-full accent-primary"
              />
            </div>

            {/* Jailbreak action */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Jailbreak Threshold Action</label>
              <p className="text-xs text-muted-foreground mb-2">
                Action taken when a message's injection score meets the threshold above.
              </p>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={jailbreakAction}
                onChange={(e) => {
                  policyMutation.mutate({
                    jailbreakAction: e.target.value as 'block' | 'warn' | 'audit_only',
                  });
                }}
                disabled={policyMutation.isPending}
              >
                <option value="block">Block — reject request (400)</option>
                <option value="warn">Warn — audit log + allow (default)</option>
                <option value="audit_only">Audit Only — record score, no warning</option>
              </select>
            </div>

            {/* System prompt confidentiality */}
            <PolicyToggle
              label="System Prompt Confidentiality"
              icon={<Lock className="w-4 h-4 text-muted-foreground" />}
              enabled={strictSystemPromptConf}
              isPending={policyMutation.isPending}
              onToggle={() => {
                policyMutation.mutate({
                  strictSystemPromptConfidentiality: !strictSystemPromptConf,
                });
              }}
              description="Scan AI responses for n-gram overlap with system prompt contents. Detected leaks are redacted and audit-logged. Can be overridden per personality."
            />

            {/* Abuse detection */}
            <PolicyToggle
              label="Rate-Aware Abuse Detection"
              icon={<Shield className="w-4 h-4 text-muted-foreground" />}
              enabled={abuseDetectionEnabled}
              isPending={policyMutation.isPending}
              onToggle={() => {
                policyMutation.mutate({ abuseDetectionEnabled: !abuseDetectionEnabled });
              }}
              description="Track blocked-message retries, topic pivoting, and tool-call anomalies per session. Triggered sessions enter a cool-down period and emit suspicious_pattern audit events."
            />
          </div>
        )}
      </div>

      {/* Content Guardrails (Phase 95) */}
      <div className="card">
        <button
          type="button"
          onClick={() => {
            setContentGuardrailsOpen(!contentGuardrailsOpen);
          }}
          className="w-full p-4 border-b flex items-center gap-2 text-left"
        >
          {contentGuardrailsOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Content Guardrails</h3>
        </button>
        {contentGuardrailsOpen && (
          <div className="p-4 space-y-5">
            <PolicyToggle
              label="Enable Content Guardrails"
              enabled={cgEnabled}
              isPending={policyMutation.isPending}
              onToggle={() => {
                policyMutation.mutate({ contentGuardrailsEnabled: !cgEnabled });
              }}
              description="Enforce output-side content policies: PII redaction, topic restrictions, toxicity filtering, custom block lists, and citation grounding."
            />

            {cgEnabled && (
              <>
                {/* PII mode */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">PII Detection Mode</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Detect or redact personally identifiable information (emails, phone numbers,
                    SSNs, credit cards, IPs).
                  </p>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={cgPiiMode}
                    onChange={(e) => {
                      policyMutation.mutate({
                        contentGuardrailsPiiMode: e.target.value as
                          | 'disabled'
                          | 'detect_only'
                          | 'redact',
                      });
                    }}
                    disabled={policyMutation.isPending}
                  >
                    <option value="disabled">Disabled</option>
                    <option value="detect_only">Detect Only — log but do not modify</option>
                    <option value="redact">Redact — replace with placeholders</option>
                  </select>
                </div>

                {/* Toxicity */}
                <div className="space-y-3">
                  <PolicyToggle
                    label="Toxicity Filtering"
                    enabled={cgToxicityEnabled}
                    isPending={policyMutation.isPending}
                    onToggle={() => {
                      policyMutation.mutate({
                        contentGuardrailsToxicityEnabled: !cgToxicityEnabled,
                      });
                    }}
                    description="Use an external classifier to detect toxic or harmful content in responses."
                  />
                  {cgToxicityEnabled && (
                    <div className="pl-4 space-y-3">
                      <div className="space-y-1">
                        <label className="text-sm font-medium">Toxicity Mode</label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={cgToxicityMode}
                          onChange={(e) => {
                            policyMutation.mutate({
                              contentGuardrailsToxicityMode: e.target.value as
                                | 'block'
                                | 'warn'
                                | 'audit_only',
                            });
                          }}
                          disabled={policyMutation.isPending}
                        >
                          <option value="block">Block — reject toxic responses</option>
                          <option value="warn">Warn — log and allow</option>
                          <option value="audit_only">Audit Only — silent logging</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium">Classifier URL</label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="https://toxicity-classifier.example.com/classify"
                          value={cgToxicityUrl}
                          onChange={(e) => {
                            policyMutation.mutate({
                              contentGuardrailsToxicityClassifierUrl: e.target.value,
                            });
                          }}
                          disabled={policyMutation.isPending}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium">
                          Threshold: {cgToxicityThreshold.toFixed(2)}
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          className="w-full"
                          value={cgToxicityThreshold}
                          onChange={(e) => {
                            policyMutation.mutate({
                              contentGuardrailsToxicityThreshold: parseFloat(e.target.value),
                            });
                          }}
                          disabled={policyMutation.isPending}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Block list */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Block List</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    One entry per line. Prefix with <code>regex:</code> for regex patterns.
                  </p>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    rows={4}
                    value={cgBlockList.join('\n')}
                    onChange={(e) => {
                      policyMutation.mutate({
                        contentGuardrailsBlockList: e.target.value.split('\n').filter(Boolean),
                      });
                    }}
                    disabled={policyMutation.isPending}
                  />
                </div>

                {/* Blocked topics */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Blocked Topics</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    One topic per line. Responses touching these topics will be blocked.
                  </p>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    rows={3}
                    value={cgBlockedTopics.join('\n')}
                    onChange={(e) => {
                      policyMutation.mutate({
                        contentGuardrailsBlockedTopics: e.target.value.split('\n').filter(Boolean),
                      });
                    }}
                    disabled={policyMutation.isPending}
                  />
                </div>

                {/* Grounding */}
                <div className="space-y-3">
                  <PolicyToggle
                    label="Grounding Verification"
                    enabled={cgGroundingEnabled}
                    isPending={policyMutation.isPending}
                    onToggle={() => {
                      policyMutation.mutate({
                        contentGuardrailsGroundingEnabled: !cgGroundingEnabled,
                      });
                    }}
                    description="Verify cited claims against the knowledge base. Unverified citations are flagged or blocked."
                  />
                  {cgGroundingEnabled && (
                    <div className="pl-4 space-y-1">
                      <label className="text-sm font-medium">Grounding Mode</label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={cgGroundingMode}
                        onChange={(e) => {
                          policyMutation.mutate({
                            contentGuardrailsGroundingMode: e.target.value as 'flag' | 'block',
                          });
                        }}
                        disabled={policyMutation.isPending}
                      >
                        <option value="flag">
                          Flag — tag unverified citations with [unverified]
                        </option>
                        <option value="block">
                          Block — reject responses with unverified citations
                        </option>
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Proactive Assistance Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Proactive Assistance</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Proactive Assistance"
            enabled={proactiveAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowProactive: !proactiveAllowed });
            }}
            description={
              proactiveAllowed
                ? 'Proactive assistance is enabled. Personalities can autonomously suggest actions, reminders, and follow-ups based on their configuration.'
                : 'Proactive assistance is disabled at the security level. No personality can initiate proactive actions regardless of its configuration.'
            }
          />
        </div>
      </div>

      {/* Organization */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Organization</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Organization"
            icon={<Target className="w-4 h-4 text-muted-foreground" />}
            enabled={orgIntentAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowOrgIntent: !orgIntentAllowed });
            }}
            description={
              orgIntentAllowed
                ? 'Organization is enabled. The Organization sidebar entry is visible with access to intent, risk, workspaces, and users.'
                : 'Organization is disabled. Enable to access organizational intent, departmental risk, workspaces, and user management.'
            }
          />
          {orgIntentAllowed && (
            <>
              <div className="border-t border-border pt-4">
                <PolicyToggle
                  label="Knowledge Base"
                  icon={<BookOpen className="w-4 h-4 text-muted-foreground" />}
                  enabled={knowledgeBaseAllowed}
                  isPending={policyMutation.isPending}
                  onToggle={() => {
                    policyMutation.mutate({ allowKnowledgeBase: !knowledgeBaseAllowed });
                  }}
                  description={
                    knowledgeBaseAllowed
                      ? 'Knowledge Base access is enabled for personalities. Personalities can query and retrieve organization knowledge base content during conversations.'
                      : 'Knowledge Base access is disabled for personalities. Enable to allow personalities to query and retrieve organization knowledge base content.'
                  }
                />
              </div>
              <div className="border-t border-border pt-4">
                <PolicyToggle
                  label="Intent"
                  icon={<Target className="w-4 h-4 text-muted-foreground" />}
                  enabled={intentAllowed}
                  isPending={policyMutation.isPending}
                  onToggle={() => {
                    policyMutation.mutate({ allowIntent: !intentAllowed });
                  }}
                  description={
                    intentAllowed
                      ? 'Intent tab is visible under Organization. Users can view and manage organizational intent documents.'
                      : 'Intent tab is hidden. Enable to show the Intent tab under Organization.'
                  }
                />
              </div>
              {intentAllowed && (
                <div className="border-t border-border pt-4">
                  <PolicyToggle
                    label="Intent Document Editor"
                    icon={<Target className="w-4 h-4 text-muted-foreground" />}
                    enabled={intentEditorAllowed}
                    isPending={policyMutation.isPending}
                    onToggle={() => {
                      policyMutation.mutate({ allowIntentEditor: !intentEditorAllowed });
                    }}
                    description={
                      intentEditorAllowed
                        ? 'Full field-level intent editor is enabled. Edit organizational intent documents directly from the Organization → Intent tab. Developer mode — not ready for production use.'
                        : 'Intent editor is disabled. Enable to access the structured editor for goals, signals, boundaries, policies, and delegation framework.'
                    }
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Workflow Orchestration Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <GitMerge className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Workflow Orchestration</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Workflow Orchestration"
            enabled={workflowsAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowWorkflows: !workflowsAllowed });
            }}
            description={
              workflowsAllowed
                ? 'Workflow orchestration is enabled. Users can build and run DAG-based automation workflows from the Workflows page.'
                : 'Workflow orchestration is disabled at the security level. The Workflows page is hidden and no workflow runs can be triggered.'
            }
          />
        </div>
      </div>

      {/* Multimodal I/O Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Image className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Multimodal I/O</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Multimodal I/O"
            enabled={multimodalAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowMultimodal: !multimodalAllowed });
            }}
            description={
              multimodalAllowed
                ? 'Multimodal I/O is enabled. Vision analysis, speech-to-text, text-to-speech, and image generation capabilities are available.'
                : 'Multimodal I/O is disabled at the security level. No vision, audio, or image generation capabilities are active.'
            }
          />
        </div>
      </div>

      {/* Desktop Control Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Monitor className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Desktop Control</h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-lg p-2.5 text-xs text-yellow-600 dark:text-yellow-400">
            ⚠️ Desktop Control grants agents the ability to capture your screen and control your
            keyboard and mouse. Only enable on trusted, dedicated machines.
          </div>
          <PolicyToggle
            label="Desktop Control"
            enabled={desktopControlAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowDesktopControl: !desktopControlAllowed });
            }}
            description={
              desktopControlAllowed
                ? 'Desktop Control is enabled. Personalities with vision or limb_movement capabilities can capture screens and control input devices.'
                : 'Desktop Control is disabled. No personality can capture screens or control input devices regardless of their capabilities configuration.'
            }
          />

          {/* Camera — sub-item, only visible when Desktop Control enabled */}
          {desktopControlAllowed && (
            <div className="ml-6 pl-4 border-l-2 border-border">
              <PolicyToggle
                label="Camera Capture"
                icon={<Camera className="w-4 h-4 text-muted-foreground" />}
                enabled={cameraAllowed}
                isPending={policyMutation.isPending}
                onToggle={() => {
                  policyMutation.mutate({ allowCamera: !cameraAllowed });
                }}
                description={
                  cameraAllowed
                    ? 'Camera capture is enabled. The desktop_camera_capture tool can access the system camera via ffmpeg.'
                    : 'Camera capture is disabled. The desktop_camera_capture tool will return a capability_disabled error.'
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Network Tools Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Network Tools</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Allow Network Tools"
            enabled={networkToolsAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowNetworkTools: !networkToolsAllowed });
            }}
            description={
              networkToolsAllowed
                ? 'Network access is enabled. Individual tool categories (SSH, NetBox, NVD, etc.) can be activated per MCP server in Connections.'
                : 'Network access is denied globally — MCP network tools and any other network-based access will be blocked regardless of tool configuration.'
            }
          />
        </div>
      </div>

      {/* Twingate Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Twingate</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Allow Twingate"
            enabled={twingateAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowTwingate: !twingateAllowed });
            }}
            description={
              twingateAllowed
                ? 'Twingate zero-trust access is enabled. Agents can reach private MCP servers and resources via Twingate tunnels.'
                : 'Twingate access is denied globally — zero-trust tunnels and private MCP proxy are blocked regardless of connection configuration.'
            }
          />
        </div>
      </div>

      {/* Sub-Agent Delegation Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Sub-Agent Delegation</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Sub-Agent Delegation"
            enabled={subAgentsAllowed}
            isPending={policyMutation.isPending || agentConfigMutation.isPending}
            onToggle={() => {
              const enabling = !subAgentsAllowed;
              policyMutation.mutate({ allowSubAgents: enabling });
              // Sync delegation config with the policy toggle
              agentConfigMutation.mutate({ enabled: enabling });
            }}
            description={
              subAgentsAllowed
                ? 'Sub-agent delegation is active. Personalities with the Sub-Agent Delegation toggle enabled in their Orchestration config can delegate tasks.'
                : 'Sub-agent delegation is disabled at the security level. No personality can spawn sub-agents regardless of its creation config.'
            }
          />

          {/* Status badge — shown when delegation is enabled */}
          {subAgentsAllowed && (
            <div className="flex items-center gap-2 text-xs text-success bg-success/5 border border-success/20 rounded px-3 py-2">
              <span>✓</span>
              <span>
                Delegation is active — personalities with Sub-Agent Delegation enabled can use{' '}
                <code>delegate_task</code>.
              </span>
            </div>
          )}

          {/* A2A Networks and Swarms — sub-items of delegation, only visible when sub-agents enabled */}
          {subAgentsAllowed && (
            <div className="ml-6 pl-4 border-l-2 border-border space-y-4">
              <PolicyToggle
                label="A2A Networks"
                icon={<Network className="w-4 h-4 text-muted-foreground" />}
                enabled={a2aAllowed}
                isPending={policyMutation.isPending}
                onToggle={() => {
                  policyMutation.mutate({ allowA2A: !a2aAllowed });
                }}
                description={
                  a2aAllowed
                    ? 'Agent-to-Agent networking is enabled. Internal A2A communication is active; external peers require Sub-Agent Delegation to be allowed.'
                    : 'A2A networking is disabled. No peer discovery, delegation, or agent-to-agent communication will occur.'
                }
              />
              <PolicyToggle
                label="Agent Swarms"
                icon={<Layers className="w-4 h-4 text-muted-foreground" />}
                enabled={swarmsAllowed}
                isPending={policyMutation.isPending}
                onToggle={() => {
                  policyMutation.mutate({ allowSwarms: !swarmsAllowed });
                }}
                description={
                  swarmsAllowed
                    ? 'Agent swarms are enabled. Personalities can orchestrate multi-agent swarm runs. The Swarms tab is visible in Sub-Agents.'
                    : 'Agent swarms are disabled. No swarm orchestration can occur and the Swarms tab is hidden from Sub-Agents.'
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Tool Creation Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Dynamic Tool Creation</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Dynamic Tool Creation"
            enabled={dtcAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowDynamicTools: !dtcAllowed });
            }}
            description="Allow agents to generate and register new tools at runtime. Disabled by default."
          />
          {dtcAllowed && (
            <div className="ml-6 pl-4 border-l-2 border-border space-y-4">
              <PolicyToggle
                label="Sandboxed Execution"
                icon={<Shield className="w-4 h-4 text-muted-foreground" />}
                enabled={sandboxDtcAllowed}
                isPending={policyMutation.isPending}
                onToggle={() => {
                  policyMutation.mutate({ sandboxDynamicTools: !sandboxDtcAllowed });
                }}
                description="Run dynamically-created tools inside an isolated sandbox. Strongly recommended. Enabled by default."
              />
            </div>
          )}
        </div>
      </div>

      {/* Sandbox Isolation */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Cpu className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Sandbox Isolation</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Code Execution"
            icon={<Terminal className="w-4 h-4 text-muted-foreground" />}
            enabled={executionAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowExecution: !executionAllowed });
            }}
            description={
              executionAllowed
                ? 'Sandboxed code execution is enabled. Code runs in isolated environments with secrets filtering and approval policies.'
                : 'Sandboxed code execution is disabled. No code can be executed through the execution engine.'
            }
          />
          <PolicyToggle
            label="gVisor Isolation"
            icon={<Shield className="w-4 h-4 text-muted-foreground" />}
            enabled={gvisorAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ sandboxGvisor: !gvisorAllowed });
            }}
            description="Add a gVisor (runsc) kernel-level isolation layer to sandboxed execution. Requires gVisor installed on the host system."
          />
          <PolicyToggle
            label="WASM Isolation"
            icon={<Blocks className="w-4 h-4 text-muted-foreground" />}
            enabled={wasmAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ sandboxWasm: !wasmAllowed });
            }}
            description="Run code inside a WebAssembly sandbox for additional memory and capability isolation."
          />
          <PolicyToggle
            label="Outbound Credential Proxy"
            icon={<Network className="w-4 h-4 text-muted-foreground" />}
            enabled={credentialProxyAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ sandboxCredentialProxy: !credentialProxyAllowed });
            }}
            description="Inject Authorization headers for known hosts via a localhost proxy. Secrets never enter the sandbox environment."
          />
        </div>
      </div>

      {/* Developers */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Code2 className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Developers</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Lifecycle Extensions"
            icon={<Puzzle className="w-4 h-4 text-muted-foreground" />}
            enabled={extensionsAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowExtensions: !extensionsAllowed });
            }}
            description={
              extensionsAllowed
                ? 'Lifecycle extension hooks are enabled. Plugins can observe, transform, or veto events across the system.'
                : 'Lifecycle extension hooks are disabled. No plugins will be loaded or executed.'
            }
          />
          <div className="border-t border-border pt-4">
            <PolicyToggle
              label="Experiments"
              icon={<FlaskConical className="w-4 h-4 text-muted-foreground" />}
              enabled={experimentsAllowed}
              isPending={policyMutation.isPending}
              onToggle={() => {
                policyMutation.mutate({ allowExperiments: !experimentsAllowed });
              }}
              description={
                experimentsAllowed
                  ? 'A/B experiments are enabled. You can create, run, and manage experiments to test different configurations and behaviors.'
                  : 'A/B experiments are disabled. Enable this setting to access the Experiments page and create A/B tests. This must be explicitly enabled after initialization.'
              }
            />
          </div>
          <div className="border-t border-border pt-4">
            <PolicyToggle
              label="Storybook"
              icon={<BookOpen className="w-4 h-4 text-muted-foreground" />}
              enabled={storybookAllowed}
              isPending={policyMutation.isPending}
              onToggle={() => {
                policyMutation.mutate({ allowStorybook: !storybookAllowed });
              }}
              description={
                storybookAllowed
                  ? 'Storybook component development environment is enabled. Access the component gallery from the Developers section.'
                  : 'Storybook is disabled. Enable this setting to access the component development environment in the Developers section.'
              }
            />
          </div>
        </div>
      </div>

      {/* Editor Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Code className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Editor</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Code Editor"
            icon={<Code className="w-4 h-4 text-muted-foreground" />}
            enabled={codeEditorAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowCodeEditor: !codeEditorAllowed });
            }}
            description={
              codeEditorAllowed
                ? 'Code editor is enabled. The Editor entry appears in the sidebar.'
                : 'Code editor is hidden. No editor is accessible from the sidebar.'
            }
          />
          <div className="border-t border-border pt-4">
            <div className={!codeEditorAllowed ? 'opacity-40 pointer-events-none' : ''}>
              <PolicyToggle
                label="Advanced Editor Mode"
                icon={<LayoutPanelLeft className="w-4 h-4 text-muted-foreground" />}
                enabled={advancedEditorAllowed}
                isPending={policyMutation.isPending}
                onToggle={() => {
                  policyMutation.mutate({ allowAdvancedEditor: !advancedEditorAllowed });
                }}
                description={
                  advancedEditorAllowed
                    ? 'Advanced workspace enabled: three-panel layout with Monaco editor, file manager, task panel, and multi-terminal.'
                    : 'Standard editor mode. Enable to replace the editor with the advanced coding workspace.'
                }
              />
            </div>
            {!codeEditorAllowed && (
              <p className="text-xs text-muted-foreground mt-1">
                Requires Code Editor to be enabled.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Training Export Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Training Data Export</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Training Dataset Export"
            enabled={securityPolicy?.allowTrainingExport ?? false}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({
                allowTrainingExport: !(securityPolicy?.allowTrainingExport ?? false),
              });
            }}
            description={
              (securityPolicy?.allowTrainingExport ?? false)
                ? 'Training export is enabled. The Training tab is visible in Developers and conversations can be downloaded as ShareGPT / instruction / raw text datasets.'
                : 'Training export is disabled. Enable to allow exporting conversations as LLM fine-tuning datasets (ShareGPT JSONL, instruction JSONL, raw text).'
            }
          />
        </div>
      </div>

      {/* Community Skills Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Community Skills</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Community Skills"
            enabled={communityGitFetchAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowCommunityGitFetch: !communityGitFetchAllowed });
            }}
            description={
              communityGitFetchAllowed
                ? 'Community Skills are enabled. The Community tab is visible in Skills and users can browse and install skills from the community repository.'
                : 'Community Skills are disabled. The Community tab is hidden in Skills and no community repository installs can be triggered.'
            }
          />
        </div>
      </div>
    </div>
  );
}
