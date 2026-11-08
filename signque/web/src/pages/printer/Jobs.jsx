/** The printing user's board: Assigned / Cutting / Printing / Quality check. */

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Spinner, ErrorPanel, PageHeader } from '../../components/ui';

const COLUMNS = [
  { stage: 'ASSIGNED', label: 'Assigned', hint: 'Take one to start.' },
  { stage: 'CUTTING', label: 'Cutting', hint: 'Nothing being cut.' },
  { stage: 'PRINTING', label: 'Printing', hint: 'Nothing on the printer.' },
  { stage: 'QUALITY_CHECK', label: 'Quality check', hint: 'Nothing to check.' },
];

export default function PrinterJobs() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['printer-jobs'],
    queryFn: () => api.get('/printer/jobs'),
    refetchInterval: 30000,
  });

  if (isLoading) return <Spinner label="Loading your jobs…" />;
  if (error) return <ErrorPanel error={error} onRetry={refetch} />;

  const jobs = data.jobs || [];
  const live = jobs.filter((job) => job.printJob && job.printJob.stage !== 'DONE');
  const done = jobs.filter((job) => job.printJob?.stage === 'DONE');

  return (
    <div>
      <PageHeader
        title="My print jobs"
        subtitle={`${live.length} live job${live.length === 1 ? '' : 's'}${done.length ? `, ${done.length} finished` : ''}.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => {
          const columnJobs = live.filter((job) => job.printJob.stage === column.stage);
          return (
            <section key={column.stage} className="rounded-xl bg-stone-100/70 p-3">
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
                  {columnJobs.map((job) => (
                    <Link
                      key={job.id}
                      to={`/printer/jobs/${job.id}`}
                      className="card block p-3 transition hover:border-stone-400"
                    >
                      <p className="font-semibold">{job.orderNumber}</p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-ink-soft">
                        {job.printJob.color === 'WHITE' ? 'White' : 'Black'} ·{' '}
                        {job.printJob.thicknessMm} mm · {job.printJob.size}
                      </p>
                      <p className="mt-1 truncate text-xs text-ink-faint">
                        {job.items.map((item) => item.product.title).join(', ')}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        Qty {job.items.reduce((n, i) => n + i.quantity, 0)} · {dateTime(job.updatedAt)}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="label">Finished</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {done.map((job) => (
              <Link key={job.id} to={`/printer/jobs/${job.id}`} className="card p-3 opacity-70">
                <p className="text-sm font-semibold">{job.orderNumber}</p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {dateTime(job.printJob.completedAt || job.updatedAt)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
