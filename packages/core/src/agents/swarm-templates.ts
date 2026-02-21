/**
 * Built-in Swarm Templates (Phase 17)
 */

import type { SwarmTemplate } from '@secureyeoman/shared';

export const BUILTIN_SWARM_TEMPLATES: Omit<SwarmTemplate, 'createdAt'>[] = [
  {
    id: 'research-and-code',
    name: 'research-and-code',
    description:
      'Sequential pipeline: researcher gathers information, coder implements, reviewer audits the result.',
    strategy: 'sequential',
    roles: [
      {
        role: 'researcher',
        profileName: 'researcher',
        description: 'Gather relevant information and context',
      },
      {
        role: 'coder',
        profileName: 'coder',
        description: 'Implement the solution based on research',
      },
      {
        role: 'reviewer',
        profileName: 'reviewer',
        description: 'Audit the implementation for quality and correctness',
      },
    ],
    coordinatorProfile: null,
    isBuiltin: true,
  },
  {
    id: 'analyze-and-summarize',
    name: 'analyze-and-summarize',
    description:
      'Sequential pipeline: researcher gathers data, analyst interprets findings, summarizer produces a concise report.',
    strategy: 'sequential',
    roles: [
      { role: 'researcher', profileName: 'researcher', description: 'Gather raw data and sources' },
      { role: 'analyst', profileName: 'analyst', description: 'Interpret and analyze the data' },
      {
        role: 'summarizer',
        profileName: 'summarizer',
        description: 'Produce a concise, clear summary',
      },
    ],
    coordinatorProfile: null,
    isBuiltin: true,
  },
  {
    id: 'parallel-research',
    name: 'parallel-research',
    description:
      'Two researchers work simultaneously on different angles; an analyst synthesizes their combined findings.',
    strategy: 'parallel',
    roles: [
      { role: 'researcher-a', profileName: 'researcher', description: 'Research primary angle' },
      { role: 'researcher-b', profileName: 'researcher', description: 'Research secondary angle' },
    ],
    coordinatorProfile: 'analyst',
    isBuiltin: true,
  },
  {
    id: 'code-review',
    name: 'code-review',
    description:
      'Sequential pipeline: coder implements the task, reviewer checks for correctness and style.',
    strategy: 'sequential',
    roles: [
      { role: 'coder', profileName: 'coder', description: 'Implement the requested code' },
      {
        role: 'reviewer',
        profileName: 'reviewer',
        description: 'Review code for quality and correctness',
      },
    ],
    coordinatorProfile: null,
    isBuiltin: true,
  },
];
