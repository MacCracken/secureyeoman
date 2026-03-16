import { MessageSquare, FileText, BookOpen } from 'lucide-react';
import type { ExportFormat } from './constants';

export const FORMAT_INFO: Record<
  ExportFormat,
  { label: string; description: string; icon: React.ReactNode }
> = {
  sharegpt: {
    label: 'ShareGPT JSONL',
    description:
      'Standard format for chat fine-tuning. Compatible with LLaMA Factory, Unsloth, axolotl, and most SFT frameworks. Each line is a full conversation.',
    icon: <MessageSquare className="w-4 h-4" />,
  },
  instruction: {
    label: 'Instruction JSONL',
    description:
      'Alpaca-style pairs: {"instruction":"...","output":"..."}. Each user/assistant exchange becomes one training example. Ideal for instruction-following SFT.',
    icon: <FileText className="w-4 h-4" />,
  },
  raw: {
    label: 'Raw Text Corpus',
    description:
      'Plain text with role labels. Use for unsupervised pre-training or contrastive embedding training (SimCSE, sentence-transformers NLI). No JSON overhead.',
    icon: <BookOpen className="w-4 h-4" />,
  },
};
