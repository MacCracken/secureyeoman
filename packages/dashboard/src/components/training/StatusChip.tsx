import { Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pending: {
      label: 'Pending',
      cls: 'bg-muted text-muted-foreground',
      icon: <Clock className="w-3 h-3" />,
    },
    running: {
      label: 'Running',
      cls: 'bg-primary/10 text-primary',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    complete: {
      label: 'Complete',
      cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    failed: {
      label: 'Failed',
      cls: 'bg-destructive/10 text-destructive',
      icon: <XCircle className="w-3 h-3" />,
    },
    cancelled: {
      label: 'Cancelled',
      cls: 'bg-muted text-muted-foreground',
      icon: <XCircle className="w-3 h-3" />,
    },
  };
  const info = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground', icon: null };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.cls}`}
    >
      {info.icon}
      {info.label}
    </span>
  );
}
