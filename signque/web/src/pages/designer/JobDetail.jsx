/**
 * One design job: the customer photo (downloadable), every past version with
 * the admin and customer comments, Take job, and the upload area.
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import {
  Spinner,
  ErrorPanel,
  PageHeader,
  StatusChip,
  Field,
  Toast,
  PrintSpec,
} from '../../components/ui';
import { Timeline } from '../../components/Timeline';

const MAX_DESIGN_BYTES = 25 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'application/pdf'];

export default function DesignerJobDetail() {
  const { orderId } = useParams();
  const queryClient = useQueryClient();

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState('');
  const [toast, setToast] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [fileError, setFileError] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['designer-job', orderId],
    queryFn: () => api.get(`/designer/jobs/${orderId}`),
  });

  function settle(message) {
    return {
      onMutate: () => setActionError(null),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ['designer-job', orderId] });
        await queryClient.invalidateQueries({ queryKey: ['designer-jobs'] });
        await queryClient.invalidateQueries({ queryKey: ['notifications'] });
        setToast({ message, tone: 'ok' });
      },
      onError: async (err) => {
        if (err.isConflict) {
          await queryClient.invalidateQueries({ queryKey: ['designer-job', orderId] });
          setToast({ message: 'This order was updated by someone else. Refreshed.', tone: 'warn' });
        } else {
          setActionError(err);
        }
      },
    };
  }

  const take = useMutation({
    mutationFn: () => api.post(`/designer/jobs/${orderId}/take`),
    ...settle('Job taken. It is yours to work on.'),
  });

  const submit = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append('file', file);
      if (note.trim()) formData.append('note', note.trim());
      return api.upload(`/designer/jobs/${orderId}/submit`, formData);
    },
    ...settle('Design submitted for review.'),
    onSuccess: async (...args) => {
      await settle('Design submitted for review.').onSuccess(...args);
      setFile(null);
      setPreview(null);
      setNote('');
    },
  });

  function choose(event) {
    const chosen = event.target.files?.[0];
    setFileError(null);
    if (!chosen) return;

    if (!ALLOWED.includes(chosen.type)) {
      setFileError('The design must be a PNG, JPG or PDF.');
      return;
    }
    if (chosen.size > MAX_DESIGN_BYTES) {
      setFileError('That file is larger than 25 MB.');
      return;
    }

    setFile(chosen);
    setPreview(chosen.type === 'application/pdf' ? null : URL.createObjectURL(chosen));
  }

  if (isLoading) return <Spinner />;
  if (error) return <ErrorPanel error={error} onRetry={refetch} />;

  const job = data.job;
  const photo = job.items[0]?.customization?.photoUrl;

  return (
    <div>
      <Toast message={toast?.message} tone={toast?.tone} onDone={() => setToast(null)} />

      <PageHeader
        title={job.orderNumber}
        subtitle={`${job.items.map((i) => i.product.title).join(', ')} · quantity ${job.items.reduce((n, i) => n + i.quantity, 0)}`}
        actions={
          <>
            <StatusChip status={job.status} />
            <Link to="/designer" className="btn-secondary btn-sm">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {/* --- what to do now ------------------------------------------- */}
          {job.canTake && (
            <section className="card-pad">
              <h2 className="font-semibold">Ready to start?</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Taking the job marks it as in progress so nobody else picks it up.
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

          {job.canSubmit && (
            <section className="card-pad">
              <h2 className="font-semibold">Submit a design</h2>
              <p className="mt-1 text-sm text-ink-soft">
                PNG, JPG or PDF, up to 25 MB. This creates version{' '}
                {(job.designVersions?.length || 0) + 1} and sends it to the admin for review.
              </p>

              <div className="mt-4 space-y-4">
                <Field label="Design file" error={fileError}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    onChange={choose}
                    className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-stone-50 hover:file:bg-stone-700"
                  />
                </Field>

                {preview && (
                  <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
                    <img src={preview} alt="Your design" className="max-h-80 w-full object-contain" />
                  </div>
                )}
                {file && !preview && (
                  <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
                    {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                )}

                <Field label="Note for the reviewer" hint="Optional.">
                  <textarea
                    className="input min-h-[80px]"
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="For example: centred crop with a 10 mm white border."
                  />
                </Field>

                <button
                  type="button"
                  className="btn-primary"
                  disabled={!file || submit.isPending}
                  onClick={() => submit.mutate()}
                >
                  {submit.isPending ? 'Uploading…' : 'Submit design'}
                </button>
              </div>
            </section>
          )}

          {!job.canTake && !job.canSubmit && (
            <section className="card-pad text-sm text-ink-soft">
              {job.status === 'DESIGN_SUBMITTED'
                ? 'Your design is with the admin for review. You will be notified if anything needs changing.'
                : `Nothing to do here right now — this order is ${job.status.replace(/_/g, ' ').toLowerCase()}.`}
            </section>
          )}

          {/* --- comments, front and centre ------------------------------- */}
          {job.reviews?.length > 0 && (
            <section className="card-pad">
              <h2 className="mb-3 font-semibold">What you have been asked to change</h2>
              <ul className="space-y-3">
                {[...job.reviews].reverse().map((review) => (
                  <li
                    key={review.id}
                    className={`rounded-xl border-l-4 p-3 ${
                      review.decision === 'APPROVED'
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-amber-400 bg-amber-50'
                    }`}
                  >
                    <p className="text-xs font-bold uppercase tracking-wide">
                      {review.reviewerRole === 'ADMIN' ? 'Admin' : 'Customer'} ·{' '}
                      {review.decision === 'APPROVED' ? 'approved' : 'asked for changes'} · v
                      {review.designVersion.versionNo}
                    </p>
                    {review.comment && <p className="mt-1 text-sm">{review.comment}</p>}
                    <p className="mt-1 text-xs opacity-70">{dateTime(review.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* --- past versions ------------------------------------------- */}
          <section className="card-pad">
            <h2 className="mb-3 font-semibold">
              My versions{' '}
              <span className="text-sm font-normal text-ink-faint">
                ({job.designVersions.length})
              </span>
            </h2>

            {job.designVersions.length === 0 ? (
              <p className="text-sm text-ink-faint">You have not submitted a version yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[...job.designVersions].reverse().map((version) => (
                  <div key={version.id} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">v{version.versionNo}</p>
                      <span className="chip border-stone-300 bg-stone-100 text-ink-soft">
                        {version.status.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </div>
                    <a
                      href={version.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block overflow-hidden rounded-lg bg-stone-100"
                    >
                      <img
                        src={version.fileUrl}
                        alt={`Version ${version.versionNo}`}
                        className="h-40 w-full object-contain"
                      />
                    </a>
                    {version.designerNote && (
                      <p className="mt-2 text-xs text-ink-soft">{version.designerNote}</p>
                    )}
                    <p className="mt-1 text-xs text-ink-faint">{dateTime(version.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card-pad">
            <h2 className="mb-3 font-semibold">History</h2>
            <Timeline entries={(job.history || []).map(toTimelineEntry)} />
          </section>
        </div>

        {/* --- the customer photo, downloadable ------------------------- */}
        <aside className="space-y-4">
          <section className="card overflow-hidden">
            <div className="bg-stone-100">
              {photo ? (
                <img src={photo} alt="Customer photo" className="w-full object-contain" />
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-ink-faint">
                  No photo
                </div>
              )}
            </div>
            <div className="border-t border-stone-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Customer photo
              </p>
              {photo && (
                <a
                  href={photo}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="btn-secondary btn-sm mt-2 w-full"
                >
                  Download original
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

          {job.printSpec && (
            <section className="card-pad">
              <h2 className="mb-2 font-semibold">Print spec</h2>
              <PrintSpec spec={job.printSpec} size="sm" />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The designer endpoint returns raw history rows; shape them for Timeline. */
function toTimelineEntry(row) {
  const LABEL = {
    PENDING_PAYMENT: 'Waiting for payment',
    PAYMENT_FAILED: 'Payment failed',
    PLACED: 'Order placed',
    DESIGN_ASSIGNED: 'Designer assigned',
    DESIGN_IN_PROGRESS: 'Design in progress',
    DESIGN_SUBMITTED: 'Design submitted',
    AWAITING_CUSTOMER_APPROVAL: 'Sent to the customer',
    CUSTOMER_APPROVED: 'Customer approved',
    PRINT_ASSIGNED: 'Sent to printing',
    PRINTING: 'Printing',
    PRINT_COMPLETED: 'Printing finished',
    COMPLETED: 'Completed',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
  };
  return {
    id: row.id,
    at: row.createdAt,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    label:
      row.fromStatus === row.toStatus
        ? row.note || 'Assignment updated'
        : LABEL[row.toStatus] || row.toStatus,
    note: row.note,
    by: row.changedByUser ? { name: row.changedByUser.name, role: row.changedByUser.role } : null,
  };
}
