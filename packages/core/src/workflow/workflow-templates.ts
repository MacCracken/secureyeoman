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
          expression: 'steps.review.output && steps.review.output.includes && steps.review.output.includes("LGTM")',
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
          bodyTemplate: '{"status":"passed","pr":"{{input.prTitle}}","review":"{{steps.review.output}}"}',
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
          bodyTemplate: '{"status":"failed","pr":"{{input.prTitle}}","review":"{{steps.review.output}}"}',
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
