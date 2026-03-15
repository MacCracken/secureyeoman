import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';

const PersonalityWizard = lazy(() =>
  import('./personality/PersonalityWizard').then((m) => ({ default: m.PersonalityWizard }))
);

const PersonalityVersionHistory = lazy(() => import('./personality/PersonalityVersionHistory'));
import {
  Bot,
  User,
  Plus,
  Edit2,
  Trash2,
  X,
  Eye,
  ChevronLeft,
  Star,
  Power,
  Download,
  Upload,
  Sparkles,
} from 'lucide-react';
import {
  fetchPersonalities,
  createPersonality,
  updatePersonality,
  deletePersonality,
  activatePersonality,
  enablePersonality,
  disablePersonality,
  setDefaultPersonality,
  clearDefaultPersonality,
  fetchPromptPreview,
  fetchModelInfo,
  fetchMcpConfig,
  fetchSecurityPolicy,
  fetchSoulConfig,
  exportPersonality,
  importPersonality,
} from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';
import { useCollabEditor } from '../hooks/useCollabEditor.js';
import { PresenceBanner } from './PresenceBanner.js';
import type {
  Personality,
  PersonalityCreate,
} from '../types';
import type { IntegrationAccess } from '@secureyeoman/shared';

// ── Extracted sub-components ────────────────────────────────────────────────
import { DispositionEditor } from './personality/DispositionPanel';
import {
  CollapsibleSection,
  AvatarUpload,
  formatDate,
  resolveAvatarSrc,
  SEX_OPTIONS,
} from './personality/shared';
import { SpiritSection } from './personality/SpiritSection';
import { BrainSection } from './personality/BrainSection';
import { BodySection } from './personality/BodySection';
import { HeartSection } from './personality/HeartbeatSection';
import { usePersonalityMutations } from './personality/hooks';

// Re-export PersonalityAvatar so external consumers (e.g. ChatPage) keep working.
export { PersonalityAvatar } from './personality/shared';

// ── Main PersonalityEditor ──────────────────────────────────────

export function PersonalityEditor({
  initialEditingId,
  onBack,
}: { initialEditingId?: string; onBack?: () => void } = {}) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<string | null>(initialEditingId === 'new' ? 'new' : null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Personality | null>(null);
  const [deleteLockedMsg, setDeleteLockedMsg] = useState<string | null>(null);
  const [_activatingId, setActivatingId] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [setActiveOnSave, setSetActiveOnSave] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [form, setForm] = useState<PersonalityCreate>({
    name: '',
    description: '',
    systemPrompt: '',
    traits: {},
    sex: 'unspecified',
    voice: '',
    voiceProfileId: null,
    preferredLanguage: '',
    defaultModel: null,
    modelFallbacks: [],
    includeArchetypes: true,
    injectDateTime: false,
    empathyResonance: false,
    body: {
      enabled: false,
      capabilities: [],
      heartEnabled: true,
      creationConfig: {
        skills: false,
        tasks: false,
        personalities: false,
        subAgents: false,
        customRoles: false,
        roleAssignments: false,
        experiments: false,
      },
    },
  });

  const [creationConfig, setCreationConfig] = useState({
    skills: false,
    tasks: false,
    personalities: false,
    subAgents: false,
    customRoles: false,
    roleAssignments: false,
    experiments: false,
    allowA2A: false,
    allowSwarms: false,
    allowDynamicTools: false,
    workflows: false,
  });

  const [allowConnections, setAllowConnections] = useState(false);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [integrationAccess, setIntegrationAccess] = useState<IntegrationAccess[]>([]);
  const [enabledCaps, setEnabledCaps] = useState<Record<string, boolean>>({
    vision: false,
    limb_movement: false,
    auditory: false,
    haptic: false,
    vocalization: false,
    diagnostics: false,
  });
  const [mcpFeatures, setMcpFeatures] = useState<{
    exposeGit: boolean;
    exposeFilesystem: boolean;
    exposeWeb: boolean;
    exposeWebScraping: boolean;
    exposeWebSearch: boolean;
    exposeBrowser: boolean;
    exposeDesktopControl: boolean;
    exposeNetworkDevices: boolean;
    exposeNetworkDiscovery: boolean;
    exposeNetworkAudit: boolean;
    exposeNetBox: boolean;
    exposeNvd: boolean;
    exposeNetworkUtils: boolean;
    exposeTwingateTools: boolean;
    exposeOrgIntentTools: boolean;
    exposeOrgKnowledgeBase: boolean;
    exposeGmail: boolean;
    exposeTwitter: boolean;
    exposeGithub: boolean;
    exposeDocker: boolean;
    exposeTerminal: boolean;
    exposeSynapse: boolean;
    exposeDelta: boolean;
    exposeVoice: boolean;
    exposeEdge: boolean;
  }>({
    exposeGit: false,
    exposeFilesystem: false,
    exposeWeb: false,
    exposeWebScraping: false,
    exposeWebSearch: false,
    exposeBrowser: false,
    exposeDesktopControl: false,
    exposeNetworkDevices: false,
    exposeNetworkDiscovery: false,
    exposeNetworkAudit: false,
    exposeNetBox: false,
    exposeNvd: false,
    exposeNetworkUtils: false,
    exposeTwingateTools: false,
    exposeOrgIntentTools: false,
    exposeOrgKnowledgeBase: false,
    exposeGmail: false,
    exposeTwitter: false,
    exposeGithub: false,
    exposeDocker: false,
    exposeTerminal: false,
    exposeSynapse: false,
    exposeDelta: false,
    exposeVoice: false,
    exposeEdge: false,
  });
  const [proactiveConfig, setProactiveConfig] = useState<{
    enabled: boolean;
    builtins: {
      dailyStandup: boolean;
      weeklySummary: boolean;
      contextualFollowup: boolean;
      integrationHealthAlert: boolean;
      securityAlertDigest: boolean;
    };
    builtinModes: {
      dailyStandup: 'auto' | 'suggest' | 'manual';
      weeklySummary: 'auto' | 'suggest' | 'manual';
      contextualFollowup: 'auto' | 'suggest' | 'manual';
      integrationHealthAlert: 'auto' | 'suggest' | 'manual';
      securityAlertDigest: 'auto' | 'suggest' | 'manual';
    };
    learning: { enabled: boolean; minConfidence: number };
  }>({
    enabled: false,
    builtins: {
      dailyStandup: false,
      weeklySummary: false,
      contextualFollowup: false,
      integrationHealthAlert: false,
      securityAlertDigest: false,
    },
    builtinModes: {
      dailyStandup: 'auto',
      weeklySummary: 'suggest',
      contextualFollowup: 'suggest',
      integrationHealthAlert: 'auto',
      securityAlertDigest: 'suggest',
    },
    learning: { enabled: true, minConfidence: 0.7 },
  });
  const [activeHours, setActiveHours] = useState<{
    enabled: boolean;
    start: string;
    end: string;
    daysOfWeek: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
    timezone: string;
  }>({
    enabled: false,
    start: '09:00',
    end: '17:00',
    daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
    timezone: 'UTC',
  });

  const [thinkingConfig, setThinkingConfig] = useState({ enabled: false, budgetTokens: 10000 });
  const [reasoningConfig, setReasoningConfig] = useState({
    enabled: false,
    effort: 'medium' as 'low' | 'medium' | 'high',
  });
  const [contextOverflowStrategy, setContextOverflowStrategy] = useState<
    'summarise' | 'truncate' | 'error'
  >('summarise');
  const [costBudget, setCostBudget] = useState<{ dailyUsd?: number; monthlyUsd?: number }>({});
  const [maxPromptTokens, setMaxPromptTokens] = useState<number | null>(null);
  const [omnipresentMind, setOmnipresentMind] = useState(false);
  const [strictSystemPromptConfidentiality, setStrictSystemPromptConfidentiality] = useState<
    boolean | undefined
  >(undefined);
  const [knowledgeMode, setKnowledgeMode] = useState<'rag' | 'notebook' | 'hybrid'>('rag');
  const [notebookTokenBudget, setNotebookTokenBudget] = useState<number | null>(null);

  const [resourcePolicy, setResourcePolicy] = useState<{
    deletionMode: 'auto' | 'request' | 'manual';
    automationLevel: 'full_manual' | 'semi_auto' | 'supervised_auto';
    emergencyStop: boolean;
  }>({
    deletionMode: 'auto',
    automationLevel: 'supervised_auto',
    emergencyStop: false,
  });

  // Collaborative editing — active when an existing personality is open for editing
  const collabDocId = editing && editing !== 'new' ? `personality:${editing}` : null;
  const {
    text: collabSystemPrompt,
    onTextChange: onCollabSystemPromptChange,
    presenceUsers: systemPromptPresence,
  } = useCollabEditor(collabDocId, 'systemPrompt', form.systemPrompt);

  const { data: personalitiesData, isLoading } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const { data: preview } = useQuery({
    queryKey: ['promptPreview', previewId],
    queryFn: () => fetchPromptPreview(previewId!),
    enabled: !!previewId,
  });

  const { data: modelData } = useQuery({
    queryKey: ['modelInfo'],
    queryFn: fetchModelInfo,
  });

  const { data: soulConfig } = useQuery({
    queryKey: ['soulConfig'],
    queryFn: fetchSoulConfig,
  });

  const { data: _globalMcpConfig } = useQuery({
    queryKey: ['mcpConfig'],
    queryFn: fetchMcpConfig,
  });

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
  });

  const personalities = personalitiesData?.personalities ?? [];

  const createMut = useMutation({
    mutationFn: (data: PersonalityCreate) => createPersonality(data),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      if (setActiveOnSave) {
        setDefaultMut.mutate(result.personality.id);
      }
      setEditing(null);
      setSetActiveOnSave(false);
      if (onBack) onBack();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PersonalityCreate> }) =>
      updatePersonality(id, data),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      if (setActiveOnSave && variables.id) {
        setDefaultMut.mutate(variables.id);
      }
      setEditing(null);
      setSetActiveOnSave(false);
      if (onBack) onBack();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const _activateMut = useMutation({
    mutationFn: (id: string) => {
      setActivatingId(id);
      setActivateError(null);
      return activatePersonality(id);
    },
    onSuccess: () => {
      setActivatingId(null);
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['promptPreview'] });
    },
    onError: (err: Error) => {
      setActivatingId(null);
      setActivateError(err.message || 'Failed to activate personality');
    },
  });

  const enableMut = useMutation({
    mutationFn: (id: string) => enablePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const disableMut = useMutation({
    mutationFn: (id: string) => disablePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const setDefaultMut = useMutation({
    mutationFn: (id: string) => setDefaultPersonality(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['promptPreview'] });
    },
  });

  const clearDefaultMut = useMutation({
    mutationFn: () => clearDefaultPersonality(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['promptPreview'] });
    },
  });

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      const pName = searchParams.get('name') || '';
      const pDescription = searchParams.get('description') || '';
      const pModel = searchParams.get('model') || '';
      setForm((prev) => ({
        ...prev,
        name: pName,
        description: pDescription,
        defaultModel: pModel || null,
      }));
      setEditing('new');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const initialEditApplied = useRef(false);

  const startEdit = (p: Personality) => {
    const body = p.body ?? {
      enabled: false,
      capabilities: [],
      heartEnabled: true,
      creationConfig: {
        skills: false,
        tasks: false,
        personalities: false,
        subAgents: false,
        customRoles: false,
        roleAssignments: false,
        experiments: false,
        workflows: false,
      },
    };
    setForm({
      name: p.name,
      description: p.description,
      systemPrompt: p.systemPrompt,
      traits: p.traits,
      sex: p.sex,
      voice: p.voice,
      voiceProfileId: p.voiceProfileId ?? null,
      preferredLanguage: p.preferredLanguage,
      defaultModel: p.defaultModel,
      modelFallbacks: p.modelFallbacks ?? [],
      includeArchetypes: p.includeArchetypes,
      injectDateTime: p.injectDateTime ?? false,
      empathyResonance: p.empathyResonance ?? false,
      body,
    });
    setResourcePolicy({
      deletionMode: p.body?.resourcePolicy?.deletionMode ?? 'auto',
      automationLevel: p.body?.resourcePolicy?.automationLevel ?? 'supervised_auto',
      emergencyStop: p.body?.resourcePolicy?.emergencyStop ?? false,
    });
    setCreationConfig({
      skills: body.creationConfig?.skills ?? false,
      tasks: body.creationConfig?.tasks ?? false,
      personalities: body.creationConfig?.personalities ?? false,
      subAgents: body.creationConfig?.subAgents ?? false,
      customRoles: body.creationConfig?.customRoles ?? false,
      roleAssignments: body.creationConfig?.roleAssignments ?? false,
      experiments: body.creationConfig?.experiments ?? false,
      allowA2A: body.creationConfig?.allowA2A ?? false,
      allowSwarms: body.creationConfig?.allowSwarms ?? false,
      allowDynamicTools: p.body?.creationConfig?.allowDynamicTools ?? false,
      workflows: body.creationConfig?.workflows ?? false,
    });
    setAllowConnections(body.enabled ?? false);
    setSelectedServers(body.selectedServers ?? []);
    // Migrate from legacy selectedIntegrations (string[]) to integrationAccess if needed
    const legacyIds: string[] = body.selectedIntegrations ?? [];
    const access: IntegrationAccess[] =
      (body.integrationAccess ?? []).length > 0
        ? (body.integrationAccess ?? [])
        : legacyIds.map((id) => ({ id, mode: 'auto' as const }));
    setIntegrationAccess(access);
    const caps = body.capabilities ?? [];
    setEnabledCaps({
      vision: caps.includes('vision'),
      limb_movement: caps.includes('limb_movement'),
      auditory: caps.includes('auditory'),
      haptic: caps.includes('haptic'),
      vocalization: caps.includes('vocalization'),
      diagnostics: caps.includes('diagnostics'),
    });
    setMcpFeatures({
      exposeGit: body.mcpFeatures?.exposeGit ?? false,
      exposeFilesystem: body.mcpFeatures?.exposeFilesystem ?? false,
      exposeWeb: body.mcpFeatures?.exposeWeb ?? false,
      exposeWebScraping: body.mcpFeatures?.exposeWebScraping ?? false,
      exposeWebSearch: body.mcpFeatures?.exposeWebSearch ?? false,
      exposeBrowser: body.mcpFeatures?.exposeBrowser ?? false,
      exposeDesktopControl: body.mcpFeatures?.exposeDesktopControl ?? false,
      exposeNetworkDevices: body.mcpFeatures?.exposeNetworkDevices ?? false,
      exposeNetworkDiscovery: body.mcpFeatures?.exposeNetworkDiscovery ?? false,
      exposeNetworkAudit: body.mcpFeatures?.exposeNetworkAudit ?? false,
      exposeNetBox: body.mcpFeatures?.exposeNetBox ?? false,
      exposeNvd: body.mcpFeatures?.exposeNvd ?? false,
      exposeNetworkUtils: body.mcpFeatures?.exposeNetworkUtils ?? false,
      exposeTwingateTools: body.mcpFeatures?.exposeTwingateTools ?? false,
      exposeOrgIntentTools: body.mcpFeatures?.exposeOrgIntentTools ?? false,
      exposeOrgKnowledgeBase: (body.mcpFeatures as any)?.exposeOrgKnowledgeBase ?? false,
      exposeGmail: body.mcpFeatures?.exposeGmail ?? false,
      exposeTwitter: body.mcpFeatures?.exposeTwitter ?? false,
      exposeGithub: body.mcpFeatures?.exposeGithub ?? false,
      exposeDocker: body.mcpFeatures?.exposeDocker ?? false,
      exposeTerminal: body.mcpFeatures?.exposeTerminal ?? false,
      exposeSynapse: body.mcpFeatures?.exposeSynapse ?? false,
      exposeDelta: body.mcpFeatures?.exposeDelta ?? false,
      exposeVoice: body.mcpFeatures?.exposeVoice ?? false,
      exposeEdge: body.mcpFeatures?.exposeEdge ?? false,
    });
    const bc = p.brainConfig ?? {};
    const pc = bc.proactiveConfig ?? {};
    setProactiveConfig({
      enabled: pc.enabled ?? false,
      builtins: {
        dailyStandup: pc.builtins?.dailyStandup ?? false,
        weeklySummary: pc.builtins?.weeklySummary ?? false,
        contextualFollowup: pc.builtins?.contextualFollowup ?? false,
        integrationHealthAlert: pc.builtins?.integrationHealthAlert ?? false,
        securityAlertDigest: pc.builtins?.securityAlertDigest ?? false,
      },
      builtinModes: {
        dailyStandup: pc.builtinModes?.dailyStandup ?? 'auto',
        weeklySummary: pc.builtinModes?.weeklySummary ?? 'suggest',
        contextualFollowup: pc.builtinModes?.contextualFollowup ?? 'suggest',
        integrationHealthAlert: pc.builtinModes?.integrationHealthAlert ?? 'auto',
        securityAlertDigest: pc.builtinModes?.securityAlertDigest ?? 'suggest',
      },
      learning: {
        enabled: pc.learning?.enabled ?? true,
        minConfidence: pc.learning?.minConfidence ?? 0.7,
      },
    });
    setActiveHours({
      enabled: body.activeHours?.enabled ?? false,
      start: body.activeHours?.start ?? '09:00',
      end: body.activeHours?.end ?? '17:00',
      daysOfWeek: body.activeHours?.daysOfWeek ?? ['mon', 'tue', 'wed', 'thu', 'fri'],
      timezone: body.activeHours?.timezone ?? 'UTC',
    });
    setThinkingConfig({
      enabled: body.thinkingConfig?.enabled ?? false,
      budgetTokens: body.thinkingConfig?.budgetTokens ?? 10000,
    });
    setReasoningConfig({
      enabled: body.reasoningConfig?.enabled ?? false,
      effort: body.reasoningConfig?.effort ?? 'medium',
    });
    setContextOverflowStrategy(body.contextOverflowStrategy ?? 'summarise');
    setCostBudget({
      dailyUsd: body.costBudget?.dailyUsd,
      monthlyUsd: body.costBudget?.monthlyUsd,
    });
    setMaxPromptTokens(body.maxPromptTokens ?? null);
    setOmnipresentMind(body.omnipresentMind ?? false);
    setStrictSystemPromptConfidentiality(body.strictSystemPromptConfidentiality);
    setKnowledgeMode(body.knowledgeMode ?? 'rag');
    setNotebookTokenBudget(body.notebookTokenBudget ?? null);
    setSetActiveOnSave(false);
    setEditing(p.id);
  };

  // Auto-open edit form when initialEditingId is provided (dedicated edit route)
  useEffect(() => {
    if (!initialEditingId || initialEditApplied.current) return;
    if (initialEditingId === 'new') {
      initialEditApplied.current = true;
      return; // already handled by initial useState
    }
    if (!personalities.length) return; // wait for data to load
    const target = personalities.find((p) => p.id === initialEditingId);
    if (target) {
      startEdit(target);
      initialEditApplied.current = true;
    }
  }, [initialEditingId, personalities]);

  const startCreate = () => {
    const body = {
      enabled: false,
      capabilities: [],
      heartEnabled: true,
      creationConfig: {
        skills: false,
        tasks: false,
        personalities: false,
        subAgents: false,
        customRoles: false,
        roleAssignments: false,
        experiments: false,
      },
    };
    setForm({
      name: '',
      description: '',
      systemPrompt: '',
      traits: { formality: 'balanced', humor: 'subtle', verbosity: 'concise' },
      sex: 'unspecified',
      voice: '',
      voiceProfileId: null,
      preferredLanguage: '',
      defaultModel: null,
      modelFallbacks: [],
      includeArchetypes: false,
      body,
    });
    setResourcePolicy({
      deletionMode: 'auto',
      automationLevel: 'supervised_auto',
      emergencyStop: false,
    });
    setCreationConfig({
      skills: false,
      tasks: false,
      personalities: false,
      subAgents: false,
      customRoles: false,
      roleAssignments: false,
      experiments: false,
      allowA2A: false,
      allowSwarms: false,
      allowDynamicTools: false,
      workflows: false,
    });
    setAllowConnections(false);
    setSelectedServers([]);
    setEnabledCaps({
      vision: false,
      limb_movement: false,
      auditory: false,
      haptic: false,
      vocalization: false,
      diagnostics: false,
    });
    setMcpFeatures({
      exposeGit: false,
      exposeFilesystem: false,
      exposeWeb: false,
      exposeWebScraping: false,
      exposeWebSearch: false,
      exposeBrowser: false,
      exposeDesktopControl: false,
      exposeNetworkDevices: false,
      exposeNetworkDiscovery: false,
      exposeNetworkAudit: false,
      exposeNetBox: false,
      exposeNvd: false,
      exposeNetworkUtils: false,
      exposeTwingateTools: false,
      exposeOrgIntentTools: false,
      exposeOrgKnowledgeBase: false,
      exposeGmail: false,
      exposeTwitter: false,
      exposeGithub: false,
      exposeDocker: false,
      exposeTerminal: false,
      exposeSynapse: false,
      exposeDelta: false,
      exposeVoice: false,
      exposeEdge: false,
    });
    setProactiveConfig({
      enabled: false,
      builtins: {
        dailyStandup: false,
        weeklySummary: false,
        contextualFollowup: false,
        integrationHealthAlert: false,
        securityAlertDigest: false,
      },
      builtinModes: {
        dailyStandup: 'auto',
        weeklySummary: 'suggest',
        contextualFollowup: 'suggest',
        integrationHealthAlert: 'auto',
        securityAlertDigest: 'suggest',
      },
      learning: { enabled: true, minConfidence: 0.7 },
    });
    setActiveHours({
      enabled: false,
      start: '09:00',
      end: '17:00',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
      timezone: 'UTC',
    });
    setThinkingConfig({ enabled: false, budgetTokens: 10000 });
    setReasoningConfig({ enabled: false, effort: 'medium' });
    setContextOverflowStrategy('summarise');
    setCostBudget({});
    setMaxPromptTokens(null);
    setOmnipresentMind(false);
    setStrictSystemPromptConfidentiality(undefined);
    setResourcePolicy({
      deletionMode: 'auto',
      automationLevel: 'supervised_auto',
      emergencyStop: false,
    });
    setSetActiveOnSave(false);
    setEditing('new');
  };

  const handleSave = () => {
    const capabilities = Object.entries(enabledCaps)
      .filter(([, enabled]) => enabled)
      .map(([cap]) => cap);
    const formWithBody = {
      ...form,
      body: {
        ...form.body,
        enabled: allowConnections,
        capabilities,
        heartEnabled: true,
        creationConfig,
        selectedServers,
        selectedIntegrations: integrationAccess.map((a) => a.id), // keep for backward compat
        integrationAccess,
        mcpFeatures,
        activeHours,
        thinkingConfig,
        ...(reasoningConfig.enabled ? { reasoningConfig } : {}),
        contextOverflowStrategy,
        ...(costBudget.dailyUsd || costBudget.monthlyUsd ? { costBudget } : {}),
        ...(maxPromptTokens !== null ? { maxPromptTokens } : {}),
        omnipresentMind,
        ...(strictSystemPromptConfidentiality !== undefined
          ? { strictSystemPromptConfidentiality }
          : {}),
        knowledgeMode,
        ...(notebookTokenBudget !== null ? { notebookTokenBudget } : {}),
        resourcePolicy,
      },
      brainConfig: {
        proactiveConfig,
      },
    };
    if (editing === 'new') {
      createMut.mutate(formWithBody);
    } else if (editing) {
      updateMut.mutate({ id: editing, data: formWithBody });
    }
  };

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMut.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMut]);

  const editingPersonality =
    editing && editing !== 'new' ? personalities.find((p) => p.id === editing) : null;

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Delete locked message */}
      {deleteLockedMsg && (
        <div className="card p-3 border-warning bg-warning/10 text-warning-foreground text-sm flex items-center justify-between">
          <span>{deleteLockedMsg}</span>
          <button
            onClick={() => {
              setDeleteLockedMsg(null);
            }}
            className="btn-ghost p-1 ml-2"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Personality"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />

      {/* Header — hidden in dedicated edit route */}
      {!initialEditingId && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Personalities</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Define the agents that power your assistant
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost flex items-center gap-1 text-sm"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.md,.json';
                input.onchange = async () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  try {
                    await importPersonality(file);
                    void queryClient.invalidateQueries({ queryKey: ['personalities'] });
                  } catch {
                    /* toast handled by query invalidation */
                  }
                };
                input.click();
              }}
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button
              onClick={() => {
                setShowWizard(true);
              }}
              className="btn btn-ghost flex items-center justify-center gap-1 text-sm sm:text-base"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Wizard</span>
            </button>
            <button
              onClick={startCreate}
              className="btn btn-ghost flex items-center justify-center gap-1 text-sm sm:text-base"
            >
              <Plus className="w-4 h-4" /> <span className="sm:hidden">New</span>
              <span className="hidden sm:inline">New Personality</span>
            </button>
          </div>
        </div>
      )}

      {showWizard && (
        <div className="card p-6 mb-4">
          <Suspense
            fallback={
              <div className="text-center py-8 text-muted-foreground">Loading wizard...</div>
            }
          >
            <PersonalityWizard
              onComplete={() => {
                setShowWizard(false);
              }}
              onCancel={() => {
                setShowWizard(false);
              }}
            />
          </Suspense>
        </div>
      )}

      {activateError && (
        <div className="card p-3 border-destructive bg-destructive/10 text-destructive text-sm flex items-center justify-between">
          <span>{activateError}</span>
          <button
            onClick={() => {
              setActivateError(null);
            }}
            className="btn-ghost p-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}

      {/* Editor Form */}
      {editing && (
        <div className="card p-3 sm:p-4 space-y-4 border-primary overflow-x-hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium truncate">
                {editing === 'new' ? 'Create Personality' : form.name?.trim() || 'Edit Personality'}
              </h3>
              {editingPersonality?.isDefault && (
                <p className="text-xs text-primary flex items-center gap-1 mt-0.5">
                  <Star className="w-3 h-3 fill-current flex-shrink-0" />
                  Default — used for new chats and the dashboard
                </p>
              )}
            </div>
          </div>

          {/* Soul Section */}
          <CollapsibleSection title="Soul — Essence" defaultOpen>
            {editingPersonality && editing !== 'new' && (
              <AvatarUpload
                personality={editingPersonality}
                onUpdated={() => {
                  void queryClient.invalidateQueries({ queryKey: ['personalities'] });
                }}
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Identity</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }));
                  }}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Physiognomy (Gender)</label>
                <select
                  value={form.sex}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, sex: e.target.value as PersonalityCreate['sex'] }));
                  }}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {SEX_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Identity Abstract</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => {
                  setForm((f) => ({ ...f, description: e.target.value }));
                }}
                className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                maxLength={1000}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Core Heuristics</label>
              <PresenceBanner users={systemPromptPresence} />
              <textarea
                value={collabDocId ? collabSystemPrompt : form.systemPrompt}
                onChange={(e) => {
                  const val = e.target.value;
                  if (collabDocId) {
                    onCollabSystemPromptChange(val);
                    setForm((f) => ({ ...f, systemPrompt: val }));
                  } else {
                    setForm((f) => ({ ...f, systemPrompt: val }));
                  }
                }}
                className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                rows={4}
                maxLength={8000}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {(
                  (collabDocId ? collabSystemPrompt : form.systemPrompt)?.length ?? 0
                ).toLocaleString()}{' '}
                / 8,000 chars
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm">Ontostasis</span>
                <span className="text-xs text-muted-foreground">
                  Locks this personality's existence — prevents any AI-initiated deletion. Only a
                  human admin can remove it from the dashboard
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={resourcePolicy.deletionMode === 'manual'}
                  onChange={(e) => {
                    setResourcePolicy((r) => ({
                      ...r,
                      deletionMode: e.target.checked ? 'manual' : 'auto',
                    }));
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm">Protostasis</span>
                <span className="text-xs text-muted-foreground">
                  {editing === 'new'
                    ? 'Make this personality the first presence — the one that greets every new chat and anchors the dashboard'
                    : 'This personality is the first presence — it anchors every new chat and the dashboard default'}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    editing === 'new' ? setActiveOnSave : (editingPersonality?.isDefault ?? false)
                  }
                  onChange={(e) => {
                    if (editing === 'new') {
                      setSetActiveOnSave(e.target.checked);
                    } else if (
                      e.target.checked &&
                      editingPersonality &&
                      !editingPersonality.isDefault
                    ) {
                      setDefaultMut.mutate(editingPersonality.id);
                    } else if (!e.target.checked && editingPersonality?.isDefault) {
                      clearDefaultMut.mutate();
                    }
                  }}
                  disabled={setDefaultMut.isPending || clearDefaultMut.isPending}
                  aria-label="Default personality"
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
              </label>
            </div>

            <DispositionEditor
              traits={form.traits ?? {}}
              onChange={(traits) => {
                setForm((f) => ({ ...f, traits }));
              }}
            />
          </CollapsibleSection>

          {/* Spirit Section */}
          <SpiritSection
            includeArchetypes={form.includeArchetypes ?? true}
            onIncludeArchetypesChange={(v) => {
              setForm((f) => ({ ...f, includeArchetypes: v }));
            }}
            empathyResonance={form.empathyResonance ?? false}
            onEmpathyResonanceChange={(v) => {
              setForm((f) => ({ ...f, empathyResonance: v }));
            }}
          />

          {/* Brain Section */}
          <BrainSection
            personalityId={editing !== 'new' ? editing : null}
            activeHours={activeHours}
            onActiveHoursChange={setActiveHours}
            thinkingConfig={thinkingConfig}
            onThinkingConfigChange={setThinkingConfig}
            reasoningConfig={reasoningConfig}
            onReasoningConfigChange={setReasoningConfig}
            contextOverflowStrategy={contextOverflowStrategy}
            onContextOverflowStrategyChange={setContextOverflowStrategy}
            costBudget={costBudget}
            onCostBudgetChange={setCostBudget}
            maxPromptTokens={maxPromptTokens}
            onMaxPromptTokensChange={setMaxPromptTokens}
            globalMaxPromptTokens={soulConfig?.maxPromptTokens ?? 16000}
            exposeOrgIntentTools={mcpFeatures.exposeOrgIntentTools}
            onExposeOrgIntentToolsChange={(v) => {
              setMcpFeatures((f) => ({ ...f, exposeOrgIntentTools: v }));
            }}
            orgIntentMcpEnabled={securityPolicy?.allowIntentEditor ?? false}
            orgKnowledgeBase={mcpFeatures.exposeOrgKnowledgeBase ?? false}
            onOrgKnowledgeBaseChange={(v) => {
              setMcpFeatures((f) => ({ ...f, exposeOrgKnowledgeBase: v }));
            }}
            orgEnabled={securityPolicy?.allowOrgIntent ?? false}
            omnipresentMind={omnipresentMind}
            onOmnipresentMindChange={setOmnipresentMind}
            strictSystemPromptConfidentiality={strictSystemPromptConfidentiality ?? false}
            onStrictSystemPromptConfidentialityChange={setStrictSystemPromptConfidentiality}
            knowledgeMode={knowledgeMode}
            onKnowledgeModeChange={setKnowledgeMode}
            notebookTokenBudget={notebookTokenBudget}
            onNotebookTokenBudgetChange={setNotebookTokenBudget}
            injectDateTime={form.injectDateTime ?? false}
            onInjectDateTimeChange={(v) => {
              setForm((f) => ({ ...f, injectDateTime: v }));
            }}
            communityEnabled={securityPolicy?.allowCommunityGitFetch ?? false}
            defaultModel={form.defaultModel ?? null}
            onDefaultModelChange={(v) => {
              setForm((f) => ({ ...f, defaultModel: v }));
            }}
            modelFallbacks={form.modelFallbacks ?? []}
            onModelFallbacksChange={(v) => {
              setForm((f) => ({ ...f, modelFallbacks: v }));
            }}
            proactiveConfig={proactiveConfig}
            onProactiveConfigChange={setProactiveConfig}
            modelData={modelData}
          />

          {/* Body Section */}
          <BodySection
            voice={form.voice ?? ''}
            onVoiceChange={(v) => {
              setForm((f) => ({ ...f, voice: v }));
            }}
            voiceProfileId={form.voiceProfileId ?? null}
            onVoiceProfileIdChange={(v) => {
              setForm((f) => ({ ...f, voiceProfileId: v }));
            }}
            preferredLanguage={form.preferredLanguage ?? ''}
            onPreferredLanguageChange={(v) => {
              setForm((f) => ({ ...f, preferredLanguage: v }));
            }}
            allowConnections={allowConnections}
            onAllowConnectionsChange={setAllowConnections}
            selectedServers={selectedServers}
            onSelectedServersChange={setSelectedServers}
            integrationAccess={integrationAccess}
            onIntegrationAccessChange={setIntegrationAccess}
            enabledCaps={enabledCaps}
            onEnabledCapsChange={setEnabledCaps}
            mcpFeatures={mcpFeatures}
            onMcpFeaturesChange={setMcpFeatures}
            creationConfig={creationConfig}
            onCreationConfigChange={setCreationConfig}
            resourcePolicy={resourcePolicy}
            onResourcePolicyChange={setResourcePolicy}
          />

          {/* Heart Section */}
          <HeartSection />

          {/* Version History (Phase 114) */}
          {editing && editing !== 'new' && (
            <CollapsibleSection title="Version History" defaultOpen={false}>
              <Suspense fallback={<div className="p-4 text-gray-500">Loading...</div>}>
                <PersonalityVersionHistory personalityId={editing} />
              </Suspense>
            </CollapsibleSection>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setEditing(null);
                setSetActiveOnSave(false);
                if (onBack) onBack();
              }}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.name?.trim() || createMut.isPending || updateMut.isPending}
              className="btn btn-ghost"
            >
              {createMut.isPending || updateMut.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Personality List — hidden when in dedicated edit route */}
      {!initialEditingId && (
        <div className="space-y-3">
          {personalities.map((p) => (
            <div key={p.id}>
              <div
                className={`card overflow-hidden ${p.isDefault ? 'border-primary ring-1 ring-primary/20' : ''} hover:shadow-md transition-shadow`}
              >
                <div className="flex">
                  {/* Full-height avatar panel */}
                  <div
                    className={`relative flex-shrink-0 w-20 sm:w-24 self-stretch ${p.isDefault ? 'bg-primary/10' : 'bg-muted'}`}
                  >
                    {p.avatarUrl ? (
                      <img
                        src={resolveAvatarSrc(p.avatarUrl, p.updatedAt)!}
                        alt={p.name}
                        className="absolute inset-0 w-full h-full object-cover object-center scale-125"
                        style={{ maxWidth: 'none', maxHeight: 'none' }}
                      />
                    ) : (
                      <div
                        className={`absolute inset-0 flex items-center justify-center ${p.isDefault ? 'text-primary' : 'text-muted-foreground'}`}
                      >
                        <Bot className="w-8 h-8 sm:w-10 sm:h-10" />
                      </div>
                    )}
                  </div>

                  {/* Content panel */}
                  <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col gap-2">
                    {/* Header with name and actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-medium text-sm sm:text-base truncate">{p.name}</h3>
                          {p.isActive && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                              Active
                            </span>
                          )}
                          {p.isDefault && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                              <Star className="w-2.5 h-2.5 fill-current" /> Default
                            </span>
                          )}
                          {p.isWithinActiveHours && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400"
                              title="Within active hours"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                              Online
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground hidden sm:block">
                          {formatDate(p.createdAt)}
                        </p>
                      </div>

                      {/* Actions - always visible */}
                      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                        {/* Set / clear default */}
                        {p.isDefault ? (
                          <button
                            onClick={() => {
                              clearDefaultMut.mutate();
                            }}
                            disabled={clearDefaultMut.isPending}
                            className="btn-ghost p-1.5 sm:p-2 text-primary hover:text-muted-foreground rounded-lg"
                            title="Remove as default"
                            aria-label="Remove default personality"
                          >
                            <Star className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setDefaultMut.mutate(p.id);
                            }}
                            disabled={setDefaultMut.isPending}
                            className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-primary rounded-lg"
                            title={`Set ${p.name} as default`}
                            aria-label={`Set ${p.name} as default personality`}
                          >
                            <Star className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        )}
                        {/* Enable / disable */}
                        {p.isActive ? (
                          p.isDefault ? (
                            <span
                              className="p-1.5 sm:p-2 text-green-500"
                              title="Active — default personality is always on"
                            >
                              <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                disableMut.mutate(p.id);
                              }}
                              disabled={disableMut.isPending}
                              className="btn-ghost p-1.5 sm:p-2 text-green-500 hover:text-muted-foreground rounded-lg"
                              title={`Disable ${p.name}`}
                              aria-label={`Disable personality ${p.name}`}
                            >
                              <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => {
                              enableMut.mutate(p.id);
                            }}
                            disabled={enableMut.isPending}
                            className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-green-500 rounded-lg"
                            title={`Enable ${p.name}`}
                            aria-label={`Enable personality ${p.name}`}
                          >
                            <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            void (async () => {
                              try {
                                const blob = await exportPersonality(p.id, 'md');
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${p.name}.md`;
                                a.click();
                                URL.revokeObjectURL(url);
                              } catch {
                                /* ignore */
                              }
                            })();
                          }}
                          className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-foreground rounded-lg"
                          title={`Export ${p.name}`}
                          aria-label={`Export personality ${p.name}`}
                        >
                          <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                        <button
                          onClick={() => {
                            startEdit(p);
                          }}
                          className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-foreground rounded-lg"
                          title={`Edit ${p.name}`}
                          aria-label={`Edit personality ${p.name}`}
                        >
                          <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                        <button
                          onClick={() => {
                            const mode = p.body?.resourcePolicy?.deletionMode ?? 'auto';
                            if (mode === 'manual') {
                              setDeleteLockedMsg(
                                `"${p.name}" has deletion locked (Manual mode). Change the deletion mode in Body → Resources to delete it.`
                              );
                            } else {
                              setDeleteTarget(p);
                            }
                          }}
                          disabled={p.isActive || deleteMut.isPending}
                          className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 rounded-lg"
                          title={
                            p.isActive
                              ? 'Deactivate this personality before deleting'
                              : p.body?.resourcePolicy?.deletionMode === 'manual'
                                ? 'Deletion locked — change mode in Body → Resources'
                                : `Delete ${p.name}`
                          }
                          aria-label={
                            p.isActive
                              ? 'Cannot delete active personality — deactivate first'
                              : `Delete personality ${p.name}`
                          }
                        >
                          <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Description */}
                    {p.description && (
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {p.description}
                      </p>
                    )}

                    {/* Tags row — sex badge first if set */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {p.sex !== 'unspecified' && (
                        <span className="text-[10px] sm:text-xs bg-muted px-2 py-0.5 rounded-full capitalize">
                          {p.sex}
                        </span>
                      )}
                      {Object.entries(p.traits)
                        .slice(0, 2)
                        .map(([k, v]) => (
                          <span
                            key={k}
                            className="text-[10px] sm:text-xs bg-muted px-2 py-0.5 rounded-full"
                          >
                            {k}: {v}
                          </span>
                        ))}
                      {Object.keys(p.traits).length > 2 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{Object.keys(p.traits).length - 2}
                        </span>
                      )}
                      {p.defaultModel && (
                        <span className="text-[10px] sm:text-xs bg-muted/50 px-2 py-0.5 rounded-full text-muted-foreground ml-auto">
                          {p.defaultModel.provider}
                        </span>
                      )}
                    </div>

                    {/* Mobile-only created date */}
                    <p className="text-[10px] text-muted-foreground sm:hidden">
                      Created {formatDate(p.createdAt)}
                    </p>

                    {/* Preview button */}
                    <button
                      onClick={() => {
                        setPreviewId(previewId === p.id ? null : p.id);
                      }}
                      className={`text-xs flex items-center justify-center gap-1 py-1.5 px-2 rounded border transition-colors ${
                        previewId === p.id
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      {previewId === p.id ? 'Hide Preview' : 'Preview Prompt'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Per-personality Prompt Preview */}
              {previewId === p.id && preview && (
                <div className="card p-3 sm:p-4 mt-2 border-muted bg-muted/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                    <h3 className="font-medium text-sm">System Prompt Preview</h3>
                    <div className="flex gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>{preview.charCount.toLocaleString()} chars</span>
                      <span>~{preview.estimatedTokens.toLocaleString()} tokens</span>
                      {preview.tools.length > 0 && <span>{preview.tools.length} tools</span>}
                    </div>
                  </div>
                  <pre className="text-[10px] sm:text-xs bg-background p-2 sm:p-3 rounded border overflow-auto max-h-40 sm:max-h-64 whitespace-pre-wrap font-mono">
                    {preview.prompt}
                  </pre>
                </div>
              )}
            </div>
          ))}

          {!isLoading && personalities.length === 0 && (
            <div className="col-span-full">
              <div className="text-center py-12 px-4 bg-muted/30 rounded-lg border border-dashed">
                <User className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground mb-2">No personalities yet</p>
                <p className="text-sm text-muted-foreground/70">
                  Create your first personality to get started
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Route-split views ─────────────────────────────────────────────────────────

/**
 * PersonalityView — list-only route (/personality).
 * Navigates to /personality/new or /personality/:id/edit instead of
 * rendering the edit form inline.
 */
export function PersonalityView() {
  const navigate = useNavigate();

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Personality | null>(null);
  const [deleteLockedMsg, setDeleteLockedMsg] = useState<string | null>(null);

  const {
    deleteMut,
    activateMut,
    enableMut,
    disableMut,
    setDefaultMut,
    clearDefaultMut,
    activateError,
    setActivateError,
  } = usePersonalityMutations();

  const { data: personalitiesData, isLoading } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });
  const personalities = personalitiesData?.personalities ?? [];

  const { data: preview } = useQuery({
    queryKey: ['promptPreview', previewId],
    queryFn: () => fetchPromptPreview(previewId!),
    enabled: !!previewId,
  });

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMut.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMut]);

  void activateMut;

  return (
    <div className="space-y-6 overflow-x-hidden">
      {deleteLockedMsg && (
        <div className="card p-3 border-warning bg-warning/10 text-warning-foreground text-sm flex items-center justify-between">
          <span>{deleteLockedMsg}</span>
          <button
            onClick={() => {
              setDeleteLockedMsg(null);
            }}
            className="btn-ghost p-1 ml-2"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Personality"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Personalities</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define the agents that power your assistant
          </p>
        </div>
        <button
          onClick={() => void navigate('/personality/new')}
          className="btn btn-ghost flex items-center justify-center gap-1 text-sm sm:text-base"
        >
          <Plus className="w-4 h-4" />
          <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">New Personality</span>
        </button>
      </div>

      {activateError && (
        <div className="card p-3 border-destructive bg-destructive/10 text-destructive text-sm flex items-center justify-between">
          <span>{activateError}</span>
          <button
            onClick={() => {
              setActivateError(null);
            }}
            className="btn-ghost p-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}

      <div className="space-y-3">
        {personalities.map((p) => (
          <div key={p.id}>
            <div
              className={`card overflow-hidden ${p.isDefault ? 'border-primary ring-1 ring-primary/20' : ''} hover:shadow-md transition-shadow`}
            >
              <div className="flex">
                <div
                  className={`relative flex-shrink-0 w-20 sm:w-24 self-stretch ${p.isDefault ? 'bg-primary/10' : 'bg-muted'}`}
                >
                  {p.avatarUrl ? (
                    <img
                      src={resolveAvatarSrc(p.avatarUrl, p.updatedAt)!}
                      alt={p.name}
                      className="absolute inset-0 w-full h-full object-cover object-center scale-125"
                      style={{ maxWidth: 'none', maxHeight: 'none' }}
                    />
                  ) : (
                    <div
                      className={`absolute inset-0 flex items-center justify-center ${p.isDefault ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      <Bot className="w-8 h-8 sm:w-10 sm:h-10" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 p-3 sm:p-4 pl-5 sm:pl-6 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-medium text-sm sm:text-base truncate">{p.name}</h3>
                        {p.isActive && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                            Active
                          </span>
                        )}
                        {p.isDefault && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                            <Star className="w-2.5 h-2.5 fill-current" /> Default
                          </span>
                        )}
                        {p.isWithinActiveHours && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400"
                            title="Within active hours"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                            Online
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground hidden sm:block">
                        {formatDate(p.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                      {p.isDefault ? (
                        <button
                          onClick={() => {
                            clearDefaultMut.mutate();
                          }}
                          disabled={clearDefaultMut.isPending}
                          className="btn-ghost p-1.5 sm:p-2 text-primary hover:text-muted-foreground rounded-lg"
                          title="Remove as default"
                        >
                          <Star className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setDefaultMut.mutate(p.id);
                          }}
                          disabled={setDefaultMut.isPending}
                          className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-primary rounded-lg"
                          title={`Set ${p.name} as default`}
                        >
                          <Star className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      )}
                      {p.isActive ? (
                        p.isDefault ? (
                          <span
                            className="p-1.5 sm:p-2 text-green-500"
                            title="Active — default personality is always on"
                          >
                            <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              disableMut.mutate(p.id);
                            }}
                            disabled={disableMut.isPending}
                            className="btn-ghost p-1.5 sm:p-2 text-green-500 hover:text-muted-foreground rounded-lg"
                            title={`Disable ${p.name}`}
                          >
                            <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => {
                            enableMut.mutate(p.id);
                          }}
                          disabled={enableMut.isPending}
                          className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-green-500 rounded-lg"
                          title={`Enable ${p.name}`}
                        >
                          <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => void navigate(`/personality/${p.id}/edit`)}
                        className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-foreground rounded-lg"
                        title={`Edit ${p.name}`}
                      >
                        <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                      <button
                        onClick={() => {
                          const mode = p.body?.resourcePolicy?.deletionMode ?? 'auto';
                          if (mode === 'manual') {
                            setDeleteLockedMsg(
                              `"${p.name}" has deletion locked (Manual mode). Change the deletion mode in Body → Resources to delete it.`
                            );
                          } else {
                            setDeleteTarget(p);
                          }
                        }}
                        disabled={p.isActive || deleteMut.isPending}
                        className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 rounded-lg"
                        title={
                          p.isActive
                            ? 'Deactivate this personality before deleting'
                            : `Delete ${p.name}`
                        }
                      >
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  </div>

                  {p.description && (
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.sex !== 'unspecified' && (
                      <span className="text-[10px] sm:text-xs bg-muted px-2 py-0.5 rounded-full capitalize">
                        {p.sex}
                      </span>
                    )}
                    {Object.entries(p.traits)
                      .slice(0, 2)
                      .map(([k, v]) => (
                        <span
                          key={k}
                          className="text-[10px] sm:text-xs bg-muted px-2 py-0.5 rounded-full"
                        >
                          {k}: {v}
                        </span>
                      ))}
                    {Object.keys(p.traits).length > 2 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{Object.keys(p.traits).length - 2}
                      </span>
                    )}
                    {p.defaultModel && (
                      <span className="text-[10px] sm:text-xs bg-muted/50 px-2 py-0.5 rounded-full text-muted-foreground ml-auto">
                        {p.defaultModel.provider}
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-muted-foreground sm:hidden">
                    Created {formatDate(p.createdAt)}
                  </p>

                  <button
                    onClick={() => {
                      setPreviewId(previewId === p.id ? null : p.id);
                    }}
                    className={`text-xs flex items-center justify-center gap-1 py-1.5 px-2 rounded border transition-colors ${
                      previewId === p.id
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                    }`}
                  >
                    <Eye className="w-3 h-3" />
                    {previewId === p.id ? 'Hide Preview' : 'Preview Prompt'}
                  </button>
                </div>
              </div>
            </div>

            {previewId === p.id && preview && (
              <div className="card p-3 sm:p-4 mt-2 border-muted bg-muted/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                  <h3 className="font-medium text-sm">System Prompt Preview</h3>
                  <div className="flex gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{preview.charCount.toLocaleString()} chars</span>
                    <span>~{preview.estimatedTokens.toLocaleString()} tokens</span>
                    {preview.tools.length > 0 && <span>{preview.tools.length} tools</span>}
                  </div>
                </div>
                <pre className="text-[10px] sm:text-xs bg-background p-2 sm:p-3 rounded border overflow-auto max-h-40 sm:max-h-64 whitespace-pre-wrap font-mono">
                  {preview.prompt}
                </pre>
              </div>
            )}
          </div>
        ))}

        {!isLoading && personalities.length === 0 && (
          <div className="col-span-full">
            <div className="text-center py-12 px-4 bg-muted/30 rounded-lg border border-dashed">
              <User className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground mb-2">No personalities yet</p>
              <p className="text-sm text-muted-foreground/70">
                Create your first personality to get started
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * PersonalityEditPage — full-page edit/create route.
 * /personality/new        → create new personality
 * /personality/:id/edit   → edit existing personality
 * Renders PersonalityEditor (full form) with a Back button header.
 */
export function PersonalityEditPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => void navigate('/personality')}
          className="btn btn-ghost flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Personalities
        </button>
      </div>
      {/* Embed full PersonalityEditor with the target personality pre-opened.
          The editor's own cancel/save logic closes the form by setting editing=null;
          we intercept that via the ?expand search param so the full form renders. */}
      <_PersonalityEditorWithId id={id ?? 'new'} onBack={() => void navigate('/personality')} />
    </div>
  );
}

function _PersonalityEditorWithId({ id, onBack }: { id: string; onBack: () => void }) {
  // Mount PersonalityEditor and immediately open the right personality.
  // We use a key to force fresh mount when id changes.
  return <PersonalityEditorForced key={id} editingId={id} onBack={onBack} />;
}

/**
 * PersonalityEditorForced — mounts PersonalityEditor and opens the target
 * personality via a synthetic ?create=true or by matching the personality id.
 * Uses a thin wrapper that forwards the back-nav when done.
 */
function PersonalityEditorForced({ editingId, onBack }: { editingId: string; onBack: () => void }) {
  return <PersonalityEditor initialEditingId={editingId} onBack={onBack} />;
}
