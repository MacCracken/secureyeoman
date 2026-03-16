import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchModelInfo,
  createProactiveTrigger,
  registerExtension,
  createUser,
  createWorkspace,
  addMemory,
  learnKnowledge,
  createIntent,
} from '../../api/client';
import type { DialogStep } from './types';

export function useWizardState(onClose: () => void) {
  const [step, setStep] = useState<DialogStep>('select');
  const [personality, setPersonality] = useState({ name: '', description: '', model: '' });
  const [task, setTask] = useState({ name: '', type: 'execute', description: '', input: '' });
  const [skill, setSkill] = useState({ name: '', description: '', trigger: '', action: '' });
  const [experiment, setExperiment] = useState({ name: '', description: '' });
  const [subAgent, setSubAgent] = useState({ name: '', description: '' });
  const [customRole, setCustomRole] = useState({ name: '', description: '' });
  const [proactive, setProactive] = useState({
    name: '',
    type: 'schedule' as 'schedule' | 'event' | 'pattern' | 'webhook' | 'llm',
    cron: '0 9 * * 1-5',
    eventType: '',
    actionType: 'message' as 'message' | 'remind',
    actionContent: '',
    approvalMode: 'suggest' as 'auto' | 'suggest' | 'manual',
  });

  const [extension, setExtension] = useState({
    id: '',
    name: '',
    version: '1.0.0',
    hooksText: '',
    error: '',
  });
  const [user, setUser] = useState({
    email: '',
    displayName: '',
    password: '',
    isAdmin: false,
    error: '',
  });
  const [workspace, setWorkspace] = useState({ name: '', description: '', error: '' });
  const [memory, setMemory] = useState({
    subtype: 'memory' as 'memory' | 'knowledge',
    // vector memory fields
    memType: 'semantic' as 'episodic' | 'semantic' | 'procedural' | 'preference',
    content: '',
    source: '',
    importance: 0.5,
    // knowledge base fields
    topic: '',
    knowledgeContent: '',
    error: '',
  });
  const [intent, setIntent] = useState({
    name: '',
    goals: [] as { id: string; name: string; description: string; priority: number }[],
    hardBoundaries: [] as { id: string; rule: string; rationale: string }[],
    policies: [] as {
      id: string;
      rule: string;
      enforcement: 'warn' | 'block';
      rationale: string;
    }[],
    importJson: '',
    importError: '',
    activeTab: 'basics' as 'basics' | 'boundaries' | 'policies' | 'import',
  });

  const reset = () => {
    setStep('select');
    setPersonality({ name: '', description: '', model: '' });
    setTask({ name: '', type: 'execute', description: '', input: '' });
    setSkill({ name: '', description: '', trigger: '', action: '' });
    setExperiment({ name: '', description: '' });
    setSubAgent({ name: '', description: '' });
    setCustomRole({ name: '', description: '' });
    setProactive({
      name: '',
      type: 'schedule',
      cron: '0 9 * * 1-5',
      eventType: '',
      actionType: 'message',
      actionContent: '',
      approvalMode: 'suggest',
    });
    setExtension({ id: '', name: '', version: '1.0.0', hooksText: '', error: '' });
    setUser({ email: '', displayName: '', password: '', isAdmin: false, error: '' });
    setWorkspace({ name: '', description: '', error: '' });
    setMemory({
      subtype: 'memory',
      memType: 'semantic',
      content: '',
      source: '',
      importance: 0.5,
      topic: '',
      knowledgeContent: '',
      error: '',
    });
    setIntent({
      name: '',
      goals: [],
      hardBoundaries: [],
      policies: [],
      importJson: '',
      importError: '',
      activeTab: 'basics',
    });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const goBack = () => {
    setStep('select');
  };

  const navigateTo = (path: string) => {
    handleClose();
    window.location.href = path;
  };

  const queryClient = useQueryClient();
  const createTriggerMut = useMutation({
    mutationFn: createProactiveTrigger,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proactive-triggers'] });
      handleClose();
    },
  });

  const registerExtensionMut = useMutation({
    mutationFn: registerExtension,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extensions'] });
      handleClose();
    },
    onError: (err) => {
      setExtension((e) => ({
        ...e,
        error: err instanceof Error ? err.message : 'Registration failed',
      }));
    },
  });

  const createUserMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-users'] });
      handleClose();
    },
    onError: (err) => {
      setUser((u) => ({
        ...u,
        error: err instanceof Error ? err.message : 'Failed to create user',
      }));
    },
  });

  const createWorkspaceMut = useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      handleClose();
    },
    onError: (err) => {
      setWorkspace((w) => ({
        ...w,
        error: err instanceof Error ? err.message : 'Failed to create workspace',
      }));
    },
  });

  const addMemoryMut = useMutation({
    mutationFn: addMemory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      handleClose();
    },
    onError: (err) => {
      setMemory((m) => ({
        ...m,
        error: err instanceof Error ? err.message : 'Failed to add memory',
      }));
    },
  });

  const learnKnowledgeMut = useMutation({
    mutationFn: ({ topic, content }: { topic: string; content: string }) =>
      learnKnowledge(topic, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      handleClose();
    },
    onError: (err) => {
      setMemory((m) => ({
        ...m,
        error: err instanceof Error ? err.message : 'Failed to save knowledge',
      }));
    },
  });

  const createIntentMut = useMutation({
    mutationFn: (doc: Record<string, unknown>) => createIntent(doc),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      handleClose();
      window.location.href = '/intent';
    },
    onError: (err) => {
      setIntent((s) => ({
        ...s,
        importError: err instanceof Error ? err.message : 'Failed to create intent',
      }));
    },
  });

  const { data: modelInfo } = useQuery({
    queryKey: ['modelInfo'],
    queryFn: fetchModelInfo,
  });

  const modelsByProvider = modelInfo?.available ?? {};

  return {
    step,
    setStep,
    personality,
    setPersonality,
    task,
    setTask,
    skill,
    setSkill,
    experiment,
    setExperiment,
    subAgent,
    setSubAgent,
    customRole,
    setCustomRole,
    proactive,
    setProactive,
    extension,
    setExtension,
    user,
    setUser,
    workspace,
    setWorkspace,
    memory,
    setMemory,
    intent,
    setIntent,
    handleClose,
    goBack,
    navigateTo,
    modelsByProvider,
    createTriggerMut,
    registerExtensionMut,
    createUserMut,
    createWorkspaceMut,
    addMemoryMut,
    learnKnowledgeMut,
    createIntentMut,
  };
}

export type WizardState = ReturnType<typeof useWizardState>;
