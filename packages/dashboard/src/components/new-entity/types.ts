export type IconComp = React.ComponentType<{ className?: string }>;

export type DialogStep =
  | 'select'
  | 'personality'
  | 'task'
  | 'skill'
  | 'experiment'
  | 'sub-agent'
  | 'custom-role'
  | 'proactive'
  | 'extension'
  | 'user'
  | 'workspace'
  | 'memory'
  | 'intent';

export type ConfigItem =
  | {
      kind: 'form';
      step: Exclude<DialogStep, 'select'>;
      icon: IconComp;
      label: string;
      desc: string;
    }
  | { kind: 'nav'; path: string; icon: IconComp; label: string; desc: string };

export interface NavItem {
  path: string;
  icon: IconComp;
  label: string;
  desc: string;
}

export interface NewEntityDialogProps {
  open: boolean;
  onClose: () => void;
}
