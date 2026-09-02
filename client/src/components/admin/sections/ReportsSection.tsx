import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { AdminFilterSelect } from '../AdminUi';

type Report = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string;
  status: string;
  admin_notes: string;
  reporter_name: string;
  reporter_email: string;
  created_at: string;
};

export function ReportsSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState('open');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['admin-reports', status],
    queryFn: () => api<Report[]>(`/admin/reports?status=${status}`),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, string> }) =>
      api(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reports'] }),
  });

  return (
    <div className="space-y-4">
      <AdminFilterSelect
        value={status}
        onChange={setStatus}
        options={[
          { value: 'open', label: t('admin.reportOpen') },
          { value: 'reviewing', label: t('admin.reportReviewing') },
          { value: 'resolved', label: t('admin.reportResolved') },
          { value: 'dismissed', label: t('admin.reportDismissed') },
          { value: 'all', label: t('admin.filterAll') },
        ]}
      />

      {isLoading ? (
        <p className="py-8 text-center text-slate-500">{t('common.loading')}</p>
      ) : reports.length === 0 ? (
        <p className="py-8 text-center text-slate-500">{t('admin.noReports')}</p>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-3 pt-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {t(`moderation.reason.${r.reason}`)} · {r.target_type}
                    </p>
                    <p className="text-sm text-slate-500">
                      {r.reporter_name} ({r.reporter_email}) · {new Date(r.created_at).toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">ID: {r.target_id}</p>
                    {r.details && <p className="mt-2 text-sm text-slate-600">{r.details}</p>}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {r.status}
                  </span>
                </div>
                <Textarea
                  rows={2}
                  placeholder={t('admin.adminNotes')}
                  value={notes[r.id] ?? r.admin_notes ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => patch.mutate({
                      id: r.id,
                      body: { status: 'reviewing', admin_notes: notes[r.id] ?? r.admin_notes },
                    })}
                  >
                    {t('admin.markReviewing')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => patch.mutate({
                      id: r.id,
                      body: { status: 'resolved', admin_notes: notes[r.id] ?? r.admin_notes },
                    })}
                  >
                    {t('admin.resolveReport')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => patch.mutate({
                      id: r.id,
                      body: { status: 'dismissed', admin_notes: notes[r.id] ?? r.admin_notes },
                    })}
                  >
                    {t('admin.dismissReport')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
