/**
 * IntentDocEditor — Phase 48.6 (Developer Mode)
 *
 * Full field-level editor for OrgIntentDoc. Gated behind allowIntentEditor
 * security flag. Accessible via Settings → Security → Developers → Intent Editor.
 *
 * Sections: Goals, Signals, Data Sources, Authorized Actions, Trade-off Profiles,
 *           Hard Boundaries, Policies, Delegation Framework, Context
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Target,
  Activity,
  Database,
  ShieldCheck,
  Sliders,
  ShieldAlert,
  FileWarning,
  Users2,
  Globe,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  ChevronRight,
} from 'lucide-react';
import {
  fetchIntent,
  updateIntent,
  type OrgIntentDoc,
  type OrgIntentGoal,
  type OrgIntentSignal,
  type OrgIntentDataSource,
  type OrgIntentAuthorizedAction,
  type OrgIntentTradeoffProfile,
  type OrgIntentHardBoundary,
  type OrgIntentPolicy,
  type OrgIntentDelegationTenant,
} from '../api/client';

// ─── Section types ─────────────────────────────────────────────────────────────

type Section =
  | 'goals'
  | 'signals'
  | 'dataSources'
  | 'authorizedActions'
  | 'tradeoffProfiles'
  | 'hardBoundaries'
  | 'policies'
  | 'delegation'
  | 'context';

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'goals', label: 'Goals', icon: <Target className="w-4 h-4" /> },
  { id: 'signals', label: 'Signals', icon: <Activity className="w-4 h-4" /> },
  { id: 'dataSources', label: 'Data Sources', icon: <Database className="w-4 h-4" /> },
  {
    id: 'authorizedActions',
    label: 'Authorized Actions',
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  { id: 'tradeoffProfiles', label: 'Trade-off Profiles', icon: <Sliders className="w-4 h-4" /> },
  { id: 'hardBoundaries', label: 'Hard Boundaries', icon: <ShieldAlert className="w-4 h-4" /> },
  { id: 'policies', label: 'Policies', icon: <FileWarning className="w-4 h-4" /> },
  { id: 'delegation', label: 'Delegation', icon: <Users2 className="w-4 h-4" /> },
  { id: 'context', label: 'Context', icon: <Globe className="w-4 h-4" /> },
];

// ─── Shared form primitives ────────────────────────────────────────────────────

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-foreground">
        {label}
        {optional && <span className="text-muted-foreground ml-1">(optional)</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary';
const textareaCls = inputCls + ' resize-y font-mono';
const selectCls = inputCls;

function SliderField({
  label,
  value,
  onChange,
  leftLabel,
  rightLabel,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-medium">
        <span>{label}</span>
        <span className="text-muted-foreground">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
        className="w-full accent-primary"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

// ─── Goals section ─────────────────────────────────────────────────────────────

const DEFAULT_GOAL: OrgIntentGoal = {
  id: '',
  name: '',
  description: '',
  priority: 50,
  activeWhen: '',
  successCriteria: '',
  ownerRole: 'admin',
  skills: [],
  signals: [],
  authorizedActions: [],
};

function GoalsSection({
  doc,
  onChange,
}: {
  doc: OrgIntentDoc;
  onChange: (d: OrgIntentDoc) => void;
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<OrgIntentGoal>(DEFAULT_GOAL);
  const goals = doc.goals ?? [];

  const startAdd = () => {
    setDraft({ ...DEFAULT_GOAL });
    setEditIdx(-1);
  };
  const startEdit = (i: number) => {
    setDraft({ ...goals[i] });
    setEditIdx(i);
  };
  const cancel = () => {
    setEditIdx(null);
  };

  const save = () => {
    const updated =
      editIdx === -1 ? [...goals, draft] : goals.map((g, i) => (i === editIdx ? draft : g));
    onChange({ ...doc, goals: updated });
    setEditIdx(null);
  };

  const remove = (i: number) => {
    onChange({ ...doc, goals: goals.filter((_, j) => j !== i) });
  };

  const set = (k: keyof OrgIntentGoal, v: unknown) => {
    setDraft((d) => ({ ...d, [k]: v }));
  };

  return (
    <div className="space-y-3">
      <ItemList
        items={goals.map((g) => ({
          id: g.id,
          primary: g.name,
          secondary: `priority ${g.priority} · ${g.ownerRole}`,
        }))}
        onEdit={startEdit}
        onDelete={remove}
        onAdd={startAdd}
      />
      {editIdx !== null && (
        <EditForm onSave={save} onCancel={cancel}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ID">
              <input
                className={inputCls}
                value={draft.id}
                onChange={(e) => {
                  set('id', e.target.value);
                }}
                placeholder="goal-1"
              />
            </Field>
            <Field label="Name">
              <input
                className={inputCls}
                value={draft.name}
                onChange={(e) => {
                  set('name', e.target.value);
                }}
                placeholder="Grow ARR"
              />
            </Field>
          </div>
          <Field label="Description" optional>
            <textarea
              className={textareaCls}
              rows={2}
              value={draft.description}
              onChange={(e) => {
                set('description', e.target.value);
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority (1–100)">
              <input
                type="number"
                className={inputCls}
                min={1}
                max={100}
                value={draft.priority}
                onChange={(e) => {
                  set('priority', Number(e.target.value));
                }}
              />
            </Field>
            <Field label="Owner Role">
              <input
                className={inputCls}
                value={draft.ownerRole}
                onChange={(e) => {
                  set('ownerRole', e.target.value);
                }}
              />
            </Field>
          </div>
          <Field label="Active When" optional>
            <input
              className={inputCls}
              value={draft.activeWhen ?? ''}
              onChange={(e) => {
                set('activeWhen', e.target.value);
              }}
              placeholder="env=prod AND quarter=Q1"
            />
          </Field>
          <Field label="Success Criteria" optional>
            <textarea
              className={textareaCls}
              rows={2}
              value={draft.successCriteria}
              onChange={(e) => {
                set('successCriteria', e.target.value);
              }}
            />
          </Field>
          <Field label="Skills (comma-separated IDs)" optional>
            <input
              className={inputCls}
              value={draft.skills.join(', ')}
              onChange={(e) => {
                set(
                  'skills',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                );
              }}
            />
          </Field>
          <Field label="Signal IDs (comma-separated)" optional>
            <input
              className={inputCls}
              value={draft.signals.join(', ')}
              onChange={(e) => {
                set(
                  'signals',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                );
              }}
            />
          </Field>
          <Field label="Authorized Action IDs (comma-separated)" optional>
            <input
              className={inputCls}
              value={draft.authorizedActions.join(', ')}
              onChange={(e) => {
                set(
                  'authorizedActions',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                );
              }}
            />
          </Field>
        </EditForm>
      )}
    </div>
  );
}

// ─── Signals section ───────────────────────────────────────────────────────────

const DEFAULT_SIGNAL: OrgIntentSignal = {
  id: '',
  name: '',
  description: '',
  direction: 'above',
  threshold: 0,
  dataSources: [],
};

function SignalsSection({
  doc,
  onChange,
}: {
  doc: OrgIntentDoc;
  onChange: (d: OrgIntentDoc) => void;
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<OrgIntentSignal>(DEFAULT_SIGNAL);
  const items = doc.signals ?? [];

  const set = (k: keyof OrgIntentSignal, v: unknown) => {
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const save = () => {
    const updated =
      editIdx === -1 ? [...items, draft] : items.map((x, i) => (i === editIdx ? draft : x));
    onChange({ ...doc, signals: updated });
    setEditIdx(null);
  };

  return (
    <div className="space-y-3">
      <ItemList
        items={items.map((s) => ({
          id: s.id,
          primary: s.name,
          secondary: `${s.direction} ${s.threshold}${s.warningThreshold !== undefined ? ` (warn: ${s.warningThreshold})` : ''}`,
        }))}
        onEdit={(i) => {
          setDraft({ ...items[i] });
          setEditIdx(i);
        }}
        onDelete={(i) => {
          onChange({ ...doc, signals: items.filter((_, j) => j !== i) });
        }}
        onAdd={() => {
          setDraft({ ...DEFAULT_SIGNAL });
          setEditIdx(-1);
        }}
      />
      {editIdx !== null && (
        <EditForm
          onSave={save}
          onCancel={() => {
            setEditIdx(null);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="ID">
              <input
                className={inputCls}
                value={draft.id}
                onChange={(e) => {
                  set('id', e.target.value);
                }}
                placeholder="signal-1"
              />
            </Field>
            <Field label="Name">
              <input
                className={inputCls}
                value={draft.name}
                onChange={(e) => {
                  set('name', e.target.value);
                }}
              />
            </Field>
          </div>
          <Field label="Description" optional>
            <input
              className={inputCls}
              value={draft.description}
              onChange={(e) => {
                set('description', e.target.value);
              }}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Direction">
              <select
                className={selectCls}
                value={draft.direction}
                onChange={(e) => {
                  set('direction', e.target.value);
                }}
              >
                <option value="above">above (high is bad)</option>
                <option value="below">below (low is bad)</option>
              </select>
            </Field>
            <Field label="Threshold">
              <input
                type="number"
                className={inputCls}
                value={draft.threshold}
                onChange={(e) => {
                  set('threshold', Number(e.target.value));
                }}
              />
            </Field>
            <Field label="Warning Threshold" optional>
              <input
                type="number"
                className={inputCls}
                value={draft.warningThreshold ?? ''}
                onChange={(e) => {
                  set(
                    'warningThreshold',
                    e.target.value === '' ? undefined : Number(e.target.value)
                  );
                }}
              />
            </Field>
          </div>
          <Field label="Data Source IDs (comma-separated)" optional>
            <input
              className={inputCls}
              value={draft.dataSources.join(', ')}
              onChange={(e) => {
                set(
                  'dataSources',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                );
              }}
            />
          </Field>
        </EditForm>
      )}
    </div>
  );
}

// ─── Data Sources section ──────────────────────────────────────────────────────

const DEFAULT_DS: OrgIntentDataSource = { id: '', name: '', type: 'http', connection: '' };

function DataSourcesSection({
  doc,
  onChange,
}: {
  doc: OrgIntentDoc;
  onChange: (d: OrgIntentDoc) => void;
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<OrgIntentDataSource>(DEFAULT_DS);
  const items = doc.dataSources ?? [];
  const set = (k: keyof OrgIntentDataSource, v: unknown) => {
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const save = () => {
    onChange({
      ...doc,
      dataSources:
        editIdx === -1 ? [...items, draft] : items.map((x, i) => (i === editIdx ? draft : x)),
    });
    setEditIdx(null);
  };
  return (
    <div className="space-y-3">
      <ItemList
        items={items.map((ds) => ({
          id: ds.id,
          primary: ds.name,
          secondary: `${ds.type} · ${ds.connection.slice(0, 40)}`,
        }))}
        onEdit={(i) => {
          setDraft({ ...items[i] });
          setEditIdx(i);
        }}
        onDelete={(i) => {
          onChange({ ...doc, dataSources: items.filter((_, j) => j !== i) });
        }}
        onAdd={() => {
          setDraft({ ...DEFAULT_DS });
          setEditIdx(-1);
        }}
      />
      {editIdx !== null && (
        <EditForm
          onSave={save}
          onCancel={() => {
            setEditIdx(null);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="ID">
              <input
                className={inputCls}
                value={draft.id}
                onChange={(e) => {
                  set('id', e.target.value);
                }}
              />
            </Field>
            <Field label="Name">
              <input
                className={inputCls}
                value={draft.name}
                onChange={(e) => {
                  set('name', e.target.value);
                }}
              />
            </Field>
          </div>
          <Field label="Type">
            <select
              className={selectCls}
              value={draft.type}
              onChange={(e) => {
                set('type', e.target.value);
              }}
            >
              {(['http', 'mcp_tool', 'postgres', 'prometheus', 'custom'] as const).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Connection">
            <input
              className={inputCls}
              value={draft.connection}
              onChange={(e) => {
                set('connection', e.target.value);
              }}
              placeholder="https://..."
            />
          </Field>
          <Field label="Auth Secret (env var name)" optional>
            <input
              className={inputCls}
              value={draft.authSecret ?? ''}
              onChange={(e) => {
                set('authSecret', e.target.value || undefined);
              }}
            />
          </Field>
          <Field label="Schema hint" optional>
            <input
              className={inputCls}
              value={draft.schema ?? ''}
              onChange={(e) => {
                set('schema', e.target.value || undefined);
              }}
            />
          </Field>
        </EditForm>
      )}
    </div>
  );
}

// ─── Authorized Actions section ────────────────────────────────────────────────

const DEFAULT_ACTION: OrgIntentAuthorizedAction = {
  id: '',
  description: '',
  appliesToGoals: [],
  appliesToSignals: [],
  mcpTools: [],
};

function AuthorizedActionsSection({
  doc,
  onChange,
}: {
  doc: OrgIntentDoc;
  onChange: (d: OrgIntentDoc) => void;
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<OrgIntentAuthorizedAction>(DEFAULT_ACTION);
  const items = doc.authorizedActions ?? [];
  const set = (k: keyof OrgIntentAuthorizedAction, v: unknown) => {
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const save = () => {
    onChange({
      ...doc,
      authorizedActions:
        editIdx === -1 ? [...items, draft] : items.map((x, i) => (i === editIdx ? draft : x)),
    });
    setEditIdx(null);
  };
  return (
    <div className="space-y-3">
      <ItemList
        items={items.map((a) => ({
          id: a.id,
          primary: a.description,
          secondary: a.requiredRole ? `role: ${a.requiredRole}` : 'no role restriction',
        }))}
        onEdit={(i) => {
          setDraft({ ...items[i] });
          setEditIdx(i);
        }}
        onDelete={(i) => {
          onChange({ ...doc, authorizedActions: items.filter((_, j) => j !== i) });
        }}
        onAdd={() => {
          setDraft({ ...DEFAULT_ACTION });
          setEditIdx(-1);
        }}
      />
      {editIdx !== null && (
        <EditForm
          onSave={save}
          onCancel={() => {
            setEditIdx(null);
          }}
        >
          <Field label="ID">
            <input
              className={inputCls}
              value={draft.id}
              onChange={(e) => {
                set('id', e.target.value);
              }}
            />
          </Field>
          <Field label="Description">
            <textarea
              className={textareaCls}
              rows={2}
              value={draft.description}
              onChange={(e) => {
                set('description', e.target.value);
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Required Role" optional>
              <input
                className={inputCls}
                value={draft.requiredRole ?? ''}
                onChange={(e) => {
                  set('requiredRole', e.target.value || undefined);
                }}
              />
            </Field>
            <Field label="Conditions (CEL)" optional>
              <input
                className={inputCls}
                value={draft.conditions ?? ''}
                onChange={(e) => {
                  set('conditions', e.target.value || undefined);
                }}
              />
            </Field>
          </div>
          <Field label="MCP Tools (comma-separated)" optional>
            <input
              className={inputCls}
              value={draft.mcpTools.join(', ')}
              onChange={(e) => {
                set(
                  'mcpTools',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                );
              }}
              placeholder="fs_read, http_get"
            />
          </Field>
          <Field label="Applies to Goal IDs (comma-separated)" optional>
            <input
              className={inputCls}
              value={draft.appliesToGoals.join(', ')}
              onChange={(e) => {
                set(
                  'appliesToGoals',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                );
              }}
            />
          </Field>
          <Field label="Applies to Signal IDs (comma-separated)" optional>
            <input
              className={inputCls}
              value={draft.appliesToSignals.join(', ')}
              onChange={(e) => {
                set(
                  'appliesToSignals',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                );
              }}
            />
          </Field>
        </EditForm>
      )}
    </div>
  );
}

// ─── Trade-off Profiles section ────────────────────────────────────────────────

const DEFAULT_PROFILE: OrgIntentTradeoffProfile = {
  id: '',
  name: '',
  speedVsThoroughness: 0.5,
  costVsQuality: 0.5,
  autonomyVsConfirmation: 0.5,
  isDefault: false,
};

function TradeoffProfilesSection({
  doc,
  onChange,
}: {
  doc: OrgIntentDoc;
  onChange: (d: OrgIntentDoc) => void;
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<OrgIntentTradeoffProfile>(DEFAULT_PROFILE);
  const items = doc.tradeoffProfiles ?? [];
  const set = (k: keyof OrgIntentTradeoffProfile, v: unknown) => {
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const save = () => {
    let updated =
      editIdx === -1 ? [...items, draft] : items.map((x, i) => (i === editIdx ? draft : x));
    if (draft.isDefault)
      updated = updated.map((p, i) => ({
        ...p,
        isDefault: i === (editIdx === -1 ? updated.length - 1 : editIdx),
      }));
    onChange({ ...doc, tradeoffProfiles: updated });
    setEditIdx(null);
  };
  return (
    <div className="space-y-3">
      <ItemList
        items={items.map((p) => ({
          id: p.id,
          primary: p.name,
          secondary: p.isDefault ? 'default' : '',
        }))}
        onEdit={(i) => {
          setDraft({ ...items[i] });
          setEditIdx(i);
        }}
        onDelete={(i) => {
          onChange({ ...doc, tradeoffProfiles: items.filter((_, j) => j !== i) });
        }}
        onAdd={() => {
          setDraft({ ...DEFAULT_PROFILE });
          setEditIdx(-1);
        }}
      />
      {editIdx !== null && (
        <EditForm
          onSave={save}
          onCancel={() => {
            setEditIdx(null);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="ID">
              <input
                className={inputCls}
                value={draft.id}
                onChange={(e) => {
                  set('id', e.target.value);
                }}
              />
            </Field>
            <Field label="Name">
              <input
                className={inputCls}
                value={draft.name}
                onChange={(e) => {
                  set('name', e.target.value);
                }}
              />
            </Field>
          </div>
          <SliderField
            label="Speed vs Thoroughness"
            value={draft.speedVsThoroughness}
            onChange={(v) => {
              set('speedVsThoroughness', v);
            }}
            leftLabel="Speed"
            rightLabel="Thoroughness"
          />
          <SliderField
            label="Cost vs Quality"
            value={draft.costVsQuality}
            onChange={(v) => {
              set('costVsQuality', v);
            }}
            leftLabel="Minimise cost"
            rightLabel="Maximise quality"
          />
          <SliderField
            label="Autonomy vs Confirmation"
            value={draft.autonomyVsConfirmation}
            onChange={(v) => {
              set('autonomyVsConfirmation', v);
            }}
            leftLabel="Full autonomy"
            rightLabel="Always confirm"
          />
          <Field label="Notes" optional>
            <input
              className={inputCls}
              value={draft.notes ?? ''}
              onChange={(e) => {
                set('notes', e.target.value || undefined);
              }}
            />
          </Field>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) => {
                set('isDefault', e.target.checked);
              }}
            />
            Set as default profile
          </label>
        </EditForm>
      )}
    </div>
  );
}

// ─── Hard Boundaries section ───────────────────────────────────────────────────

const DEFAULT_BOUNDARY: OrgIntentHardBoundary = { id: '', rule: '', rationale: '' };

function HardBoundariesSection({
  doc,
  onChange,
}: {
  doc: OrgIntentDoc;
  onChange: (d: OrgIntentDoc) => void;
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<OrgIntentHardBoundary>(DEFAULT_BOUNDARY);
  const items = doc.hardBoundaries ?? [];
  const set = (k: keyof OrgIntentHardBoundary, v: unknown) => {
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const save = () => {
    onChange({
      ...doc,
      hardBoundaries:
        editIdx === -1 ? [...items, draft] : items.map((x, i) => (i === editIdx ? draft : x)),
    });
    setEditIdx(null);
  };
  return (
    <div className="space-y-3">
      <ItemList
        items={items.map((b) => ({ id: b.id, primary: b.rule, secondary: b.rationale }))}
        onEdit={(i) => {
          setDraft({ ...items[i] });
          setEditIdx(i);
        }}
        onDelete={(i) => {
          onChange({ ...doc, hardBoundaries: items.filter((_, j) => j !== i) });
        }}
        onAdd={() => {
          setDraft({ ...DEFAULT_BOUNDARY });
          setEditIdx(-1);
        }}
      />
      {editIdx !== null && (
        <EditForm
          onSave={save}
          onCancel={() => {
            setEditIdx(null);
          }}
        >
          <Field label="ID">
            <input
              className={inputCls}
              value={draft.id}
              onChange={(e) => {
                set('id', e.target.value);
              }}
              placeholder="hb-1"
            />
          </Field>
          <Field label="Rule">
            <input
              className={inputCls}
              value={draft.rule}
              onChange={(e) => {
                set('rule', e.target.value);
              }}
              placeholder="deny: drop production  OR  tool: fs_write"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Prefix with <code>deny:</code> to match action descriptions, <code>tool:</code> to
              match tool names. Bare text is a substring match against actions.
            </p>
          </Field>
          <Field label="Rationale">
            <textarea
              className={textareaCls}
              rows={2}
              value={draft.rationale}
              onChange={(e) => {
                set('rationale', e.target.value);
              }}
            />
          </Field>
          <Field label="Rego (OPA expression)" optional>
            <textarea
              className={textareaCls}
              rows={3}
              value={draft.rego ?? ''}
              onChange={(e) => {
                set('rego', e.target.value || undefined);
              }}
              placeholder="package secureyeoman&#10;allow { ... }"
            />
          </Field>
        </EditForm>
      )}
    </div>
  );
}

// ─── Policies section ──────────────────────────────────────────────────────────

const DEFAULT_POLICY: OrgIntentPolicy = { id: '', rule: '', enforcement: 'block', rationale: '' };

function PoliciesSection({
  doc,
  onChange,
}: {
  doc: OrgIntentDoc;
  onChange: (d: OrgIntentDoc) => void;
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<OrgIntentPolicy>(DEFAULT_POLICY);
  const items = doc.policies ?? [];
  const set = (k: keyof OrgIntentPolicy, v: unknown) => {
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const save = () => {
    onChange({
      ...doc,
      policies:
        editIdx === -1 ? [...items, draft] : items.map((x, i) => (i === editIdx ? draft : x)),
    });
    setEditIdx(null);
  };
  return (
    <div className="space-y-3">
      <ItemList
        items={items.map((p) => ({ id: p.id, primary: p.rule, secondary: p.enforcement }))}
        onEdit={(i) => {
          setDraft({ ...items[i] });
          setEditIdx(i);
        }}
        onDelete={(i) => {
          onChange({ ...doc, policies: items.filter((_, j) => j !== i) });
        }}
        onAdd={() => {
          setDraft({ ...DEFAULT_POLICY });
          setEditIdx(-1);
        }}
      />
      {editIdx !== null && (
        <EditForm
          onSave={save}
          onCancel={() => {
            setEditIdx(null);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="ID">
              <input
                className={inputCls}
                value={draft.id}
                onChange={(e) => {
                  set('id', e.target.value);
                }}
              />
            </Field>
            <Field label="Enforcement">
              <select
                className={selectCls}
                value={draft.enforcement}
                onChange={(e) => {
                  set('enforcement', e.target.value);
                }}
              >
                <option value="block">block — halts execution</option>
                <option value="warn">warn — logs and continues</option>
              </select>
            </Field>
          </div>
          <Field label="Rule">
            <input
              className={inputCls}
              value={draft.rule}
              onChange={(e) => {
                set('rule', e.target.value);
              }}
              placeholder="deny: send email  OR  tool: fs_write"
            />
          </Field>
          <Field label="Rationale">
            <textarea
              className={textareaCls}
              rows={2}
              value={draft.rationale}
              onChange={(e) => {
                set('rationale', e.target.value);
              }}
            />
          </Field>
          <Field label="Rego (OPA expression)" optional>
            <textarea
              className={textareaCls}
              rows={3}
              value={draft.rego ?? ''}
              onChange={(e) => {
                set('rego', e.target.value || undefined);
              }}
            />
          </Field>
        </EditForm>
      )}
    </div>
  );
}

// ─── Delegation Framework section ─────────────────────────────────────────────

const DEFAULT_TENANT: OrgIntentDelegationTenant = { id: '', principle: '', decisionBoundaries: [] };

function DelegationSection({
  doc,
  onChange,
}: {
  doc: OrgIntentDoc;
  onChange: (d: OrgIntentDoc) => void;
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<OrgIntentDelegationTenant>(DEFAULT_TENANT);
  const items = doc.delegationFramework?.tenants ?? [];
  const save = () => {
    const updated =
      editIdx === -1 ? [...items, draft] : items.map((x, i) => (i === editIdx ? draft : x));
    onChange({ ...doc, delegationFramework: { tenants: updated } });
    setEditIdx(null);
  };
  return (
    <div className="space-y-3">
      <ItemList
        items={items.map((t) => ({
          id: t.id,
          primary: t.principle,
          secondary: `${t.decisionBoundaries.length} boundaries`,
        }))}
        onEdit={(i) => {
          setDraft({ ...items[i] });
          setEditIdx(i);
        }}
        onDelete={(i) => {
          onChange({ ...doc, delegationFramework: { tenants: items.filter((_, j) => j !== i) } });
        }}
        onAdd={() => {
          setDraft({ ...DEFAULT_TENANT });
          setEditIdx(-1);
        }}
      />
      {editIdx !== null && (
        <EditForm
          onSave={save}
          onCancel={() => {
            setEditIdx(null);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="ID">
              <input
                className={inputCls}
                value={draft.id}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, id: e.target.value }));
                }}
              />
            </Field>
            <Field label="Principle">
              <input
                className={inputCls}
                value={draft.principle}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, principle: e.target.value }));
                }}
              />
            </Field>
          </div>
          <Field label="Decision Boundaries (one per line)">
            <textarea
              className={textareaCls}
              rows={4}
              value={draft.decisionBoundaries.join('\n')}
              onChange={(e) => {
                setDraft((d) => ({
                  ...d,
                  decisionBoundaries: e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                }));
              }}
            />
          </Field>
        </EditForm>
      )}
    </div>
  );
}

// ─── Context (KV) section ──────────────────────────────────────────────────────

function ContextSection({
  doc,
  onChange,
}: {
  doc: OrgIntentDoc;
  onChange: (d: OrgIntentDoc) => void;
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState({ key: '', value: '' });
  const items = doc.context ?? [];
  const save = () => {
    onChange({
      ...doc,
      context:
        editIdx === -1 ? [...items, draft] : items.map((x, i) => (i === editIdx ? draft : x)),
    });
    setEditIdx(null);
  };
  return (
    <div className="space-y-3">
      <ItemList
        items={items.map((c) => ({ id: c.key, primary: c.key, secondary: c.value }))}
        onEdit={(i) => {
          setDraft({ ...items[i] });
          setEditIdx(i);
        }}
        onDelete={(i) => {
          onChange({ ...doc, context: items.filter((_, j) => j !== i) });
        }}
        onAdd={() => {
          setDraft({ key: '', value: '' });
          setEditIdx(-1);
        }}
      />
      {editIdx !== null && (
        <EditForm
          onSave={save}
          onCancel={() => {
            setEditIdx(null);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Key">
              <input
                className={inputCls}
                value={draft.key}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, key: e.target.value }));
                }}
                placeholder="orgName"
              />
            </Field>
            <Field label="Value">
              <input
                className={inputCls}
                value={draft.value}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, value: e.target.value }));
                }}
                placeholder="ACME Corp"
              />
            </Field>
          </div>
        </EditForm>
      )}
    </div>
  );
}

// ─── Shared list + edit form ───────────────────────────────────────────────────

function ItemList({
  items,
  onEdit,
  onDelete,
  onAdd,
}: {
  items: { id: string; primary: string; secondary: string }[];
  onEdit: (i: number) => void;
  onDelete: (i: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">No items yet.</p>
      )}
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-2 border border-border rounded px-3 py-2 bg-muted/20"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{item.primary}</p>
            {item.secondary && (
              <p className="text-xs text-muted-foreground truncate">{item.secondary}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                onEdit(i);
              }}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (confirm('Delete this item?')) onDelete(i);
              }}
              className="p-1 text-muted-foreground hover:text-destructive transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add item
      </button>
    </div>
  );
}

function EditForm({
  onSave,
  onCancel,
  children,
}: {
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-primary/30 rounded-lg p-4 space-y-3 bg-primary/5">
      {children}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
        >
          <Save className="w-3.5 h-3.5" /> Save item
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded hover:bg-accent transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main IntentDocEditor ──────────────────────────────────────────────────────

export function IntentDocEditor({ intentId }: { intentId: string }) {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>('goals');
  const [localDoc, setLocalDoc] = useState<OrgIntentDoc | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['intent', intentId],
    queryFn: () => fetchIntent(intentId),
  });

  useEffect(() => {
    if (data?.intent) {
      setLocalDoc(data.intent);
      setIsDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => updateIntent(intentId, localDoc as unknown as Record<string, unknown>),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intent', intentId] });
      void queryClient.invalidateQueries({ queryKey: ['activeIntent'] });
      void queryClient.invalidateQueries({ queryKey: ['intents'] });
      setIsDirty(false);
    },
  });

  const handleChange = (updated: OrgIntentDoc) => {
    setLocalDoc(updated);
    setIsDirty(true);
  };

  if (isLoading || !localDoc) {
    return <p className="text-xs text-muted-foreground py-4">Loading intent document…</p>;
  }

  const renderSection = () => {
    if (!localDoc) return null;
    switch (section) {
      case 'goals':
        return <GoalsSection doc={localDoc} onChange={handleChange} />;
      case 'signals':
        return <SignalsSection doc={localDoc} onChange={handleChange} />;
      case 'dataSources':
        return <DataSourcesSection doc={localDoc} onChange={handleChange} />;
      case 'authorizedActions':
        return <AuthorizedActionsSection doc={localDoc} onChange={handleChange} />;
      case 'tradeoffProfiles':
        return <TradeoffProfilesSection doc={localDoc} onChange={handleChange} />;
      case 'hardBoundaries':
        return <HardBoundariesSection doc={localDoc} onChange={handleChange} />;
      case 'policies':
        return <PoliciesSection doc={localDoc} onChange={handleChange} />;
      case 'delegation':
        return <DelegationSection doc={localDoc} onChange={handleChange} />;
      case 'context':
        return <ContextSection doc={localDoc} onChange={handleChange} />;
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{localDoc.name}</span>
          {isDirty && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-medium">
              Unsaved changes
            </span>
          )}
        </div>
        <button
          onClick={() => {
            saveMutation.mutate();
          }}
          disabled={!isDirty || saveMutation.isPending}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          {saveMutation.isPending ? 'Saving…' : 'Save All Changes'}
        </button>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex min-h-[400px]">
        {/* Sidebar */}
        <nav className="w-44 shrink-0 border-r border-border bg-muted/10 py-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSection(s.id);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                section === s.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              {s.icon}
              <span className="flex-1">{s.label}</span>
              {section === s.id && <ChevronRight className="w-3 h-3 shrink-0" />}
            </button>
          ))}
        </nav>

        {/* Section content */}
        <div className="flex-1 p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold mb-3">
            {SECTIONS.find((s) => s.id === section)?.label}
          </h3>
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
