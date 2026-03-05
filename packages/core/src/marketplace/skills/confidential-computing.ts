/**
 * Confidential Computing Skill
 * TEE attestation verification, hardware detection, and compliance reporting.
 */

import type { MarketplaceSkill } from '@secureyeoman/shared';

export const confidentialComputingSkill: Partial<MarketplaceSkill> = {
  name: 'Confidential Computing',
  description:
    'Manages TEE (Trusted Execution Environment) attestation for AI providers — verifies Intel SGX, AMD SEV, AWS Nitro, and NVIDIA Confidential Computing. Provides hardware detection, remote attestation, and compliance chain-of-custody reporting.',
  category: 'security',
  author: 'YEOMAN',
  authorInfo: {
    name: 'YEOMAN',
    github: 'MacCracken',
    website: 'https://secureyeoman.ai',
  },
  version: '2026.3.5',
  instructions: [
    'Role: You are a confidential computing specialist. You help users verify that their AI provider infrastructure uses Trusted Execution Environments (TEEs) for data-in-use protection.',
    '',
    '## 1. Hardware Detection',
    '',
    'Start by assessing the local TEE hardware:',
    '- Use `tee_providers` to list TEE-capable providers and detect local hardware (SGX, SEV, TPM, NVIDIA CC)',
    '- Explain which hardware is available and its security implications',
    '',
    '## 2. Provider Attestation',
    '',
    'Verify provider TEE compliance:',
    '- Use `tee_status` to check attestation history for specific providers',
    '- Use `tee_verify` to force a fresh attestation check',
    '- Explain attestation results and technology used (SGX, SEV-SNP, TDX, Nitro)',
    '',
    '## 3. Compliance Reporting',
    '',
    'Help with regulatory compliance:',
    '- Map TEE coverage to EU AI Act requirements',
    '- Identify gaps in confidential computing posture',
    '- Recommend configuration changes for security.tee settings',
  ].join('\n'),
  tags: [
    'confidential-computing',
    'tee',
    'sgx',
    'sev',
    'nitro',
    'attestation',
    'data-in-use',
    'eu-ai-act',
  ],
  triggerPatterns: [
    '(confidential|trusted).{0,15}(computing|execution|environment)',
    '(tee|sgx|sev|nitro).{0,15}(attestation|verify|status)',
    '(hardware|gpu).{0,15}(confidential|enclave)',
    '(data.in.use).{0,15}(protection|encryption)',
  ],
  useWhen:
    'User asks about TEE attestation, confidential computing, hardware enclave detection, or provider TEE compliance verification',
  doNotUseWhen:
    'User wants general encryption at rest/in transit (use standard security tools), application-level security review, or network security audit',
  successCriteria:
    'Clear assessment of TEE hardware availability, provider attestation status, and actionable compliance recommendations',
  routing: 'fuzzy',
  autonomyLevel: 'L2',
  mcpToolsAllowed: [
    'tee_providers',
    'tee_status',
    'tee_verify',
  ],
};
