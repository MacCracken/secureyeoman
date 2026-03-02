import type { SecurityPolicy } from '../api/client';

/**
 * Default mock SecurityPolicy for tests.
 * Spread with overrides: `mockPolicy({ allowSubAgents: true })`
 */
export function mockPolicy(overrides: Partial<SecurityPolicy> = {}): SecurityPolicy {
  return {
    allowSubAgents: false,
    allowA2A: false,
    allowSwarms: false,
    allowExtensions: false,
    allowExecution: true,
    allowProactive: false,
    allowWorkflows: false,
    allowCommunityGitFetch: false,
    allowExperiments: false,
    allowStorybook: false,
    allowMultimodal: false,
    allowDesktopControl: false,
    allowCamera: false,
    allowDynamicTools: false,
    sandboxDynamicTools: true,
    allowAnomalyDetection: false,
    sandboxGvisor: false,
    sandboxWasm: false,
    sandboxCredentialProxy: false,
    allowNetworkTools: false,
    allowNetBoxWrite: false,
    allowTwingate: false,
    allowOrgIntent: false,
    allowIntentEditor: true,
    allowCodeEditor: true,
    allowAdvancedEditor: false,
    allowTrainingExport: false,
    promptGuardMode: 'warn',
    responseGuardMode: 'warn',
    jailbreakThreshold: 0.5,
    jailbreakAction: 'warn',
    strictSystemPromptConfidentiality: false,
    abuseDetectionEnabled: true,
    contentGuardrailsEnabled: false,
    contentGuardrailsPiiMode: 'disabled',
    contentGuardrailsToxicityEnabled: false,
    contentGuardrailsToxicityMode: 'warn',
    contentGuardrailsToxicityThreshold: 0.7,
    contentGuardrailsBlockList: [],
    contentGuardrailsBlockedTopics: [],
    contentGuardrailsGroundingEnabled: false,
    contentGuardrailsGroundingMode: 'flag',
    ...overrides,
  };
}
