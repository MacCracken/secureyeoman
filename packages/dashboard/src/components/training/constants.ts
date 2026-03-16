/**
 * Shared types and constants for the Training sub-tabs.
 */

export type TabType =
  | 'export'
  | 'distillation'
  | 'finetune'
  | 'live'
  | 'computer-use'
  | 'evaluation'
  | 'preferences'
  | 'experiments'
  | 'deployment';

export type ExportFormat = 'sharegpt' | 'instruction' | 'raw';
