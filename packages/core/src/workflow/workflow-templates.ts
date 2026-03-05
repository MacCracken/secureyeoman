/**
 * Built-in Workflow Templates
 *
 * Three starter workflows seeded at startup.
 */

import type { WorkflowDefinitionCreateInput, WorkflowStep } from '@secureyeoman/shared';

// ── Template constants ───────────────────────────────────────────────────────
const DISTILLATION_MAX_CONVERSATIONS = 2000;
const DISTILLATION_TIMEOUT_MS = 7_200_000; // 2h
const DISTILLATION_POLL_INTERVAL_MS = 30_000;
const FINETUNE_MAX_CONVERSATIONS = 5000;
const FINETUNE_TIMEOUT_MS = 14_400_000; // 4h
const FINETUNE_POLL_INTERVAL_MS = 60_000;
const FINETUNE_QUALITY_THRESHOLD = 0.6;
const DPO_TIMEOUT_MS = 10_800_000; // 3h
const DPO_POLL_INTERVAL_MS = 30_000;
const DPO_WIN_RATE_THRESHOLD = 0.55;
const CI_WAIT_POLL_INTERVAL_MS = 15_000;
const CI_WAIT_TIMEOUT_MS = 1_800_000; // 30min

// ── Step builder helpers ───────────────────────────────────────────────────────
// Reduce repetitive step-object literals in template definitions.

type StepBase = Pick<WorkflowStep, 'id' | 'name' | 'dependsOn' | 'onError'> &
  Partial<Pick<WorkflowStep, 'description' | 'condition'>>;

function agentStep(
  base: StepBase,
  profile: string,
  taskTemplate: string,
  contextTemplate?: string
): WorkflowStep {
  return {
    type: 'agent',
    config: { profile, taskTemplate, ...(contextTemplate ? { contextTemplate } : {}) },
    ...base,
  } as unknown as WorkflowStep;
}

function transformStep(base: StepBase, outputTemplate: string): WorkflowStep {
  return { type: 'transform', config: { outputTemplate }, ...base } as unknown as WorkflowStep;
}

function resourceStep(base: StepBase, resourceType: string, dataTemplate: string): WorkflowStep {
  return {
    type: 'resource',
    config: { resourceType, dataTemplate },
    ...base,
  } as unknown as WorkflowStep;
}

function webhookStep(
  base: StepBase,
  url: string,
  bodyTemplate: string,
  method = 'POST'
): WorkflowStep {
  return {
    type: 'webhook',
    config: { url, method, bodyTemplate },
    ...base,
  } as unknown as WorkflowStep;
}

function swarmStep(
  base: StepBase,
  templateId: string,
  taskTemplate: string,
  contextTemplate?: string
): WorkflowStep {
  return {
    type: 'swarm',
    config: { templateId, taskTemplate, ...(contextTemplate ? { contextTemplate } : {}) },
    ...base,
  } as unknown as WorkflowStep;
}

function documentAnalysisStep(
  base: StepBase,
  analysisType: string,
  documentTemplate: string,
  outputFormat = 'markdown'
): WorkflowStep {
  return {
    type: 'document_analysis',
    config: { analysisType, documentTemplate, outputFormat },
    ...base,
  } as unknown as WorkflowStep;
}

function chartGenerationStep(
  base: StepBase,
  chartType: string,
  dataTemplate: string,
  chartConfig?: Record<string, unknown>
): WorkflowStep {
  return {
    type: 'chart_generation',
    config: { chartType, dataTemplate, ...(chartConfig ? { chartConfig } : {}) },
    ...base,
  } as unknown as WorkflowStep;
}

// ─────────────────────────────────────────────────────────────────────────────

export const BUILTIN_WORKFLOW_TEMPLATES: WorkflowDefinitionCreateInput[] = [
  // ── 1. Research Report Pipeline ──────────────────────────────
  {
    name: 'research-report-pipeline',
    description:
      'Sequential pipeline: researcher gathers info, analyst synthesises, transform formats the report, then saves to memory.',
    steps: [
      agentStep(
        {
          id: 'researcher',
          name: 'Researcher',
          description: 'Gather relevant information on the topic',
          dependsOn: [],
          onError: 'fail',
        },
        'researcher',
        'Research the following topic thoroughly: {{input.topic}}'
      ),
      agentStep(
        {
          id: 'analyst',
          name: 'Analyst',
          description: 'Analyse and synthesise the research findings',
          dependsOn: ['researcher'],
          onError: 'fail',
        },
        'analyst',
        'Analyse and synthesise the following research findings into a structured report:\n\n{{steps.researcher.output}}'
      ),
      transformStep(
        {
          id: 'format',
          name: 'Format Report',
          description: 'Format the analysed output as a markdown report',
          dependsOn: ['analyst'],
          onError: 'continue',
        },
        '# Research Report\n\n**Topic**: {{input.topic}}\n\n{{steps.analyst.output}}'
      ),
      resourceStep(
        {
          id: 'save',
          name: 'Save to Memory',
          description: 'Persist the report as a memory entry',
          dependsOn: ['format'],
          onError: 'continue',
        },
        'memory',
        '{{steps.format.output}}'
      ),
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
      swarmStep(
        {
          id: 'review',
          name: 'Code Review Swarm',
          description: 'Execute the built-in code-review swarm',
          dependsOn: [],
          onError: 'fail',
        },
        'code-review',
        '{{input.code}}',
        'PR: {{input.prTitle}}'
      ),
      {
        id: 'check',
        type: 'condition' as const,
        name: 'Check Result',
        description: 'Branch based on whether review passed',
        config: {
          expression:
            'steps.review.output && steps.review.output.includes && steps.review.output.includes("LGTM")',
          trueBranchStepId: 'notify-pass',
          falseBranchStepId: 'notify-fail',
        },
        dependsOn: ['review'],
        onError: 'continue' as const,
      },
      webhookStep(
        {
          id: 'notify-pass',
          name: 'Notify Pass',
          description: 'Send pass notification to webhook',
          dependsOn: ['check'],
          onError: 'continue',
        },
        '{{input.webhookUrl}}',
        '{"status":"passed","pr":"{{input.prTitle}}","review":"{{steps.review.output}}"}'
      ),
      webhookStep(
        {
          id: 'notify-fail',
          name: 'Notify Fail',
          description: 'Send fail notification to webhook',
          dependsOn: ['check'],
          onError: 'continue',
        },
        '{{input.webhookUrl}}',
        '{"status":"failed","pr":"{{input.prTitle}}","review":"{{steps.review.output}}"}'
      ),
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
          maxConversations: DISTILLATION_MAX_CONVERSATIONS,
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
          timeoutMs: DISTILLATION_TIMEOUT_MS,
          pollIntervalMs: DISTILLATION_POLL_INTERVAL_MS,
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
          maxConversations: FINETUNE_MAX_CONVERSATIONS,
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
          timeoutMs: FINETUNE_TIMEOUT_MS,
          pollIntervalMs: FINETUNE_POLL_INTERVAL_MS,
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
          threshold: FINETUNE_QUALITY_THRESHOLD,
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
          timeoutMs: DPO_TIMEOUT_MS,
          pollIntervalMs: DPO_POLL_INTERVAL_MS,
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
          threshold: DPO_WIN_RATE_THRESHOLD,
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

  // ── CI/CD Templates (Phase 90) ────────────────────────────────

  // ── pr-ci-triage ──────────────────────────────────────────────
  {
    name: 'pr-ci-triage',
    description:
      'CI/CD: Trigger a GitHub Actions workflow, wait for completion, then have an agent analyse any failure and post the diagnosis as a PR comment via webhook.',
    steps: [
      {
        id: 'trigger',
        type: 'ci_trigger',
        name: 'Trigger CI',
        description: 'Dispatch the GitHub Actions workflow on the PR branch',
        config: {
          provider: 'github-actions',
          owner: '{{input.owner}}',
          repo: '{{input.repo}}',
          ref: '{{input.ref}}',
          workflowId: '{{input.workflowId}}',
        },
        dependsOn: [],
        onError: 'fail',
      },
      {
        id: 'wait',
        type: 'ci_wait',
        name: 'Wait for CI',
        description: 'Poll until the workflow run reaches a terminal state',
        config: {
          provider: 'github-actions',
          owner: '{{input.owner}}',
          repo: '{{input.repo}}',
          runId: '{{steps.trigger.output.runId}}',
          pollIntervalMs: CI_WAIT_POLL_INTERVAL_MS,
          timeoutMs: CI_WAIT_TIMEOUT_MS,
        },
        dependsOn: ['trigger'],
        onError: 'continue',
      },
      {
        id: 'check',
        type: 'condition',
        name: 'Check Conclusion',
        description: 'Branch on CI conclusion',
        config: {
          expression: 'steps.wait.output && steps.wait.output.conclusion === "success"',
          trueBranchStepId: 'notify-pass',
          falseBranchStepId: 'analyse-failure',
        },
        dependsOn: ['wait'],
        onError: 'continue',
      },
      {
        id: 'analyse-failure',
        type: 'agent',
        name: 'Analyse Failure',
        description: 'Read the log URL and produce a concise diagnosis with suggested fixes',
        config: {
          profile: 'default',
          taskTemplate:
            'The GitHub Actions workflow run {{steps.wait.output.runId}} for {{input.owner}}/{{input.repo}} on ref {{input.ref}} failed.\n\nLogs URL: {{steps.wait.output.logs_url}}\n\nPlease analyse the likely failure cause and suggest a fix.',
        },
        dependsOn: ['check'],
        onError: 'continue',
      },
      {
        id: 'notify-pass',
        type: 'webhook',
        name: 'Notify Pass',
        description: 'Post a success comment via webhook',
        config: {
          url: '{{input.webhookUrl}}',
          method: 'POST',
          bodyTemplate:
            '{"status":"passed","repo":"{{input.repo}}","ref":"{{input.ref}}","conclusion":"{{steps.wait.output.conclusion}}"}',
        },
        dependsOn: ['check'],
        onError: 'continue',
      },
      {
        id: 'notify-failure',
        type: 'webhook',
        name: 'Notify Failure',
        description: 'Post failure diagnosis to webhook',
        config: {
          url: '{{input.webhookUrl}}',
          method: 'POST',
          bodyTemplate:
            '{"status":"failed","repo":"{{input.repo}}","ref":"{{input.ref}}","diagnosis":"{{steps.analyse-failure.output}}","logs_url":"{{steps.wait.output.logs_url}}"}',
        },
        dependsOn: ['analyse-failure'],
        onError: 'continue',
      },
    ],
    edges: [
      { source: 'trigger', target: 'wait' },
      { source: 'wait', target: 'check' },
      { source: 'check', target: 'notify-pass', label: 'pass' },
      { source: 'check', target: 'analyse-failure', label: 'fail' },
      { source: 'analyse-failure', target: 'notify-failure' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // ── build-failure-triage ──────────────────────────────────────
  {
    name: 'build-failure-triage',
    description:
      'CI/CD: Triggered by an inbound webhook event. An agent reads the log URL, diagnoses the failure, and opens a GitHub issue with a fix suggestion.',
    steps: [
      {
        id: 'diagnose',
        type: 'agent',
        name: 'Diagnose Build Failure',
        description: 'Read the log URL from the webhook payload and produce a diagnosis',
        config: {
          profile: 'default',
          taskTemplate:
            'Build failure reported for repo {{input.repo}} on branch {{input.branch}}.\n\nLog URL: {{input.logUrl}}\n\nFetch the logs if possible and produce a concise root-cause diagnosis with at least one actionable fix suggestion.',
        },
        dependsOn: [],
        onError: 'fail',
      },
      {
        id: 'open-issue',
        type: 'webhook',
        name: 'Open GitHub Issue',
        description: 'Post the diagnosis to the GitHub Issues API',
        config: {
          url: '{{input.webhookUrl}}',
          method: 'POST',
          bodyTemplate:
            '{"title":"Build failure on {{input.branch}}","body":"## Diagnosis\\n\\n{{steps.diagnose.output}}\\n\\n**Log URL:** {{input.logUrl}}","labels":["ci-failure","auto-triage"]}',
        },
        dependsOn: ['diagnose'],
        onError: 'continue',
      },
    ],
    edges: [{ source: 'diagnose', target: 'open-issue' }],
    triggers: [{ type: 'event', config: { event: 'build.failed' } }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // ── daily-pr-digest ───────────────────────────────────────────
  {
    name: 'daily-pr-digest',
    description:
      'CI/CD: Scheduled daily digest — list open PRs via MCP tool, have an agent summarise CI status, then POST the digest to a webhook.',
    steps: [
      {
        id: 'list-prs',
        type: 'tool',
        name: 'List Open PRs',
        description: 'Use the github_list_issues MCP tool to fetch open pull requests',
        config: {
          toolName: 'github_list_issues',
          toolArgs: {
            owner: '{{input.owner}}',
            repo: '{{input.repo}}',
            state: 'open',
            labels: '',
          },
        },
        dependsOn: [],
        onError: 'continue',
      },
      {
        id: 'summarise',
        type: 'agent',
        name: 'Summarise PRs',
        description: 'Summarise open PRs with CI status highlights',
        config: {
          profile: 'default',
          taskTemplate:
            'You are a daily PR digest assistant for {{input.owner}}/{{input.repo}}.\n\nHere are the open pull requests:\n\n{{steps.list-prs.output}}\n\nProduce a concise daily digest in markdown: PR title, author, CI status (if visible), and any action needed. Sort by urgency.',
        },
        dependsOn: ['list-prs'],
        onError: 'fail',
      },
      {
        id: 'post-digest',
        type: 'webhook',
        name: 'Post Digest',
        description: 'Send the digest to the configured webhook',
        config: {
          url: '{{input.webhookUrl}}',
          method: 'POST',
          bodyTemplate:
            '{"digest":"{{steps.summarise.output}}","repo":"{{input.owner}}/{{input.repo}}"}',
        },
        dependsOn: ['summarise'],
        onError: 'continue',
      },
    ],
    edges: [
      { source: 'list-prs', target: 'summarise' },
      { source: 'summarise', target: 'post-digest' },
    ],
    triggers: [{ type: 'schedule', config: { cron: '0 9 * * 1-5' } }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // ── dev-env-provision ─────────────────────────────────────────
  {
    name: 'dev-env-provision',
    description:
      'CI/CD: Spin up a Docker Compose dev environment, have an agent seed test data, then notify via webhook with the environment URL.',
    steps: [
      {
        id: 'compose-up',
        type: 'tool',
        name: 'Start Compose Stack',
        description: 'Bring up the Docker Compose project in detached mode',
        config: {
          toolName: 'docker_compose_up',
          toolArgs: {
            workdir: '{{input.composeDir}}',
            services: [],
            build: false,
            pull: 'missing',
          },
        },
        dependsOn: [],
        onError: 'fail',
      },
      {
        id: 'seed',
        type: 'agent',
        name: 'Seed Test Data',
        description: 'Agent seeds the environment with test data via API or SQL',
        config: {
          profile: 'default',
          taskTemplate:
            'The Docker Compose stack for project "{{input.projectName}}" is now running.\n\nCompose output:\n{{steps.compose-up.output}}\n\nPlease seed it with representative test data. Use any available tools (http_request, docker_exec) to do so. Confirm when complete.',
        },
        dependsOn: ['compose-up'],
        onError: 'continue',
      },
      {
        id: 'notify',
        type: 'webhook',
        name: 'Notify Environment Ready',
        description: 'POST environment URL and status to webhook',
        config: {
          url: '{{input.webhookUrl}}',
          method: 'POST',
          bodyTemplate:
            '{"project":"{{input.projectName}}","status":"ready","envUrl":"{{input.envUrl}}","seed":"{{steps.seed.output}}"}',
        },
        dependsOn: ['seed'],
        onError: 'continue',
      },
    ],
    edges: [
      { source: 'compose-up', target: 'seed' },
      { source: 'seed', target: 'notify' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // ── Security Templates (Phase 107-B) ────────────────────────

  {
    name: 'stride-threat-analysis',
    description:
      'Automated STRIDE threat analysis pipeline: performs per-element threat modeling, formats a structured report, and saves findings to the knowledge base.',
    steps: [
      agentStep(
        {
          id: 'stride-analysis',
          name: 'STRIDE Threat Analysis',
          description:
            'Perform STRIDE per-element threat modeling on the provided system architecture',
          dependsOn: [],
          onError: 'fail',
        },
        'security-analyst',
        'Perform a STRIDE per-element threat analysis on the following system:\n\n{{input.systemDescription}}\n\nInclude trust boundaries, data flow diagram, threat table with severity ratings, attack trees for critical threats, and prioritized mitigations.',
        '{{input.additionalContext}}'
      ),
      transformStep(
        {
          id: 'format-report',
          name: 'Format Threat Report',
          description: 'Format the STRIDE analysis into a structured markdown report',
          dependsOn: ['stride-analysis'],
          onError: 'continue',
        },
        '# STRIDE Threat Model Report\n\n**System**: {{input.systemName}}\n**Date**: {{input.date}}\n**Analyst**: Automated Pipeline\n\n{{steps.stride-analysis.output}}'
      ),
      resourceStep(
        {
          id: 'save-to-kb',
          name: 'Save to Knowledge Base',
          description: 'Persist the threat model report to the knowledge base for future reference',
          dependsOn: ['format-report'],
          onError: 'continue',
        },
        'knowledge',
        '{"title":"STRIDE Threat Model — {{input.systemName}}","content":"{{steps.format-report.output}}","tags":["stride","threat-model","security"]}'
      ),
    ],
    edges: [
      { source: 'stride-analysis', target: 'format-report' },
      { source: 'format-report', target: 'save-to-kb' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  {
    name: 'security-architecture-review',
    description:
      'Security architecture review pipeline: performs an 8-domain secure-by-design review, routes to human approval, and saves the approved review to the knowledge base.',
    steps: [
      agentStep(
        {
          id: 'arch-review',
          name: '8-Domain Architecture Review',
          description: 'Perform a comprehensive security architecture review across all 8 domains',
          dependsOn: [],
          onError: 'fail',
        },
        'security-architect',
        'Perform an 8-domain security architecture review on:\n\n{{input.systemDescription}}\n\nDomains: Authentication, Authorization, Data Protection, Network Security, Supply Chain, Logging & Monitoring, Incident Response, Compliance & Governance.\n\nProduce findings with severity ratings, a per-domain checklist, and a remediation roadmap.',
        '{{input.additionalContext}}'
      ),
      {
        id: 'approval',
        type: 'human_approval',
        name: 'Review Approval',
        description: 'A human reviewer must approve the architecture review before it is saved',
        config: {
          prompt:
            'Please review the security architecture assessment below and approve or reject.\n\n{{steps.arch-review.output}}',
          timeoutMs: 86_400_000,
        },
        dependsOn: ['arch-review'],
        onError: 'fail',
      } as unknown as WorkflowStep,
      resourceStep(
        {
          id: 'save-approved',
          name: 'Save Approved Review',
          description: 'Save the human-approved security architecture review to the knowledge base',
          dependsOn: ['approval'],
          onError: 'continue',
        },
        'knowledge',
        '{"title":"Security Architecture Review — {{input.systemName}}","content":"{{steps.arch-review.output}}","tags":["architecture-review","security","approved"]}'
      ),
    ],
    edges: [
      { source: 'arch-review', target: 'approval' },
      { source: 'approval', target: 'save-approved' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L3' as const,
  },

  {
    name: 'athi-scenario-generation',
    description:
      'Generate ATHI threat scenarios from an organization profile and AI usage patterns. Runs AI analysis, routes to human approval, and saves approved scenarios to the knowledge base.',
    steps: [
      agentStep(
        {
          id: 'generate-scenarios',
          name: 'Generate ATHI Scenarios',
          description:
            'Analyze the organization and AI usage patterns to generate ATHI threat scenarios',
          dependsOn: [],
          onError: 'fail',
        },
        'security-analyst',
        'Analyze the following organization using the ATHI (Actors, Techniques, Harms, Impacts) threat taxonomy.\n\nOrganization: {{input.orgDescription}}\n\nAI Usage Patterns: {{input.aiUsagePatterns}}\n\n{{#if input.existingScenarioCount}}Note: The organization already has {{input.existingScenarioCount}} existing scenarios. Focus on gaps and emerging threats.{{/if}}\n\nGenerate a comprehensive set of ATHI threat scenarios. For each plausible actor–technique combination, produce a scenario with title, description, actor, techniques, harms, impacts, likelihood (1–5), severity (1–5), and suggested mitigations. Output as a JSON array of AthiScenarioCreate objects.',
        '{{input.additionalContext}}'
      ),
      {
        id: 'approval',
        type: 'human_approval',
        name: 'Scenario Review Gate',
        description:
          'A human reviewer must approve the generated scenarios before they are persisted',
        config: {
          prompt:
            'Please review the AI-generated ATHI threat scenarios below. Approve to save them to the knowledge base, or reject to discard.\n\n{{steps.generate-scenarios.output}}',
          timeoutMs: 172_800_000, // 48h
        },
        dependsOn: ['generate-scenarios'],
        onError: 'fail',
      } as unknown as WorkflowStep,
      resourceStep(
        {
          id: 'save-scenarios',
          name: 'Save Approved Scenarios',
          description: 'Save the human-approved ATHI scenarios to the knowledge base',
          dependsOn: ['approval'],
          onError: 'continue',
        },
        'knowledge',
        '{"title":"ATHI Threat Scenarios — {{input.orgDescription}}","content":"{{steps.generate-scenarios.output}}","tags":["athi","threat-scenarios","ai-security","approved"]}'
      ),
    ],
    edges: [
      { source: 'generate-scenarios', target: 'approval' },
      { source: 'approval', target: 'save-scenarios' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L3' as const,
  },

  {
    name: 'sra-posture-assessment',
    description:
      'Security Reference Architecture posture assessment pipeline: selects the appropriate SRA blueprint, assesses infrastructure controls, routes to human approval, and saves the approved assessment to the knowledge base.',
    steps: [
      agentStep(
        {
          id: 'select-blueprint',
          name: 'Select SRA Blueprint',
          description:
            'Select the appropriate SRA blueprint based on cloud provider and requirements',
          dependsOn: [],
          onError: 'fail',
        },
        'security-architect',
        'Review the cloud environment described below and select the most appropriate Security Reference Architecture blueprint.\n\nEnvironment: {{input.infrastructureDescription}}\nProvider: {{input.provider}}\n\nUse sra_list_blueprints to find available blueprints. Recommend the best match and explain why.',
        '{{input.additionalContext}}'
      ),
      agentStep(
        {
          id: 'assess-controls',
          name: 'Assess Infrastructure Controls',
          description:
            'Evaluate infrastructure against SRA blueprint controls and generate gap analysis',
          dependsOn: ['select-blueprint'],
          onError: 'fail',
        },
        'security-architect',
        'Using the blueprint selected in the previous step, assess the following infrastructure against all controls.\n\nBlueprint: {{steps.select-blueprint.output}}\nInfrastructure: {{input.infrastructureDescription}}\n\nFor each control, determine: fully_implemented, partially_implemented, not_implemented, or not_applicable. Create the assessment using sra_assess, then generate the summary. Include a domain heatmap, top gaps, and remediation roadmap with IaC snippets.'
      ),
      {
        id: 'approval',
        type: 'human_approval',
        name: 'Assessment Approval',
        description: 'A human reviewer must approve the SRA assessment before it is saved',
        config: {
          prompt:
            'Please review the Security Reference Architecture assessment below and approve or reject.\n\n{{steps.assess-controls.output}}',
          timeoutMs: 86_400_000,
        },
        dependsOn: ['assess-controls'],
        onError: 'fail',
      } as unknown as WorkflowStep,
      resourceStep(
        {
          id: 'save-assessment',
          name: 'Save Approved Assessment',
          description: 'Save the human-approved SRA assessment to the knowledge base',
          dependsOn: ['approval'],
          onError: 'continue',
        },
        'knowledge',
        '{"title":"SRA Posture Assessment — {{input.systemName}}","content":"{{steps.assess-controls.output}}","tags":["sra","security-reference-architecture","assessment","approved"]}'
      ),
    ],
    edges: [
      { source: 'select-blueprint', target: 'assess-controls' },
      { source: 'assess-controls', target: 'approval' },
      { source: 'approval', target: 'save-assessment' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L3' as const,
  },

  // ── Architecture Diagram Pipeline (Phase 117) ────────────────────
  {
    name: 'architecture-diagram-pipeline',
    description:
      'Architecture diagram generation pipeline: gathers system description from input, generates an Excalidraw architecture diagram, builds a markdown report with the rendered SVG, and saves to the knowledge base.',
    steps: [
      agentStep(
        {
          id: 'gather-description',
          name: 'Gather Architecture Description',
          description:
            'Analyze the input and produce a structured architecture description with components and connections',
          dependsOn: [],
          onError: 'fail',
        },
        'default',
        'Analyze the following system description and produce a structured list of components and their connections for an architecture diagram.\n\nSystem: {{input.systemDescription}}\n\nOutput a comma-separated list of components and a separate list of connections between them.'
      ),
      {
        id: 'generate-diagram',
        type: 'diagram_generation',
        name: 'Generate Architecture Diagram',
        description: 'Generate Excalidraw architecture diagram from the gathered description',
        config: {
          diagramType: 'architecture',
          descriptionTemplate: '{{steps.gather-description.output}}',
          style: 'detailed',
          format: 'svg',
        },
        dependsOn: ['gather-description'],
        onError: 'fail',
      } as unknown as WorkflowStep,
      transformStep(
        {
          id: 'build-report',
          name: 'Build Markdown Report',
          description: 'Combine diagram metadata and description into a markdown report',
          dependsOn: ['generate-diagram'],
          onError: 'continue',
        },
        '# Architecture Diagram — {{input.systemName}}\n\n## Description\n{{steps.gather-description.output}}\n\n## Diagram Metadata\n- Type: {{steps.generate-diagram.output.diagramType}}\n- Style: {{steps.generate-diagram.output.style}}\n- Tools: {{steps.generate-diagram.output.toolChain}}\n'
      ),
      resourceStep(
        {
          id: 'save-diagram',
          name: 'Save Diagram to KB',
          description: 'Save the architecture diagram report to the knowledge base',
          dependsOn: ['build-report'],
          onError: 'continue',
        },
        'knowledge',
        '{"title":"Architecture Diagram — {{input.systemName}}","content":"{{steps.build-report.output}}","tags":["diagram","architecture","excalidraw"]}'
      ),
    ],
    edges: [
      { source: 'gather-description', target: 'generate-diagram' },
      { source: 'generate-diagram', target: 'build-report' },
      { source: 'build-report', target: 'save-diagram' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // ── Threat Model with DFD (Phase 117) ────────────────────────────
  {
    name: 'threat-model-with-dfd',
    description:
      'Threat model generation with data flow diagram: performs STRIDE analysis, generates an Excalidraw threat model DFD, combines into a comprehensive report, routes to human approval, and saves to the knowledge base.',
    steps: [
      agentStep(
        {
          id: 'stride-analysis',
          name: 'STRIDE Threat Analysis',
          description:
            'Perform STRIDE analysis on the system and identify threats, trust boundaries, and data flows',
          dependsOn: [],
          onError: 'fail',
        },
        'security-architect',
        'Perform a STRIDE threat analysis on the following system.\n\nSystem: {{input.systemDescription}}\nScope: {{input.scope}}\n\nIdentify:\n1. Components and their trust boundaries\n2. Data flows between components\n3. STRIDE threats for each component and data flow\n4. Risk ratings (Critical/High/Medium/Low)\n\nOutput a structured analysis with component names suitable for diagramming.'
      ),
      {
        id: 'generate-dfd',
        type: 'diagram_generation',
        name: 'Generate Threat Model DFD',
        description:
          'Generate Excalidraw data flow diagram showing trust boundaries and threat vectors',
        config: {
          diagramType: 'threat_model',
          descriptionTemplate: '{{steps.stride-analysis.output}}',
          style: 'technical',
          format: 'svg',
        },
        dependsOn: ['stride-analysis'],
        onError: 'continue',
      } as unknown as WorkflowStep,
      transformStep(
        {
          id: 'combine-report',
          name: 'Combine Threat Model Report',
          description:
            'Merge STRIDE analysis with DFD diagram metadata into a comprehensive report',
          dependsOn: ['stride-analysis', 'generate-dfd'],
          onError: 'fail',
        },
        '# Threat Model — {{input.systemName}}\n\n## STRIDE Analysis\n{{steps.stride-analysis.output}}\n\n## Data Flow Diagram\n- Diagram Type: {{steps.generate-dfd.output.diagramType}}\n- Style: {{steps.generate-dfd.output.style}}\n\n## Recommendations\nReview the identified threats and data flow diagram above. Ensure all trust boundaries are correctly identified and all STRIDE categories are covered.\n'
      ),
      {
        id: 'approval',
        type: 'human_approval',
        name: 'Threat Model Approval',
        description: 'A security reviewer must approve the threat model before it is saved',
        config: {
          prompt:
            'Please review the threat model below and approve or reject.\n\n{{steps.combine-report.output}}',
          timeoutMs: 86_400_000,
        },
        dependsOn: ['combine-report'],
        onError: 'fail',
      } as unknown as WorkflowStep,
      resourceStep(
        {
          id: 'save-to-kb',
          name: 'Save Approved Threat Model',
          description: 'Save the human-approved threat model to the knowledge base',
          dependsOn: ['approval'],
          onError: 'continue',
        },
        'knowledge',
        '{"title":"Threat Model — {{input.systemName}}","content":"{{steps.combine-report.output}}","tags":["threat-model","stride","dfd","security","approved"]}'
      ),
    ],
    edges: [
      { source: 'stride-analysis', target: 'generate-dfd' },
      { source: 'generate-dfd', target: 'combine-report' },
      { source: 'stride-analysis', target: 'combine-report' },
      { source: 'combine-report', target: 'approval' },
      { source: 'approval', target: 'save-to-kb' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L3' as const,
  },

  // ── PDF Intake Pipeline (Phase 122-B) ──────────────────────────────
  {
    name: 'pdf-intake-pipeline',
    description:
      'PDF document intake: loads a PDF, runs document analysis, formats a report, sends to agent review, and saves results to the knowledge base.',
    steps: [
      resourceStep(
        {
          id: 'load-pdf',
          name: 'Load PDF Document',
          description: 'Load PDF content from the provided source',
          dependsOn: [],
          onError: 'fail',
        },
        'document',
        '{"pdfBase64":"{{input.pdfBase64}}","filename":"{{input.filename}}"}'
      ),
      documentAnalysisStep(
        {
          id: 'analyze-pdf',
          name: 'Analyze PDF',
          description: 'Run document analysis on the loaded PDF',
          dependsOn: ['load-pdf'],
          onError: 'fail',
        },
        '{{input.analysisType}}',
        '{{steps.load-pdf.output}}',
        'markdown'
      ),
      transformStep(
        {
          id: 'format-report',
          name: 'Format Analysis Report',
          description: 'Transform the analysis output into a structured report',
          dependsOn: ['analyze-pdf'],
          onError: 'fail',
        },
        '# PDF Analysis Report — {{input.filename}}\n\n## Analysis Type: {{steps.analyze-pdf.output.analysisType}}\n\n{{steps.analyze-pdf.output.document}}\n\n## Tool Chain\n{{steps.analyze-pdf.output.toolChain}}\n'
      ),
      agentStep(
        {
          id: 'review-report',
          name: 'Agent Review',
          description: 'Review the formatted report for completeness and accuracy',
          dependsOn: ['format-report'],
          onError: 'continue',
        },
        'analyst',
        'Review the following PDF analysis report for completeness, accuracy, and actionable insights. Suggest improvements if needed.\n\n{{steps.format-report.output}}'
      ),
      resourceStep(
        {
          id: 'save-to-kb',
          name: 'Save to Knowledge Base',
          description: 'Save the analysis report to the knowledge base',
          dependsOn: ['review-report'],
          onError: 'continue',
        },
        'knowledge',
        '{"title":"PDF Analysis — {{input.filename}}","content":"{{steps.format-report.output}}","tags":["pdf","analysis","document"]}'
      ),
    ],
    edges: [
      { source: 'load-pdf', target: 'analyze-pdf' },
      { source: 'analyze-pdf', target: 'format-report' },
      { source: 'format-report', target: 'review-report' },
      { source: 'review-report', target: 'save-to-kb' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // ── Phase 125: Trading Workflows ─────────────────────────────────────────────

  // 18. Daily Trading Setup
  {
    name: 'daily-trading-setup',
    description:
      'Generates daily trading setups: scans market structure, identifies key levels, applies multi-timeframe analysis, and produces a consolidated trade plan with entries, stops, and targets.',
    steps: [
      agentStep(
        {
          id: 'scan-structure',
          name: 'Market Structure Scan',
          description: 'Analyze market structure across watchlist instruments',
          dependsOn: [],
          onError: 'fail',
        },
        'analyst',
        'Analyze the current market structure for {{input.instruments}}. Identify trend direction (bullish/bearish/ranging), key support/resistance levels, and any break of structure (BOS) or change of character (CHOCH) signals. Use the daily and 4-hour timeframes.'
      ),
      agentStep(
        {
          id: 'key-levels',
          name: 'Key Level Identification',
          description: 'Map institutional levels, order blocks, and liquidity pools',
          dependsOn: ['scan-structure'],
          onError: 'fail',
        },
        'analyst',
        'Based on the market structure analysis:\n\n{{steps.scan-structure.output}}\n\nIdentify key levels for each instrument: order blocks, fair value gaps, supply/demand zones, previous day high/low, weekly open, and liquidity pools above/below current price.'
      ),
      agentStep(
        {
          id: 'trade-setups',
          name: 'Trade Setup Generation',
          description: 'Generate actionable trade setups with entries, stops, and targets',
          dependsOn: ['key-levels'],
          onError: 'fail',
        },
        'analyst',
        'Using the market structure and key levels:\n\nStructure: {{steps.scan-structure.output}}\nLevels: {{steps.key-levels.output}}\n\nGenerate specific trade setups for today. For each setup include: instrument, direction (long/short), entry zone, stop loss, target 1, target 2, risk/reward ratio, and confluence score (1-5). Only include setups with R:R >= 2:1 and confluence >= 3.'
      ),
      transformStep(
        {
          id: 'format-plan',
          name: 'Format Daily Plan',
          description: 'Consolidate into a formatted daily trading plan',
          dependsOn: ['trade-setups'],
          onError: 'fail',
        },
        '# Daily Trading Plan — {{input.date}}\n\n## Market Overview\n{{steps.scan-structure.output}}\n\n## Key Levels\n{{steps.key-levels.output}}\n\n## Trade Setups\n{{steps.trade-setups.output}}\n\n---\n*Generated by YEOMAN Daily Trading Setup Pipeline*'
      ),
      resourceStep(
        {
          id: 'save-plan',
          name: 'Save to Knowledge Base',
          description: 'Persist the daily plan for future reference',
          dependsOn: ['format-plan'],
          onError: 'continue',
        },
        'knowledge',
        '{"title":"Daily Trading Plan — {{input.date}}","content":"{{steps.format-plan.output}}","tags":["trading","daily-setup","trade-plan"]}'
      ),
    ],
    edges: [
      { source: 'scan-structure', target: 'key-levels' },
      { source: 'key-levels', target: 'trade-setups' },
      { source: 'trade-setups', target: 'format-plan' },
      { source: 'format-plan', target: 'save-plan' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // 19. Trade Analysis & Journal
  {
    name: 'trade-analysis-journal',
    description:
      'Analyzes completed trades: calculates performance statistics (win rate, Sharpe ratio, max drawdown), identifies patterns in winning/losing trades, and generates a performance report.',
    steps: [
      agentStep(
        {
          id: 'parse-trades',
          name: 'Parse Trade Data',
          description: 'Parse and normalize the provided trade data',
          dependsOn: [],
          onError: 'fail',
        },
        'analyst',
        'Parse the following trade data and normalize into a structured format with fields: instrument, direction, entry_price, exit_price, entry_date, exit_date, position_size, pnl, pnl_percent.\n\nTrade data:\n{{input.tradeData}}'
      ),
      agentStep(
        {
          id: 'calc-stats',
          name: 'Calculate Statistics',
          description: 'Compute performance metrics from trade history',
          dependsOn: ['parse-trades'],
          onError: 'fail',
        },
        'analyst',
        'Calculate comprehensive trading statistics from these normalized trades:\n\n{{steps.parse-trades.output}}\n\nMetrics to compute: total trades, win rate, average win, average loss, profit factor, expectancy per trade, largest win, largest loss, max consecutive wins, max consecutive losses, max drawdown (%), average holding period, Sharpe ratio (annualized), Sortino ratio, Calmar ratio. Break down by long vs. short and by instrument if multiple instruments present.'
      ),
      agentStep(
        {
          id: 'pattern-analysis',
          name: 'Pattern Analysis',
          description: 'Identify patterns in winning and losing trades',
          dependsOn: ['parse-trades', 'calc-stats'],
          onError: 'continue',
        },
        'analyst',
        'Analyze the trade data for patterns:\n\nTrades: {{steps.parse-trades.output}}\nStats: {{steps.calc-stats.output}}\n\nIdentify: (1) What do winning trades have in common? (time of day, day of week, setup type, holding period) (2) What do losing trades have in common? (3) Are there instruments that perform better/worse? (4) Is there a time-based pattern (performance degrading over time = tilt, improving = learning)? (5) Position sizing analysis: are losses larger than the risk plan allows? (6) Specific recommendations for improvement.'
      ),
      transformStep(
        {
          id: 'format-report',
          name: 'Format Journal Report',
          description: 'Generate formatted performance report',
          dependsOn: ['calc-stats', 'pattern-analysis'],
          onError: 'fail',
        },
        '# Trade Journal Report — {{input.period}}\n\n## Performance Summary\n{{steps.calc-stats.output}}\n\n## Pattern Analysis\n{{steps.pattern-analysis.output}}\n\n---\n*Generated by YEOMAN Trade Analysis Pipeline*'
      ),
      resourceStep(
        {
          id: 'save-journal',
          name: 'Save Journal Entry',
          description: 'Persist the journal report to knowledge base',
          dependsOn: ['format-report'],
          onError: 'continue',
        },
        'knowledge',
        '{"title":"Trade Journal — {{input.period}}","content":"{{steps.format-report.output}}","tags":["trading","journal","performance","analysis"]}'
      ),
    ],
    edges: [
      { source: 'parse-trades', target: 'calc-stats' },
      { source: 'parse-trades', target: 'pattern-analysis' },
      { source: 'calc-stats', target: 'pattern-analysis' },
      { source: 'calc-stats', target: 'format-report' },
      { source: 'pattern-analysis', target: 'format-report' },
      { source: 'format-report', target: 'save-journal' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // 20. Multi-Timeframe Analysis
  {
    name: 'multi-timeframe-analysis',
    description:
      'Conducts multi-timeframe analysis (HTF/MTF/LTF alignment) and generates trade recommendations based on confluence of signals across timeframes.',
    steps: [
      agentStep(
        {
          id: 'htf-analysis',
          name: 'Higher Timeframe Analysis',
          description: 'Analyze weekly and daily charts for trend and structure',
          dependsOn: [],
          onError: 'fail',
        },
        'analyst',
        'Perform higher timeframe analysis on {{input.instrument}}.\n\nWeekly chart: Identify the dominant trend, key weekly support/resistance levels, and any weekly chart patterns.\nDaily chart: Identify the daily trend direction, daily order blocks, daily fair value gaps, and premium/discount zones.\n\nDetermine the HTF bias: bullish, bearish, or neutral.'
      ),
      agentStep(
        {
          id: 'mtf-analysis',
          name: 'Medium Timeframe Analysis',
          description: 'Analyze 4-hour and 1-hour charts for structure alignment',
          dependsOn: ['htf-analysis'],
          onError: 'fail',
        },
        'analyst',
        'Given the HTF bias:\n\n{{steps.htf-analysis.output}}\n\nPerform medium timeframe analysis on {{input.instrument}}.\n\n4H chart: Does the 4H structure align with the HTF bias? Identify 4H BOS/CHOCH, order blocks, and FVGs.\n1H chart: Map the 1H market structure within the 4H context. Identify 1H supply/demand zones and liquidity pools.\n\nDetermine MTF alignment: aligned (HTF and MTF agree), conflicting (HTF and MTF disagree), or transitioning.'
      ),
      agentStep(
        {
          id: 'ltf-analysis',
          name: 'Lower Timeframe Analysis',
          description: 'Analyze 15-minute and 5-minute charts for precision entries',
          dependsOn: ['mtf-analysis'],
          onError: 'fail',
        },
        'analyst',
        'Given the HTF and MTF context:\n\nHTF: {{steps.htf-analysis.output}}\nMTF: {{steps.mtf-analysis.output}}\n\nPerform lower timeframe analysis on {{input.instrument}}.\n\n15M chart: Identify LTF market structure shifts, entry-grade order blocks, and fair value gaps.\n5M chart: Pinpoint precision entry triggers — BOS confirmations, order block reactions, FVG fills.\n\nOnly generate entry signals that align with the HTF bias and MTF structure.'
      ),
      agentStep(
        {
          id: 'confluence-score',
          name: 'Confluence Assessment',
          description: 'Score the trade setup by confluence factors',
          dependsOn: ['htf-analysis', 'mtf-analysis', 'ltf-analysis'],
          onError: 'fail',
        },
        'analyst',
        'Assess confluence for {{input.instrument}} trade setup:\n\nHTF: {{steps.htf-analysis.output}}\nMTF: {{steps.mtf-analysis.output}}\nLTF: {{steps.ltf-analysis.output}}\n\nScore each factor (0 or 1): HTF trend alignment, MTF structure alignment, LTF entry trigger, order block present, FVG present, liquidity sweep occurred, premium/discount zone, key level confluence, session timing (kill zone). Total confluence score out of 9. Recommend: 7+ = high probability, 5-6 = moderate, below 5 = pass.'
      ),
      transformStep(
        {
          id: 'format-mtf-report',
          name: 'Format MTF Report',
          description: 'Generate consolidated multi-timeframe analysis report',
          dependsOn: ['confluence-score'],
          onError: 'fail',
        },
        '# Multi-Timeframe Analysis — {{input.instrument}}\n\n## Higher Timeframe (Weekly/Daily)\n{{steps.htf-analysis.output}}\n\n## Medium Timeframe (4H/1H)\n{{steps.mtf-analysis.output}}\n\n## Lower Timeframe (15M/5M)\n{{steps.ltf-analysis.output}}\n\n## Confluence Assessment\n{{steps.confluence-score.output}}\n\n---\n*Generated by YEOMAN Multi-Timeframe Analysis Pipeline*'
      ),
    ],
    edges: [
      { source: 'htf-analysis', target: 'mtf-analysis' },
      { source: 'mtf-analysis', target: 'ltf-analysis' },
      { source: 'htf-analysis', target: 'confluence-score' },
      { source: 'mtf-analysis', target: 'confluence-score' },
      { source: 'ltf-analysis', target: 'confluence-score' },
      { source: 'confluence-score', target: 'format-mtf-report' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // 21. Risk & Position Sizing Calculator
  {
    name: 'risk-position-sizing',
    description:
      'Calculates position sizes, risk/reward ratios, Kelly Criterion position sizing, and portfolio risk metrics for trade execution.',
    steps: [
      agentStep(
        {
          id: 'validate-inputs',
          name: 'Validate Trade Parameters',
          description: 'Validate and normalize the trade parameters',
          dependsOn: [],
          onError: 'fail',
        },
        'analyst',
        'Validate and normalize the following trade parameters:\n\n- Account size: {{input.accountSize}}\n- Risk per trade: {{input.riskPercent}}%\n- Instrument: {{input.instrument}}\n- Entry price: {{input.entryPrice}}\n- Stop loss: {{input.stopLoss}}\n- Target 1: {{input.target1}}\n- Target 2: {{input.target2}}\n{{#if input.tickValue}}- Tick/pip value: {{input.tickValue}}{{/if}}\n{{#if input.contractSize}}- Contract size: {{input.contractSize}}{{/if}}\n\nCalculate: distance to stop (points/pips/ticks), distance to target 1 and target 2, direction (long/short based on entry vs. stop).'
      ),
      agentStep(
        {
          id: 'position-size',
          name: 'Calculate Position Size',
          description: 'Compute position sizes using multiple methodologies',
          dependsOn: ['validate-inputs'],
          onError: 'fail',
        },
        'analyst',
        'Using the validated parameters:\n\n{{steps.validate-inputs.output}}\n\nCalculate position size using multiple methods:\n\n1. **Fixed Fractional**: Position size = (Account × Risk%) / (Entry - Stop)\n2. **Kelly Criterion**: If historical win rate and avg win/loss ratio provided (win rate: {{input.winRate}}, avg win/loss: {{input.avgWinLossRatio}}), calculate: f* = (bp - q) / b where b=avg_win/avg_loss, p=win_rate, q=1-p. Recommend half-Kelly for safety.\n3. **Volatility-Based**: If ATR provided ({{input.atr}}), size = (Account × Risk%) / (ATR × multiplier)\n\nPresent all applicable methods with the resulting position size in shares/contracts/lots.'
      ),
      agentStep(
        {
          id: 'risk-metrics',
          name: 'Portfolio Risk Assessment',
          description: 'Assess portfolio-level risk with this new position',
          dependsOn: ['position-size'],
          onError: 'continue',
        },
        'analyst',
        'Assess portfolio risk with this new position:\n\n{{steps.position-size.output}}\n\n{{#if input.existingPositions}}Existing positions: {{input.existingPositions}}{{/if}}\n\nCalculate:\n1. Dollar risk on this trade\n2. Total portfolio heat (sum of all open position risks as % of account)\n3. Correlation risk: if existing positions are in correlated instruments, flag concentration\n4. Maximum position guideline: no single position > 5% of account, no single sector > 15%\n5. Risk/reward matrix: R:R at target 1, R:R at target 2, breakeven point for partial profit taking\n6. Suggested partial exit strategy: e.g., 50% at T1, move stop to breakeven, trail remaining to T2'
      ),
      transformStep(
        {
          id: 'format-sizing',
          name: 'Format Position Sizing Report',
          description: 'Generate formatted position sizing summary',
          dependsOn: ['position-size', 'risk-metrics'],
          onError: 'fail',
        },
        '# Position Sizing — {{input.instrument}}\n\n## Trade Parameters\n{{steps.validate-inputs.output}}\n\n## Position Size Calculation\n{{steps.position-size.output}}\n\n## Portfolio Risk Assessment\n{{steps.risk-metrics.output}}\n\n---\n*Generated by YEOMAN Risk & Position Sizing Pipeline*'
      ),
    ],
    edges: [
      { source: 'validate-inputs', target: 'position-size' },
      { source: 'position-size', target: 'risk-metrics' },
      { source: 'position-size', target: 'format-sizing' },
      { source: 'risk-metrics', target: 'format-sizing' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },

  // ── Financial Analysis Pipeline (Phase 125) ──────────────────────────────
  {
    name: 'financial-analysis-pipeline',
    description:
      'Fetch market data, perform financial analysis, and generate visualizations (candlestick chart, allocation pie, risk/return scatter).',
    steps: [
      agentStep(
        {
          id: 'fetch-data',
          name: 'Fetch Market Data',
          description: 'Retrieve OHLCV data and current quote for the target symbol',
          dependsOn: [],
          onError: 'fail',
        },
        'researcher',
        'Fetch OHLCV data and current quote for {{input.symbol}} using market_historical and market_quote tools'
      ),
      agentStep(
        {
          id: 'analyze',
          name: 'Financial Analysis',
          description: 'Analyse the market data with bear/bull case and technical structure',
          dependsOn: ['fetch-data'],
          onError: 'fail',
        },
        'analyst',
        'Analyse the market data for {{input.symbol}}:\n\n{{steps.fetch-data.output}}'
      ),
      chartGenerationStep(
        {
          id: 'chart-price',
          name: 'Generate Price Chart',
          description: 'Create OHLCV candlestick chart with volume and moving averages',
          dependsOn: ['fetch-data'],
          onError: 'continue',
        },
        'candlestick',
        '{{steps.fetch-data.output}}',
        { showVolume: true, movingAverages: [{ period: 20 }, { period: 50 }] }
      ),
      chartGenerationStep(
        {
          id: 'chart-allocation',
          name: 'Generate Allocation Chart',
          description: 'Create portfolio allocation donut chart',
          dependsOn: ['analyze'],
          onError: 'continue',
        },
        'pie',
        '{{steps.analyze.output}}'
      ),
      transformStep(
        {
          id: 'report',
          name: 'Compile Report',
          description: 'Combine analysis and charts into a final report',
          dependsOn: ['analyze', 'chart-price', 'chart-allocation'],
          onError: 'continue',
        },
        '# Financial Analysis: {{input.symbol}}\n\n{{steps.analyze.output}}\n\n## Price Chart\n{{steps.chart-price.output}}\n\n## Allocation\n{{steps.chart-allocation.output}}'
      ),
      resourceStep(
        {
          id: 'save',
          name: 'Save to Memory',
          description: 'Persist the final report to the knowledge base',
          dependsOn: ['report'],
          onError: 'continue',
        },
        'memory',
        '{{steps.report.output}}'
      ),
    ],
    edges: [
      { source: 'fetch-data', target: 'analyze' },
      { source: 'fetch-data', target: 'chart-price' },
      { source: 'analyze', target: 'chart-allocation' },
      { source: 'analyze', target: 'report' },
      { source: 'chart-price', target: 'report' },
      { source: 'chart-allocation', target: 'report' },
      { source: 'report', target: 'save' },
    ],
    triggers: [{ type: 'manual', config: {} }],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    autonomyLevel: 'L2' as const,
  },
];
