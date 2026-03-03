/**
 * Built-in Workflow Templates
 *
 * Three starter workflows seeded at startup.
 */

import type { WorkflowDefinitionCreateInput, WorkflowStep } from '@secureyeoman/shared';

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
          pollIntervalMs: 15000,
          timeoutMs: 1800000,
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
];
