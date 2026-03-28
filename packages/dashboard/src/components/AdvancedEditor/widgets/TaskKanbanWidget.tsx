import { useQuery } from '@tanstack/react-query';
import { fetchTasks } from '../../../api/client';
import { Loader2 } from 'lucide-react';
import type { Task } from '../../../types';

type KanbanStage = 'Planning' | 'Executing' | 'Validating' | 'Done' | 'Failed';

function getStage(status: string): KanbanStage {
  if (status === 'completed') return 'Done';
  if (status === 'failed') return 'Failed';
  if (status === 'running') return 'Executing';
  if (status === 'pending') return 'Planning';
  return 'Validating';
}

const STAGE_COLORS: Record<KanbanStage, string> = {
  Planning: 'text-blue-500',
  Executing: 'text-yellow-500',
  Validating: 'text-purple-500',
  Done: 'text-green-500',
  Failed: 'text-red-500',
};

export function TaskKanbanWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['canvas-tasks'],
    queryFn: () => fetchTasks(),
    refetchInterval: 5000,
  });

  const tasks: Task[] = data?.tasks ?? [];
  const stages: KanbanStage[] = ['Planning', 'Executing', 'Validating', 'Done', 'Failed'];
  const grouped = stages.reduce(
    (acc, s) => {
      acc[s] = tasks.filter((t) => getStage(t.status) === s);
      return acc;
    },
    {} as Record<KanbanStage, Task[]>
  );

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin w-4 h-4" />
      </div>
    );

  return (
    <div className="flex h-full gap-1 p-2 overflow-x-auto">
      {stages.map((stage) => (
        <div key={stage} className="flex-1 min-w-[100px] flex flex-col gap-1">
          <div className={`text-[10px] font-semibold uppercase ${STAGE_COLORS[stage]}`}>
            {stage} ({grouped[stage].length})
          </div>
          <div className="space-y-1 flex-1 overflow-y-auto">
            {grouped[stage].map((task) => (
              <div
                key={task.id}
                className="text-[10px] rounded border p-1.5 bg-card truncate"
                title={task.description ?? task.id}
              >
                {task.description ?? task.id}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
