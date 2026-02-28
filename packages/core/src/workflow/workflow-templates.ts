/**
 * Built-in Workflow Templates
 *
 * Three starter workflows seeded at startup.
 */

import type { WorkflowDefinitionCreate } from '@secureyeoman/shared';

export const BUILTIN_WORKFLOW_TEMPLATES: WorkflowDefinitionCreate[] = [
  // ── 1. Research Report Pipeline ──────────────────────────────
  {
    name: 'research-report-pipeline',
    description:
      'Sequential pipeline: researcher gathers info, analyst synthesises, transform formats the report, then saves to memory.',
    steps: [
      {
        id: 'researcher',
        type: 'agent',
        name: 'Researcher',
        description: 'Gather relevant information on the topic',
        config: {
          profile: 'researcher',
          taskTemplate: 'Research the following topic thoroughly: {{input.topic}}',
        },
        dependsOn: [],
        onError: 'fail',
      },
      {
        id: 'analyst',
        type: 'agent',
        name: 'Analyst',
        description: 'Analyse and synthesise the research findings',
        config: {
          profile: 'analyst',
          taskTemplate:
            'Analyse and synthesise the following research findings into a structured report:\n\n{{steps.researcher.output}}',
        },
        dependsOn: ['researcher'],
        onError: 'fail',
      },
      {
        id: 'format',
        type: 'transform',
        name: 'Format Report',
        description: 'Format the analysed output as a markdown report',
        config: {
          outputTemplate:
            '# Research Report\n\n**Topic**: {{input.topic}}\n\n{{steps.analyst.output}}',
        },
        dependsOn: ['analyst'],
        onError: 'continue',
      },
      {
        id: 'save',
        type: 'resource',
        name: 'Save to Memory',
        description: 'Persist the report as a memory entry',
        config: {
          resourceType: 'memory',
          dataTemplate: '{{steps.format.output}}',
        },
        dependsOn: ['format'],
        onError: 'continue',
      },
    ],
    edges: [
      { source: 'researcher', target: 'analyst' },
      { source: 'analyst', target: 'format' },
      { source: 'format', target: 'save' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // ── 2. Code Review + Webhook Notification ────────────────────
  {
    name: 'code-review-webhook',
    description:
      'Runs the code-review swarm, checks the result, and notifies a webhook with pass/fail.',
    steps: [
      {
        id: 'review',
        type: 'swarm',
        name: 'Code Review Swarm',
        description: 'Execute the built-in code-review swarm',
        config: {
          templateId: 'code-review',
          taskTemplate: '{{input.code}}',
          contextTemplate: 'PR: {{input.prTitle}}',
        },
        dependsOn: [],
        onError: 'fail',
      },
      {
        id: 'check',
        type: 'condition',
        name: 'Check Result',
        description: 'Branch based on whether review passed',
        config: {
          expression:
            'steps.review.output && steps.review.output.includes && steps.review.output.includes("LGTM")',
          trueBranchStepId: 'notify-pass',
          falseBranchStepId: 'notify-fail',
        },
        dependsOn: ['review'],
        onError: 'continue',
      },
      {
        id: 'notify-pass',
        type: 'webhook',
        name: 'Notify Pass',
        description: 'Send pass notification to webhook',
        config: {
          url: '{{input.webhookUrl}}',
          method: 'POST',
          bodyTemplate:
            '{"status":"passed","pr":"{{input.prTitle}}","review":"{{steps.review.output}}"}',
        },
        dependsOn: ['check'],
        onError: 'continue',
      },
      {
        id: 'notify-fail',
        type: 'webhook',
        name: 'Notify Fail',
        description: 'Send fail notification to webhook',
        config: {
          url: '{{input.webhookUrl}}',
          method: 'POST',
          bodyTemplate:
            '{"status":"failed","pr":"{{input.prTitle}}","review":"{{steps.review.output}}"}',
        },
        dependsOn: ['check'],
        onError: 'continue',
      },
    ],
    edges: [
      { source: 'review', target: 'check' },
      { source: 'check', target: 'notify-pass', label: 'pass' },
      { source: 'check', target: 'notify-fail', label: 'fail' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // ── 4. Distill and Evaluate (Phase 73) ───────────────────────
  {
    name: 'distill-and-eval',
    description:
      'ML Pipeline: curate conversations → await distillation job completion → evaluate metrics → conditionally deploy if threshold met.',
    steps: [
      {
        id: 'curate',
        type: 'data_curation',
        name: 'Curate Dataset',
        description: 'Snapshot conversation data for distillation training',
        config: {
          outputDir: '{{input.outputDir}}',
          personalityIds: '{{input.personalityIds}}',
          minTurns: 2,
          maxConversations: 2000,
        },
        dependsOn: [],
        onError: 'fail',
      },
      {
        id: 'train',
        type: 'training_job',
        name: 'Distillation Job',
        description: 'Await completion of a pre-started distillation job',
        config: {
          jobType: 'distillation',
          jobId: '{{input.distillationJobId}}',
          timeoutMs: 7200000, // 2h
          pollIntervalMs: 30000,
        },
        dependsOn: ['curate'],
        onError: 'fail',
      },
      {
        id: 'eval',
        type: 'evaluation',
        name: 'Evaluate Model',
        description: 'Run evaluation suite against the distilled model endpoint',
        config: {
          datasetPath: '{{steps.curate.output.path}}',
          modelEndpoint: '{{input.modelEndpoint}}',
          maxSamples: 100,
        },
        dependsOn: ['train'],
        onError: 'continue',
      },
      {
        id: 'notify',
        type: 'webhook',
        name: 'Notify Results',
        description: 'Post evaluation results to notification webhook',
        config: {
          url: '{{input.webhookUrl}}',
          method: 'POST',
          bodyTemplate:
            '{"pipeline":"distill-and-eval","jobId":"{{input.distillationJobId}}","metrics":{{steps.eval.output.metrics}},"deployed":{{steps.deploy.output.deployed}}}',
        },
        dependsOn: ['eval'],
        onError: 'continue',
      },
    ],
    edges: [
      { source: 'curate', target: 'train' },
      { source: 'train', target: 'eval' },
      { source: 'eval', target: 'notify' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // ── 5. Finetune and Deploy (Phase 73) ────────────────────────
  {
    name: 'finetune-and-deploy',
    description:
      'ML Pipeline: curate dataset → run LoRA finetune → evaluate on held-out set → human approval → deploy to Ollama if eval passes.',
    steps: [
      {
        id: 'curate',
        type: 'data_curation',
        name: 'Curate Dataset',
        description: 'Snapshot conversation data for fine-tuning',
        config: {
          outputDir: '{{input.outputDir}}',
          personalityIds: '{{input.personalityIds}}',
          minTurns: 2,
          maxConversations: 5000,
        },
        dependsOn: [],
        onError: 'fail',
      },
      {
        id: 'finetune',
        type: 'training_job',
        name: 'LoRA Finetune',
        description: 'Start and await LoRA fine-tuning job',
        config: {
          jobType: 'finetune',
          jobId: '{{input.finetuneJobId}}',
          timeoutMs: 14400000, // 4h
          pollIntervalMs: 60000,
        },
        dependsOn: ['curate'],
        onError: 'fail',
      },
      {
        id: 'eval',
        type: 'evaluation',
        name: 'Evaluate Fine-Tuned Model',
        description: 'Measure model quality against held-out samples',
        config: {
          datasetPath: '{{input.evalDatasetPath}}',
          modelEndpoint: '{{input.modelEndpoint}}',
          maxSamples: 200,
        },
        dependsOn: ['finetune'],
        onError: 'continue',
      },
      {
        id: 'approve',
        type: 'human_approval',
        name: 'Human Approval Gate',
        description: 'Pause for human review of eval results before deploying',
        config: {
          timeoutMs: 86400000, // 24h
          reportTemplate:
            '{"jobId":"{{input.finetuneJobId}}","metrics":{{steps.eval.output.metrics}},"adapterPath":"{{steps.finetune.output.adapterPath}}"}',
        },
        dependsOn: ['eval'],
        onError: 'fail',
      },
      {
        id: 'deploy',
        type: 'conditional_deploy',
        name: 'Deploy if Eval Passes',
        description: 'Register adapter with Ollama when char_similarity ≥ threshold',
        config: {
          metricPath: 'steps.eval.output.metrics.char_similarity',
          threshold: 0.6,
          jobId: '{{input.finetuneJobId}}',
          ollamaUrl: '{{input.ollamaUrl}}',
          personalityId: '{{input.personalityId}}',
          modelVersion: '{{input.adapterName}}',
        },
        dependsOn: ['approve'],
        onError: 'continue',
      },
    ],
    edges: [
      { source: 'curate', target: 'finetune' },
      { source: 'finetune', target: 'eval' },
      { source: 'eval', target: 'approve' },
      { source: 'approve', target: 'deploy' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L3' as const,
  },

  // ── 6. DPO Loop (Phase 73) ────────────────────────────────────
  {
    name: 'dpo-loop',
    description:
      'ML Pipeline: curate preference data → distillation with DPO format → evaluate win rate → promote model if win-rate > 55%.',
    steps: [
      {
        id: 'curate',
        type: 'data_curation',
        name: 'Curate Preference Data',
        description: 'Snapshot high-quality conversations for DPO training',
        config: {
          outputDir: '{{input.outputDir}}',
          personalityIds: '{{input.personalityIds}}',
          minTurns: 3,
          maxConversations: 3000,
        },
        dependsOn: [],
        onError: 'fail',
      },
      {
        id: 'train',
        type: 'training_job',
        name: 'DPO Training',
        description: 'Await completion of DPO distillation job',
        config: {
          jobType: 'distillation',
          jobId: '{{input.dpoJobId}}',
          timeoutMs: 10800000, // 3h
          pollIntervalMs: 30000,
        },
        dependsOn: ['curate'],
        onError: 'fail',
      },
      {
        id: 'eval',
        type: 'evaluation',
        name: 'Win-Rate Evaluation',
        description: 'Compare DPO model to baseline via char_similarity proxy',
        config: {
          datasetPath: '{{steps.curate.output.path}}',
          modelEndpoint: '{{input.modelEndpoint}}',
          maxSamples: 150,
        },
        dependsOn: ['train'],
        onError: 'continue',
      },
      {
        id: 'promote',
        type: 'conditional_deploy',
        name: 'Promote if Win-Rate > 55%',
        description: 'Deploy DPO model when win-rate metric exceeds 55%',
        config: {
          metricPath: 'steps.eval.output.metrics.char_similarity',
          threshold: 0.55,
          jobId: '{{input.dpoJobId}}',
          ollamaUrl: '{{input.ollamaUrl}}',
          personalityId: '{{input.personalityId}}',
          modelVersion: '{{input.adapterName}}',
        },
        dependsOn: ['eval'],
        onError: 'continue',
      },
      {
        id: 'notify',
        type: 'webhook',
        name: 'Notify DPO Outcome',
        description: 'Report DPO loop result',
        config: {
          url: '{{input.webhookUrl}}',
          method: 'POST',
          bodyTemplate:
            '{"pipeline":"dpo-loop","promoted":{{steps.promote.output.deployed}},"winRate":{{steps.eval.output.metrics.char_similarity}},"threshold":0.55}',
        },
        dependsOn: ['promote'],
        onError: 'continue',
      },
    ],
    edges: [
      { source: 'curate', target: 'train' },
      { source: 'train', target: 'eval' },
      { source: 'eval', target: 'promote' },
      { source: 'promote', target: 'notify' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // ── 3. Parallel Intelligence Gather ──────────────────────────
  {
    name: 'parallel-intelligence-gather',
    description:
      'Three agents research in parallel, then an analyst synthesises all findings into knowledge.',
    steps: [
      {
        id: 'research-a',
        type: 'agent',
        name: 'Research A',
        description: 'Gather intelligence from angle A',
        config: {
          profile: 'researcher',
          taskTemplate: 'Research angle A for topic: {{input.topic}}',
        },
        dependsOn: [],
        onError: 'continue',
      },
      {
        id: 'research-b',
        type: 'agent',
        name: 'Research B',
        description: 'Gather intelligence from angle B',
        config: {
          profile: 'researcher',
          taskTemplate: 'Research angle B for topic: {{input.topic}}',
        },
        dependsOn: [],
        onError: 'continue',
      },
      {
        id: 'research-c',
        type: 'agent',
        name: 'Research C',
        description: 'Gather intelligence from angle C',
        config: {
          profile: 'researcher',
          taskTemplate: 'Research angle C for topic: {{input.topic}}',
        },
        dependsOn: [],
        onError: 'continue',
      },
      {
        id: 'synthesise',
        type: 'agent',
        name: 'Analyst — Synthesis',
        description: 'Synthesise all parallel research findings',
        config: {
          profile: 'analyst',
          taskTemplate:
            'Synthesise the following parallel research findings on "{{input.topic}}":\n\nAngle A:\n{{steps.research-a.output}}\n\nAngle B:\n{{steps.research-b.output}}\n\nAngle C:\n{{steps.research-c.output}}',
        },
        dependsOn: ['research-a', 'research-b', 'research-c'],
        onError: 'fail',
      },
      {
        id: 'save-knowledge',
        type: 'resource',
        name: 'Save to Knowledge Base',
        description: 'Store the synthesised intelligence as knowledge',
        config: {
          resourceType: 'knowledge',
          dataTemplate: '{{steps.synthesise.output}}',
        },
        dependsOn: ['synthesise'],
        onError: 'continue',
      },
    ],
    edges: [
      { source: 'research-a', target: 'synthesise' },
      { source: 'research-b', target: 'synthesise' },
      { source: 'research-c', target: 'synthesise' },
      { source: 'synthesise', target: 'save-knowledge' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },
];
