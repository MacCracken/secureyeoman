/**
 * RoutingRulesPage — Cross-Integration Routing Rules (ADR 087)
 *
 * Visual rule builder:
 * - List existing rules with enable/disable toggle and match stats
 * - Create/edit rule form with trigger conditions + action fields
 * - Per-rule dry-run test panel
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Plus,
  Trash2,
  Edit2,
  Play,
  CheckCircle2,
  XCircle,
  Power,
  PowerOff,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import {
  fetchRoutingRules,
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
  testRoutingRule,
  fetchIntegrations,
  fetchPersonalities,
  type RoutingRule,
} from '../api/client';

type ActionType = RoutingRule['actionType'];
type Direction = RoutingRule['triggerDirection'];

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  forward: 'Forward message to another chat',
  reply: 'Reply via a different integration',
  personality: 'Override active personality',
  notify: 'Send webhook notification',
};

interface RuleFormState {
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  triggerPlatforms: string;
  triggerIntegrationIds: string;
  triggerChatIdPattern: string;
  triggerSenderIdPattern: string;
  triggerKeywordPattern: string;
  triggerDirection: Direction;
  actionType: ActionType;
  actionTargetIntegrationId: string;
  actionTargetChatId: string;
  actionPersonalityId: string;
  actionWebhookUrl: string;
  actionMessageTemplate: string;
}

const EMPTY_FORM: RuleFormState = {
  name: '',
  description: '',
  enabled: true,
  priority: 100,
  triggerPlatforms: '',
  triggerIntegrationIds: '',
  triggerChatIdPattern: '',
  triggerSenderIdPattern: '',
  triggerKeywordPattern: '',
  triggerDirection: 'inbound',
  actionType: 'forward',
  actionTargetIntegrationId: '',
  actionTargetChatId: '',
  actionPersonalityId: '',
  actionWebhookUrl: '',
  actionMessageTemplate: '',
};

function formToRule(f: RuleFormState): Omit<RoutingRule, 'id' | 'matchCount' | 'lastMatchedAt' | 'createdAt' | 'updatedAt'> {
  const splitList = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

  return {
    name: f.name,
    description: f.description,
    enabled: f.enabled,
    priority: Number(f.priority),
    triggerPlatforms: splitList(f.triggerPlatforms),
    triggerIntegrationIds: splitList(f.triggerIntegrationIds),
    triggerChatIdPattern: f.triggerChatIdPattern || null,
    triggerSenderIdPattern: f.triggerSenderIdPattern || null,
    triggerKeywordPattern: f.triggerKeywordPattern || null,
    triggerDirection: f.triggerDirection,
    actionType: f.actionType,
    actionTargetIntegrationId: f.actionTargetIntegrationId || null,
    actionTargetChatId: f.actionTargetChatId || null,
    actionPersonalityId: f.actionPersonalityId || null,
    actionWebhookUrl: f.actionWebhookUrl || null,
    actionMessageTemplate: f.actionMessageTemplate || null,
  };
}

function ruleToForm(r: RoutingRule): RuleFormState {
  return {
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    priority: r.priority,
    triggerPlatforms: r.triggerPlatforms.join(', '),
    triggerIntegrationIds: r.triggerIntegrationIds.join(', '),
    triggerChatIdPattern: r.triggerChatIdPattern ?? '',
    triggerSenderIdPattern: r.triggerSenderIdPattern ?? '',
    triggerKeywordPattern: r.triggerKeywordPattern ?? '',
    triggerDirection: r.triggerDirection,
    actionType: r.actionType,
    actionTargetIntegrationId: r.actionTargetIntegrationId ?? '',
    actionTargetChatId: r.actionTargetChatId ?? '',
    actionPersonalityId: r.actionPersonalityId ?? '',
    actionWebhookUrl: r.actionWebhookUrl ?? '',
    actionMessageTemplate: r.actionMessageTemplate ?? '',
  };
}

export function RoutingRulesPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [testParams, setTestParams] = useState({ platform: '', text: '' });
  const [testResult, setTestResult] = useState<{ matched: boolean; reason?: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['routing-rules'],
    queryFn: () => fetchRoutingRules({ limit: 200 }),
  });

  const { data: integrationsData } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => fetchIntegrations(),
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: () => fetchPersonalities(),
  });

  const rules = data?.rules ?? [];
  const integrations = integrationsData?.integrations ?? [];
  const personalities = personalitiesData?.personalities ?? [];

  const createMutation = useMutation({
    mutationFn: (d: Parameters<typeof createRoutingRule>[0]) => createRoutingRule(d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['routing-rules'] }); setEditingId(null); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Partial<Omit<RoutingRule, 'id' | 'matchCount' | 'lastMatchedAt' | 'createdAt' | 'updatedAt'>> }) =>
      updateRoutingRule(id, d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['routing-rules'] }); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRoutingRule(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['routing-rules'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateRoutingRule(id, { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['routing-rules'] }),
  });

  const testMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: { platform: string; text: string } }) =>
      testRoutingRule(id, { platform: params.platform, text: params.text, direction: 'inbound' }),
    onSuccess: (data) => setTestResult({ matched: data.matched, reason: data.reason }),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    const payload = formToRule(form);
    if (editingId === 'new') {
      createMutation.mutate(payload);
    } else if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    }
  };

  const startEdit = (rule: RoutingRule) => {
    setForm(ruleToForm(rule));
    setEditingId(rule.id);
  };

  const startNew = () => {
    setForm(EMPTY_FORM);
    setEditingId('new');
  };

  const setField = <K extends keyof RuleFormState>(key: K, value: RuleFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowRightLeft className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Routing Rules</h1>
            <p className="text-sm text-muted-foreground">
              Route inbound messages between integrations, override personalities, or trigger webhooks.
            </p>
          </div>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Rule
        </button>
      </div>

      {/* Rule form (create/edit) */}
      {editingId !== null && (
        <RuleForm
          form={form}
          setField={setField}
          integrations={integrations}
          personalities={personalities}
          onSubmit={handleSubmit}
          onCancel={() => setEditingId(null)}
          isNew={editingId === 'new'}
          isPending={createMutation.isPending || updateMutation.isPending}
          error={
            createMutation.error instanceof Error
              ? createMutation.error.message
              : updateMutation.error instanceof Error
              ? updateMutation.error.message
              : null
          }
        />
      )}

      {/* Rule list */}
      {isLoading && (
        <div className="text-sm text-muted-foreground text-center py-8">Loading rules…</div>
      )}
      {!isLoading && rules.length === 0 && editingId === null && (
        <div className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg">
          No routing rules yet. Click <strong>New Rule</strong> to create one.
        </div>
      )}

      <div className="space-y-3">
        {rules.map((rule) => {
          const isExpanded = expandedId === rule.id;
          return (
            <div key={rule.id} className="border border-border rounded-lg bg-card overflow-hidden">
              {/* Rule header row */}
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                  className={`flex-shrink-0 p-1.5 rounded transition-colors ${
                    rule.enabled
                      ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-950'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  title={rule.enabled ? 'Disable' : 'Enable'}
                >
                  {rule.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{rule.name}</span>
                    {!rule.enabled && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        disabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {ACTION_TYPE_LABELS[rule.actionType]} · Priority {rule.priority}
                    {rule.matchCount > 0 && ` · ${rule.matchCount} matches`}
                  </p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => { startEdit(rule); setExpandedId(null); }}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : rule.id)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                    title="Test"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete rule "${rule.name}"?`)) {
                        deleteMutation.mutate(rule.id);
                      }
                    }}
                    className="p-1.5 rounded hover:bg-muted text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : rule.id)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expandable dry-run panel */}
              {isExpanded && (
                <div className="border-t border-border p-4 bg-muted/30 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Dry Run Test
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Platform (e.g. slack)"
                      value={testParams.platform}
                      onChange={(e) => setTestParams((p) => ({ ...p, platform: e.target.value }))}
                      className="w-32 rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="text"
                      placeholder="Message text"
                      value={testParams.text}
                      onChange={(e) => setTestParams((p) => ({ ...p, text: e.target.value }))}
                      className="flex-1 rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button
                      onClick={() => {
                        setTestResult(null);
                        testMutation.mutate({ id: rule.id, params: testParams });
                      }}
                      disabled={!testParams.platform || testMutation.isPending}
                      className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {testMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                      Test
                    </button>
                  </div>

                  {testResult && (
                    <div
                      className={`flex items-center gap-2 text-sm rounded p-2 ${
                        testResult.matched
                          ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'
                          : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
                      }`}
                    >
                      {testResult.matched ? (
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 flex-shrink-0" />
                      )}
                      <span>
                        {testResult.matched
                          ? 'Rule would match this message'
                          : `Rule would NOT match${testResult.reason ? ` — ${testResult.reason}` : ''}`}
                      </span>
                    </div>
                  )}

                  {/* Rule detail summary */}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <dt>Direction</dt><dd>{rule.triggerDirection}</dd>
                    <dt>Platforms</dt><dd>{rule.triggerPlatforms.join(', ') || 'any'}</dd>
                    <dt>Action</dt><dd>{rule.actionType}</dd>
                    {rule.triggerKeywordPattern && <><dt>Keyword</dt><dd className="font-mono">{rule.triggerKeywordPattern}</dd></>}
                    {rule.matchCount > 0 && <><dt>Last matched</dt><dd>{rule.lastMatchedAt ? new Date(rule.lastMatchedAt).toLocaleString() : '—'}</dd></>}
                  </dl>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Rule Form ─────────────────────────────────────────────────────────────

interface RuleFormProps {
  form: RuleFormState;
  setField: <K extends keyof RuleFormState>(key: K, value: RuleFormState[K]) => void;
  integrations: { id: string; displayName: string; platform: string }[];
  personalities: { id: string; name: string; enabled: boolean }[];
  onSubmit: () => void;
  onCancel: () => void;
  isNew: boolean;
  isPending: boolean;
  error: string | null;
}

function RuleForm({ form, setField, integrations, personalities, onSubmit, onCancel, isNew, isPending, error }: RuleFormProps) {
  const inputClass =
    'w-full rounded border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1';

  return (
    <div className="border border-border rounded-lg p-5 bg-card space-y-4">
      <h2 className="font-semibold text-sm">{isNew ? 'New Routing Rule' : 'Edit Rule'}</h2>

      {/* Basic fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="e.g. Forward Slack → Telegram"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Priority (1–9999, lower = higher priority)</label>
          <input
            type="number"
            value={form.priority}
            onChange={(e) => setField('priority', Number(e.target.value))}
            min={1}
            max={9999}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setField('description', e.target.value)}
          placeholder="Optional description"
          className={inputClass}
        />
      </div>

      {/* Trigger conditions */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Trigger Conditions (leave blank = match all)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Direction</label>
            <select
              value={form.triggerDirection}
              onChange={(e) => setField('triggerDirection', e.target.value as Direction)}
              className={inputClass}
            >
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Platforms (comma-separated)</label>
            <input
              type="text"
              value={form.triggerPlatforms}
              onChange={(e) => setField('triggerPlatforms', e.target.value)}
              placeholder="slack, telegram (blank = all)"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Integration IDs (comma-separated)</label>
            <input
              type="text"
              value={form.triggerIntegrationIds}
              onChange={(e) => setField('triggerIntegrationIds', e.target.value)}
              placeholder="blank = all"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Keyword Pattern (regex)</label>
            <input
              type="text"
              value={form.triggerKeywordPattern}
              onChange={(e) => setField('triggerKeywordPattern', e.target.value)}
              placeholder="e.g. urgent|help"
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className={labelClass}>Chat ID Pattern (regex)</label>
            <input
              type="text"
              value={form.triggerChatIdPattern}
              onChange={(e) => setField('triggerChatIdPattern', e.target.value)}
              placeholder="e.g. ^C[A-Z]+"
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className={labelClass}>Sender ID Pattern (regex)</label>
            <input
              type="text"
              value={form.triggerSenderIdPattern}
              onChange={(e) => setField('triggerSenderIdPattern', e.target.value)}
              placeholder="e.g. bot_.*"
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
      </div>

      {/* Action */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Action
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Action Type *</label>
            <select
              value={form.actionType}
              onChange={(e) => setField('actionType', e.target.value as ActionType)}
              className={inputClass}
            >
              {(Object.entries(ACTION_TYPE_LABELS) as [ActionType, string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>

          {(form.actionType === 'forward' || form.actionType === 'reply') && (
            <>
              <div>
                <label className={labelClass}>Target Integration</label>
                <select
                  value={form.actionTargetIntegrationId}
                  onChange={(e) => setField('actionTargetIntegrationId', e.target.value)}
                  className={inputClass}
                >
                  <option value="">Same integration</option>
                  {integrations.map((i) => (
                    <option key={i.id} value={i.id}>{i.displayName} ({i.platform})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Target Chat ID</label>
                <input
                  type="text"
                  value={form.actionTargetChatId}
                  onChange={(e) => setField('actionTargetChatId', e.target.value)}
                  placeholder="Same chat if blank"
                  className={inputClass}
                />
              </div>
            </>
          )}

          {form.actionType === 'personality' && (
            <div className="col-span-2">
              <label className={labelClass}>Override Personality</label>
              <select
                value={form.actionPersonalityId}
                onChange={(e) => setField('actionPersonalityId', e.target.value)}
                className={inputClass}
              >
                <option value="">Select personality…</option>
                {personalities.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.enabled ? ' (active)' : ''}</option>
                ))}
              </select>
            </div>
          )}

          {form.actionType === 'notify' && (
            <div className="col-span-2">
              <label className={labelClass}>Webhook URL</label>
              <input
                type="url"
                value={form.actionWebhookUrl}
                onChange={(e) => setField('actionWebhookUrl', e.target.value)}
                placeholder="https://hooks.example.com/..."
                className={inputClass}
              />
            </div>
          )}

          {(form.actionType === 'forward' || form.actionType === 'reply' || form.actionType === 'notify') && (
            <div className="col-span-2">
              <label className={labelClass}>
                Message Template (optional — use {'{{text}}'}, {'{{senderName}}'}, {'{{platform}}'})
              </label>
              <textarea
                value={form.actionMessageTemplate}
                onChange={(e) => setField('actionMessageTemplate', e.target.value)}
                placeholder={'From {{senderName}} on {{platform}}: {{text}}'}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setField('enabled', e.target.checked)}
            className="rounded"
          />
          Enabled
        </label>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded border border-border text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!form.name.trim() || isPending}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isNew ? 'Create Rule' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
