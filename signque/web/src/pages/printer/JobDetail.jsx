/**
 * One print job: the approved design to download, the print spec shown large,
 * Take job, the stage buttons, and Mark complete — enabled only at quality
 * check.
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { dateTime, STAGE_LABEL } from '../../lib/format';
import {
  Spinner,
  ErrorPanel,
  PageHeader,
  StatusChip,
  Field,
  Toast,
  ConfirmPanel,
  PrintSpec,
} from '../../components/ui';

export default function PrinterJobDetail() {
  const { orderId } = useParams();
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['printer-job', orderId],
    queryFn: () => api.get(`/printer/jobs/${orderId}`),
  });

  function settle(message) {
    return {
      onMutate: () => setActionError(null),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ['printer-job', orderId] });
        await queryClient.invalidateQueries({ queryKey: ['printer-jobs'] });
        await queryClient.invalidateQueries({ queryKey: ['notifications'] });
        setConfirming(false);
        setToast({ message, tone: 'ok' });
      },
      onError: async (err) => {
        if (err.isConflict) {
          await queryClient.invalidateQueries({ queryKey: ['printer-job', orderId] });
          setConfirming(false);
          setToast({ message: 'This order was updated by someone else. Refreshed.', tone: 'warn' });
        } else {
          setActionError(err);
        }
      },
    };
  }

  const take = useMutation({
    mutationFn: () => api.post(`/printer/jobs/${orderId}/take`),
    ...settle('Job taken. Cutting has started.'),
  });

  const setStage = useMutation({
    mutationFn: (stage) =>
      api.patch(`/printer/jobs/${orderId}/stage`, {
        stage,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
    ...settle('Stage updated.'),
  });

  const complete = useMutation({
    mutationFn: () => api.post(`/printer/jobs/${orderId}/complete`),
    ...settle('Job complete. The order is now completed and the customer has been told.'),
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorPanel error={error} onRetry={refetch} />;

  const job = data.job;
  const stage = job.printJob?.stage;
  const quantity = job.totalQuantity;

  return (
    <div>
      <Toast message={toast?.message} tone={toast?.tone} onDone={() => setToast(null)} />

      <PageHeader
        title={job.orderNumber}
        subtitle={job.items.map((item) => item.product.title).join(', ')}
        actions={
          <>
            <StatusChip status={job.status} />
            <Link to="/printer" className="btn-secondary btn-sm">
              Back to my jobs
            </Link>
          </>
        }
      />

      {actionError && (
        <div className="mb-4">
          <ErrorPanel error={actionError} />
        </div>
      )}

      {/* --- the spec, large and unmissable -------------------------------- */}
      <section className="card-pad mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Print this</h2>
          <div className="flex items-center gap-2">
            <span className="chip border-stone-300 bg-stone-100 text-ink-soft">
              Quantity {quantity}
            </span>
            {stage && (
              <span className="chip border-cyan-200 bg-cyan-50 text-cyan-800">
                {STAGE_LABEL[stage] || stage}
              </span>
            )}
          </div>
        </div>
        <PrintSpec spec={job.printSpec} size="lg" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {/* --- take the job ------------------------------------------- */}
          {job.canTake && (
            <section className="card-pad">
              <h2 className="font-semibold">Ready to start?</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Taking the job moves it to cutting so nobody else picks it up.
              </p>
              <button
                type="button"
                className="btn-primary mt-3"
                onClick={() => take.mutate()}
                disabled={take.isPending}
              >
                {take.isPending ? 'Taking…' : 'Take job'}
              </button>
            </section>
          )}

          {/* --- the stage buttons -------------------------------------- */}
          {job.canUpdateStage && (
            <section className="card-pad">
              <h2 className="font-semibold">Production stage</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Move it along as you work. If the quality check fails, send it back to cutting or
                printing.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {job.settableStages.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={stage === option ? 'btn-primary' : 'btn-secondary'}
                    disabled={stage === option || setStage.isPending}
                    onClick={() => setStage.mutate(option)}
                  >
                    {STAGE_LABEL[option]}
                    {stage === option ? ' (current)' : ''}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <Field label="Notes" hint="Optional. Saved with the next stage change.">
                  <textarea
                    className="input min-h-[70px]"
                    maxLength={1000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="For example: edge chipped, recutting."
                  />
                </Field>
              </div>
            </section>
          )}

          {/* --- mark complete ------------------------------------------ */}
          {(job.canUpdateStage || job.canComplete) && (
            <section className="card-pad">
              <h2 className="font-semibold">Finish the job</h2>
              <p className="mt-1 text-sm text-ink-soft">
                {job.canComplete
                  ? 'The quality check has passed. Completing it finishes the order and tells the customer.'
                  : 'A job can only be completed from the quality check stage.'}
              </p>

              <button
                type="button"
                className="btn-primary mt-3"
                disabled={!job.canComplete || complete.isPending}
                onClick={() => setConfirming(true)}
              >
                Mark complete
              </button>

              <ConfirmPanel
                open={confirming}
                title="Mark this job complete?"
                description="The order moves to completed and the customer is told it is done. This cannot be undone."
                confirmLabel="Yes, it is done"
                busy={complete.isPending}
                onConfirm={() => complete.mutate()}
                onCancel={() => setConfirming(false)}
              />
            </section>
          )}

          {stage === 'DONE' && (
            <section className="card-pad text-sm text-ink-soft">
              This job was finished {dateTime(job.printJob.completedAt)}. Nothing more to do.
            </section>
          )}
        </div>

        {/* --- the approved design ------------------------------------- */}
        <aside className="space-y-4">
          <section className="card overflow-hidden">
            <div className="bg-stone-100">
              {job.design ? (
                <img
                  src={job.design.fileUrl}
                  alt={`Approved design version ${job.design.versionNo}`}
                  className="w-full object-contain"
                />
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-ink-faint">
                  No approved design
                </div>
              )}
            </div>
            <div className="border-t border-stone-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Approved design
                {job.design ? ` · v${job.design.versionNo}` : ''}
              </p>
              {job.design && (
                <a
                  href={job.design.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="btn-primary btn-sm mt-2 w-full"
                >
                  Download the print file
                </a>
              )}
            </div>
          </section>

          <section className="card-pad text-sm">
            <h2 className="mb-2 font-semibold">Order</h2>
            {job.items.map((item) => (
              <div key={item.id} className="mb-2">
                <p className="font-medium">{item.product.title}</p>
                <p className="text-ink-faint">Quantity: {item.quantity}</p>
              </div>
            ))}
            <p className="mt-2 text-xs text-ink-faint">Customer: {job.customer?.name}</p>
          </section>

          {job.printJob?.notes && (
            <section className="card-pad text-sm">
              <h2 className="mb-1 font-semibold">Notes from the admin</h2>
              <p className="text-ink-soft">{job.printJob.notes}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
