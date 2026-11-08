/** The designer's board: Assigned / In progress / Submitted. */

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Spinner, ErrorPanel, PageHeader } from '../../components/ui';

const COLUMNS = [
  { status: 'DESIGN_ASSIGNED', label: 'Assigned', hint: 'Take one to start.' },
  { status: 'DESIGN_IN_PROGRESS', label: 'In progress', hint: 'Upload when ready.' },
  { status: 'DESIGN_SUBMITTED', label: 'Submitted', hint: 'Waiting on review.' },
];

export default function DesignerJobs() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['designer-jobs'],
    queryFn: () => api.get('/designer/jobs?status=all'),
    refetchInterval: 30000,
  });

  if (isLoading) return <Spinner label="Loading your jobs…" />;
  if (error) return <ErrorPanel error={error} onRetry={refetch} />;

  const jobs = data.jobs || [];

  return (
    <div>
      <PageHeader
        title="My design jobs"
        subtitle={`${jobs.length} job${jobs.length === 1 ? '' : 's'} assigned to you.`}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const columnJobs = jobs.filter((job) => job.status === column.status);
          return (
            <section key={column.status} className="rounded-xl bg-stone-100/70 p-3">
              <div className="mb-3 flex items-baseline justify-between px-1">
                <h2 className="text-sm font-bold uppercase tracking-wide">{column.label}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold">
                  {columnJobs.length}
                </span>
              </div>

              {columnJobs.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-ink-faint">{column.hint}</p>
              ) : (
                <div className="space-y-2">
                  {columnJobs.map((job) => {
                    const photo = job.items[0]?.customization?.photoUrl;
                    const latest = job.designVersions?.[0];
                    return (
                      <Link
                        key={job.id}
                        to={`/designer/jobs/${job.id}`}
                        className="card block p-3 transition hover:border-stone-400"
                      >
                        <div className="flex gap-3">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                            {photo && <img src={photo} alt="" className="h-full w-full object-cover" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold">{job.orderNumber}</p>
                            <p className="truncate text-xs text-ink-faint">
                              {job.items.map((item) => item.product.title).join(', ')}
                            </p>
                            <p className="mt-0.5 text-xs text-ink-faint">
                              {latest ? `v${latest.versionNo} · ` : ''}
                              {dateTime(job.updatedAt)}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
