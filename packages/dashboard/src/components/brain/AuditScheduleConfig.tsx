/**
 * Audit Schedule Config — Phase 118
 *
 * Three cron fields with presets for daily/weekly/monthly audit schedules.
 * Follows ConsolidationSettings pattern.
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Save, Loader2 } from 'lucide-react';
import { fetchAuditSchedules, updateAuditSchedule } from '../../api/client';

const DAILY_PRESETS = [
  { label: 'Every night at 3:30 AM', value: '30 3 * * *' },
  { label: 'Every morning at 6 AM', value: '0 6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
];

const WEEKLY_PRESETS = [
  { label: 'Sunday 4 AM', value: '0 4 * * 0' },
  { label: 'Saturday midnight', value: '0 0 * * 6' },
  { label: 'Wednesday 3 AM', value: '0 3 * * 3' },
];

const MONTHLY_PRESETS = [
  { label: '1st of month 5 AM', value: '0 5 1 * *' },
  { label: '15th of month 4 AM', value: '0 4 15 * *' },
  { label: 'Last day midnight', value: '0 0 28 * *' },
];

function ScheduleSection({
  scope,
  value,
  onChange,
  onSave,
  isSaving,
  presets,
}: {
  scope: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  isSaving: boolean;
  presets: { label: string; value: string }[];
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium capitalize">{scope}</h3>
      <div className="grid grid-cols-3 gap-2">
        {presets.map((preset) => (
          <button
            key={preset.value}
            onClick={() => onChange(preset.value)}
            className={`px-3 py-2 rounded-lg text-xs border transition-colors ${
              value === preset.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:border-primary/30'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Cron expression"
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={onSave}
          disabled={isSaving}
          className="btn btn-ghost text-sm flex items-center gap-1"
        >
          {isSaving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Save className="w-3 h-3" />
          )}
          Save
        </button>
      </div>
    </div>
  );
}

export default function AuditScheduleConfig() {
  const queryClient = useQueryClient();
  const [schedules, setSchedules] = useState({
    daily: '30 3 * * *',
    weekly: '0 4 * * 0',
    monthly: '0 5 1 * *',
  });

  const { data } = useQuery({
    queryKey: ['audit-schedules'],
    queryFn: fetchAuditSchedules,
  });

  useEffect(() => {
    if (data?.schedules) {
      setSchedules({
        daily: data.schedules.daily ?? '30 3 * * *',
        weekly: data.schedules.weekly ?? '0 4 * * 0',
        monthly: data.schedules.monthly ?? '0 5 1 * *',
      });
    }
  }, [data?.schedules]);

  const mutation = useMutation({
    mutationFn: ({ scope, schedule }: { scope: string; schedule: string }) =>
      updateAuditSchedule(scope, schedule),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-schedules'] });
    },
  });

  const handleSave = useCallback(
    (scope: string) => {
      mutation.mutate({
        scope,
        schedule: schedules[scope as keyof typeof schedules],
      });
    },
    [schedules, mutation]
  );

  return (
    <div className="card">
      <div className="card-header flex flex-row items-center gap-2 p-3 sm:p-4">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <h2 className="card-title text-sm sm:text-base">Audit Schedules</h2>
      </div>
      <div className="card-content space-y-4 p-3 sm:p-4 pt-0 sm:pt-0">
        <ScheduleSection
          scope="daily"
          value={schedules.daily}
          onChange={(v) => setSchedules((s) => ({ ...s, daily: v }))}
          onSave={() => handleSave('daily')}
          isSaving={mutation.isPending}
          presets={DAILY_PRESETS}
        />
        <ScheduleSection
          scope="weekly"
          value={schedules.weekly}
          onChange={(v) => setSchedules((s) => ({ ...s, weekly: v }))}
          onSave={() => handleSave('weekly')}
          isSaving={mutation.isPending}
          presets={WEEKLY_PRESETS}
        />
        <ScheduleSection
          scope="monthly"
          value={schedules.monthly}
          onChange={(v) => setSchedules((s) => ({ ...s, monthly: v }))}
          onSave={() => handleSave('monthly')}
          isSaving={mutation.isPending}
          presets={MONTHLY_PRESETS}
        />
      </div>
    </div>
  );
}
