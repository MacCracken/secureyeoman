import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Download, Loader2, Plus } from 'lucide-react';

interface ReportSummary {
  id: string;
  title: string;
  format: string;
  generatedAt: number;
  entryCount: number;
  sizeBytes: number;
}

async function fetchReports(): Promise<{ reports: ReportSummary[]; total: number }> {
  const res = await fetch('/api/v1/reports', { headers: { Authorization: `Bearer ${localStorage.getItem('friday_token')}` } });
  if (!res.ok) throw new Error('Failed to fetch reports');
  return res.json();
}

async function generateReport(opts: { title: string; format: string }): Promise<{ report: ReportSummary }> {
  const res = await fetch('/api/v1/reports/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('friday_token')}` },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error('Failed to generate report');
  return res.json();
}

export function ReportsPage() {
  const queryClient = useQueryClient();
  const [format, setFormat] = useState('json');
  const { data, isLoading } = useQuery({ queryKey: ['reports'], queryFn: fetchReports });
  const mutation = useMutation({
    mutationFn: generateReport,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['reports'] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Generate and download audit reports</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="json">JSON</option>
            <option value="html">HTML</option>
            <option value="csv">CSV</option>
          </select>
          <button
            className="btn btn-primary flex items-center gap-2"
            onClick={() => mutation.mutate({ title: `Audit Report - ${new Date().toLocaleDateString()}`, format })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Generate
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : !data?.reports.length ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No reports generated yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.reports.map((report) => (
            <div key={report.id} className="card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium">{report.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(report.generatedAt).toLocaleString()} · {report.entryCount} entries · {(report.sizeBytes / 1024).toFixed(1)} KB · {report.format.toUpperCase()}
                  </p>
                </div>
              </div>
              <a
                href={`/api/v1/reports/${report.id}/download`}
                className="btn btn-ghost p-2"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
