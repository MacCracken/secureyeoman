/**
 * Council Catalog — bundled council template definitions available for
 * one-click install via the marketplace API.
 *
 * These are NOT auto-installed. The council_templates table starts empty.
 * Users browse the catalog and explicitly install templates they want.
 */

import type { CouncilTemplateCreate } from '@secureyeoman/shared';

export const CATALOG_COUNCIL_TEMPLATES: CouncilTemplateCreate[] = [
  {
    name: 'Board of Directors',
    description:
      'Strategic decision review with diverse executive perspectives. Members deliberate from financial, technical, security, and strategic viewpoints.',
    members: [
      {
        role: 'CFO',
        profileName: 'analyst',
        description: 'Financial impact and ROI analysis',
        weight: 1,
        perspective: 'Evaluate from a financial risk and return perspective',
      },
      {
        role: 'CTO',
        profileName: 'coder',
        description: 'Technical feasibility and architecture',
        weight: 1,
        perspective: 'Evaluate from a technical feasibility and scalability perspective',
      },
      {
        role: 'CISO',
        profileName: 'analyst',
        description: 'Security and compliance implications',
        weight: 1,
        perspective: 'Evaluate from a security, privacy, and compliance perspective',
      },
      {
        role: 'Strategy',
        profileName: 'researcher',
        description: 'Market positioning and strategic alignment',
        weight: 1,
        perspective: 'Evaluate from a market strategy and competitive positioning perspective',
      },
    ],
    facilitatorProfile: 'summarizer',
    deliberationStrategy: 'until_consensus',
    maxRounds: 3,
    votingStrategy: 'facilitator_judgment',
  },
  {
    name: 'Architecture Review Board',
    description:
      'Technical design review with cross-functional engineering perspectives. Backend, security, and infrastructure viewpoints.',
    members: [
      {
        role: 'Backend',
        profileName: 'coder',
        description: 'Backend architecture and API design',
        weight: 1,
        perspective: 'Evaluate backend architecture, APIs, and data models',
      },
      {
        role: 'Security',
        profileName: 'analyst',
        description: 'Security posture and attack surface',
        weight: 1,
        perspective: 'Identify attack surface, auth gaps, and data exposure risks',
      },
      {
        role: 'Infrastructure',
        profileName: 'analyst',
        description: 'Deployment and scaling',
        weight: 1,
        perspective: 'Evaluate deployment, scaling, and operational concerns',
      },
    ],
    facilitatorProfile: 'summarizer',
    deliberationStrategy: 'rounds',
    maxRounds: 2,
    votingStrategy: 'facilitator_judgment',
  },
];
