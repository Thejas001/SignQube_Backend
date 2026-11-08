/**
 * The admin order page. The action panel is context-aware: it shows only what
 * the workflow allows at the current status, which the API tells us through
 * `availableActions`.
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { money, dateTime, STAGE_LABEL } from '../../lib/format';
import {
  Spinner,
  ErrorPanel,
  PageHeader,
  StatusChip,
  Field,
  MoneyRow,
  Toast,
  ConfirmPanel,
  PrintSpec,
} from '../../components/ui';
import { Timeline } from '../../components/Timeline';

const FINAL = ['COMPLETED', 'REJECTED', 'CANCELLED'];

export default function AdminOrderDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const [toast, setToast] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [panel, setPanel] = useState(null); // 'reject' | 'cancel' | 'sendBack' | 'reassignDesigner' | 'reassignPrinter'
  const [designerId, setDesignerId] = useState('');
  const [printerId, setPrinterId] = useState('');
  const [spec, setSpec] = useState({ color: 'WHITE', thicknessMm: 3, size: 'A4', notes: '' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => api.get(`/admin/orders/${id}`),
  });

  const { data: designers } = useQuery({
    queryKey: ['assignable', 'DESIGNER'],
    queryFn: () => api.get('/admin/users?role=DESIGNER'),
  });
  const { data: printers } = useQuery({
    queryKey: ['assignable', 'PRINTER'],
    queryFn: () => api.get('/admin/users?role=PRINTER'),
  });
  const { data: options } = useQuery({
    queryKey: ['print-options'],
    queryFn: () => api.get('/admin/print-options'),
  });

  function act(fn, successMessage) {
    return {
      mutationFn: fn,
      onMutate: () => setActionError(null),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ['admin-order', id] });
        await queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
        await queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
        await queryClient.invalidateQueries({ queryKey: ['assignable'] });
        setPanel(null);
        setToast({ message: successMessage, tone: 'ok' });
      },
      onError: async (err) => {
        if (err.isConflict) {
          await queryClient.invalidateQueries({ queryKey: ['admin-order', id] });
          setPanel(null);
          setToast({ message: 'This order was updated by someone else. Refreshed.', tone: 'warn' });
        } else {
          setActionError(err);
        }
      },
    };
  }

  const approve = useMutation(
    act(
      () => api.post(`/admin/orders/${id}/approve`, { designerId: Number(designerId) }),
      'Approved and assigned to the designer.',
    ),
  );
  const reject = useMutation(
    act((reason) => api.post(`/admin/orders/${id}/reject`, { reason }), 'Order rejected and a refund started.'),
  );
  const cancel = useMutation(
    act((reason) => api.post(`/admin/orders/${id}/cancel`, { reason }), 'Order cancelled.'),
  );
  const sendToCustomer = useMutation(
    act(() => api.post(`/admin/orders/${id}/design/approve`, {}), 'Design sent to the customer.'),
  );
  const sendBack = useMutation(
    act((note) => api.post(`/admin/orders/${id}/design/send-back`, { note }), 'Sent back to the designer.'),
  );
  const assignPrinting = useMutation(
    act(
      () =>
        api.post(`/admin/orders/${id}/print-job`, {
          printerId: Number(printerId),
          color: spec.color,
          thicknessMm: Number(spec.thicknessMm),
          size: spec.size,
          ...(spec.notes.trim() ? { notes: spec.notes.trim() } : {}),
        }),
      'Print job assigned.',
    ),
  );
  const reassignDesigner = useMutation(
    act(
      () => api.post(`/admin/orders/${id}/reassign-designer`, { designerId: Number(designerId) }),
      'Designer reassigned.',
    ),
  );
  const reassignPrinter = useMutation(
    act(
      () => api.post(`/admin/orders/${id}/reassign-printer`, { printerId: Number(printerId) }),
      'Printing user reassigned.',
    ),
  );

  if (isLoading) return <Spinner />;
  if (error) return <ErrorPanel error={error} onRetry={refetch} />;

  const order = data.order;
  const can = (action) => (order.availableActions || []).includes(action);
  const isFinal = FINAL.includes(order.status);
  const customerPhoto = order.items[0]?.customization?.photoUrl;
  const latestDesign = order.designVersions[order.designVersions.length - 1];
  const busy =
    approve.isPending ||
    reject.isPending ||
    cancel.isPending ||
    sendToCustomer.isPending ||
    sendBack.isPending ||
    assignPrinting.isPending;

  return (
    <div>
      <Toast message={toast?.message} tone={toast?.tone} onDone={() => setToast(null)} />

      <PageHeader
        title={order.orderNumber}
        subtitle={`${order.customer.name} · placed ${dateTime(order.createdAt)}`}
        actions={
          <>
            <StatusChip status={order.status} />
            <Link to="/admin/orders" className="btn-secondary btn-sm">
              Back to orders
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {/* ---------- the context-aware action panel -------------------- */}
          <section className="card-pad">
            <h2 className="mb-1 font-semibold">What you can do now</h2>
            <p className="mb-4 text-sm text-ink-faint">
              Only the actions the workflow allows at <strong>{order.status}</strong> are shown.
            </p>

            {actionError && (
              <div className="mb-4">
                <ErrorPanel error={actionError} />
              </div>
            )}

            {/* PLACED: approve with a designer, or reject with a reason */}
            {can('DESIGN_ASSIGNED') && (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <h3 className="text-sm font-semibold">Review the photo</h3>
                <p className="mt-1 text-sm text-ink-soft">
                  Check the customer photo on the right, then assign a designer or reject the order.
                </p>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                  <Field label="Designer">
                    <select
                      className="input"
                      value={designerId}
                      onChange={(e) => setDesignerId(e.target.value)}
                    >
                      <option value="">Choose a designer…</option>
                      {(designers?.users || []).map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} — {user.openJobs} open job{user.openJobs === 1 ? '' : 's'}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex items-end">
                    <button
                      type="button"
                      className="btn-primary w-full"
                      disabled={!designerId || busy}
                      onClick={() => approve.mutate()}
                    >
                      {approve.isPending ? 'Approving…' : 'Approve'}
                    </button>
                  </div>
                </div>

                {can('REJECTED') && (
                  <>
                    <button
                      type="button"
                      className="btn-danger btn-sm mt-3"
                      onClick={() => setPanel(panel === 'reject' ? null : 'reject')}
                    >
                      Reject order
                    </button>
                    <ConfirmPanel
                      open={panel === 'reject'}
                      danger
                      requireReason
                      reasonLabel="Why are you rejecting it?"
                      title="Reject this order?"
                      description="The customer is told the reason and a full refund is started. This cannot be undone."
                      confirmLabel="Reject and refund"
                      busy={reject.isPending}
                      onConfirm={(reason) => reject.mutate(reason)}
                      onCancel={() => setPanel(null)}
                    />
                  </>
                )}
              </div>
            )}

            {/* DESIGN_SUBMITTED: send to the customer, or send back */}
            {can('AWAITING_CUSTOMER_APPROVAL') && (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <h3 className="text-sm font-semibold">
                  Check design v{latestDesign?.versionNo}
                </h3>
                <p className="mt-1 text-sm text-ink-soft">
                  Compare it with the customer photo below, then send it on or back.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => sendToCustomer.mutate()}
                  >
                    {sendToCustomer.isPending ? 'Sending…' : 'Send to customer'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setPanel(panel === 'sendBack' ? null : 'sendBack')}
                  >
                    Send back
                  </button>
                </div>

                <ConfirmPanel
                  open={panel === 'sendBack'}
                  requireReason
                  reasonLabel="What should the designer change?"
                  title="Send this design back?"
                  description="The designer sees your note and the order returns to design in progress. The customer never sees this version."
                  confirmLabel="Send back with notes"
                  busy={sendBack.isPending}
                  onConfirm={(note) => sendBack.mutate(note)}
                  onCancel={() => setPanel(null)}
                />
              </div>
            )}

            {/* CUSTOMER_APPROVED: the print spec form */}
            {can('PRINT_ASSIGNED') && (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <h3 className="text-sm font-semibold">Set the print spec</h3>

                <fieldset className="mt-3">
                  <span className="label">Material colour</span>
                  <div className="flex gap-2">
                    {(options?.colors || ['WHITE', 'BLACK']).map((color) => (
                      <label
                        key={color}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                          spec.color === color ? 'border-ink bg-white' : 'border-stone-300 bg-white/60'
                        }`}
                      >
                        <input
                          type="radio"
                          name="color"
                          value={color}
                          checked={spec.color === color}
                          onChange={() => setSpec({ ...spec, color })}
                        />
                        {color === 'WHITE' ? 'White' : 'Black'}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Thickness">
                    <select
                      className="input"
                      value={spec.thicknessMm}
                      onChange={(e) => setSpec({ ...spec, thicknessMm: Number(e.target.value) })}
                    >
                      {(options?.thicknessesMm || [2, 3, 4, 5, 6, 8]).map((mm) => (
                        <option key={mm} value={mm}>
                          {mm} mm
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Size">
                    <select
                      className="input"
                      value={spec.size}
                      onChange={(e) => setSpec({ ...spec, size: e.target.value })}
                    >
                      {(options?.sizes || ['A1', 'A2', 'A3', 'A4']).map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="mt-3">
                  <Field label="Notes for the printing user" hint="Optional.">
                    <textarea
                      className="input min-h-[70px]"
                      maxLength={1000}
                      value={spec.notes}
                      onChange={(e) => setSpec({ ...spec, notes: e.target.value })}
                      placeholder="For example: polish all four edges."
                    />
                  </Field>
                </div>

                <div className="mt-3">
                  <Field label="Printing user">
                    <select
                      className="input"
                      value={printerId}
                      onChange={(e) => setPrinterId(e.target.value)}
                    >
                      <option value="">Choose a printing user…</option>
                      {(printers?.users || []).map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} — {user.openJobs} open job{user.openJobs === 1 ? '' : 's'}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <button
                  type="button"
                  className="btn-primary mt-3 w-full"
                  disabled={!printerId || busy}
                  onClick={() => assignPrinting.mutate()}
                >
                  {assignPrinting.isPending ? 'Assigning…' : 'Assign for printing'}
                </button>
              </div>
            )}

            {/* Reassignment, where the workflow allows it */}
            {['DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS'].includes(order.status) && (
              <div className="mt-3 rounded-xl border border-stone-200 p-4">
                <h3 className="text-sm font-semibold">Reassign the designer</h3>
                <p className="mt-1 text-xs text-ink-faint">
                  Currently {order.assignedDesigner?.name}. The status does not change.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select
                    className="input flex-1"
                    value={designerId}
                    onChange={(e) => setDesignerId(e.target.value)}
                  >
                    <option value="">Choose a designer…</option>
                    {(designers?.users || [])
                      .filter((u) => u.id !== order.assignedDesignerId)
                      .map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} — {user.openJobs} open
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!designerId || reassignDesigner.isPending}
                    onClick={() => reassignDesigner.mutate()}
                  >
                    Reassign
                  </button>
                </div>
              </div>
            )}

            {['PRINT_ASSIGNED', 'PRINTING'].includes(order.status) && (
              <div className="mt-3 rounded-xl border border-stone-200 p-4">
                <h3 className="text-sm font-semibold">Reassign the printing user</h3>
                <p className="mt-1 text-xs text-ink-faint">
                  Currently {order.assignedPrinter?.name}. The status does not change.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select
                    className="input flex-1"
                    value={printerId}
                    onChange={(e) => setPrinterId(e.target.value)}
                  >
                    <option value="">Choose a printing user…</option>
                    {(printers?.users || [])
                      .filter((u) => u.id !== order.assignedPrinterId)
                      .map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} — {user.openJobs} open
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!printerId || reassignPrinter.isPending}
                    onClick={() => reassignPrinter.mutate()}
                  >
                    Reassign
                  </button>
                </div>
              </div>
            )}

            {/* Cancel, at any non-final status */}
            {can('CANCELLED') && (
              <div className="mt-3 border-t border-stone-200 pt-3">
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  onClick={() => setPanel(panel === 'cancel' ? null : 'cancel')}
                >
                  Cancel order
                </button>
                <ConfirmPanel
                  open={panel === 'cancel'}
                  danger
                  requireReason
                  reasonLabel="Why are you cancelling?"
                  title="Cancel this order?"
                  description="The customer is told the reason. If the order was paid, a refund is started. This cannot be undone."
                  confirmLabel="Cancel the order"
                  busy={cancel.isPending}
                  onConfirm={(reason) => cancel.mutate(reason)}
                  onCancel={() => setPanel(null)}
                />
              </div>
            )}

            {isFinal && (
              <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-ink-soft">
                This order is {order.status.toLowerCase()} — nothing more can be done to it.
                {order.rejectReason && ` Reason: ${order.rejectReason}`}
                {order.cancelReason && ` Reason: ${order.cancelReason}`}
              </p>
            )}

            {!isFinal && (order.availableActions || []).length === 0 && (
              <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-ink-soft">
                Nothing for you to do right now — the order is with the{' '}
                {order.status.startsWith('DESIGN') ? 'designer' : 'printing team'}.
              </p>
            )}
          </section>

          {/* ---------- the design versions ------------------------------- */}
          <section className="card-pad">
            <h2 className="mb-3 font-semibold">
              Design versions{' '}
              <span className="text-sm font-normal text-ink-faint">
                ({order.designVersions.length})
              </span>
            </h2>

            {order.designVersions.length === 0 ? (
              <p className="text-sm text-ink-faint">No design has been submitted yet.</p>
            ) : (
              <div className="space-y-5">
                {[...order.designVersions].reverse().map((version) => (
                  <div key={version.id} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Version {version.versionNo}</p>
                      <span className="chip border-stone-300 bg-stone-100 text-ink-soft">
                        {version.status.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {version.designer?.name} · {dateTime(version.createdAt)}
                    </p>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <a
                        href={version.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="overflow-hidden rounded-lg border border-stone-200 bg-stone-100"
                      >
                        <img
                          src={version.fileUrl}
                          alt={`Design version ${version.versionNo}`}
                          className="h-56 w-full object-contain"
                        />
                        <p className="border-t border-stone-200 bg-white px-2 py-1 text-center text-xs text-ink-faint">
                          The design
                        </p>
                      </a>

                      {customerPhoto && (
                        <a
                          href={customerPhoto}
                          target="_blank"
                          rel="noreferrer"
                          className="overflow-hidden rounded-lg border border-stone-200 bg-stone-100"
                        >
                          <img
                            src={customerPhoto}
                            alt="Customer photo"
                            className="h-56 w-full object-contain"
                          />
                          <p className="border-t border-stone-200 bg-white px-2 py-1 text-center text-xs text-ink-faint">
                            The customer photo
                          </p>
                        </a>
                      )}
                    </div>

                    {version.designerNote && (
                      <p className="mt-3 rounded-lg bg-stone-50 p-2.5 text-sm">
                        <span className="font-semibold">Designer: </span>
                        {version.designerNote}
                      </p>
                    )}

                    {version.reviews?.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {version.reviews.map((review) => (
                          <li
                            key={review.id}
                            className={`rounded-lg p-2.5 text-sm ${
                              review.decision === 'APPROVED'
                                ? 'bg-emerald-50 text-emerald-900'
                                : 'bg-amber-50 text-amber-900'
                            }`}
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide">
                              {review.reviewerRole.toLowerCase()} ·{' '}
                              {review.decision === 'APPROVED' ? 'approved' : 'asked for changes'}
                            </p>
                            {review.comment && <p className="mt-0.5">{review.comment}</p>}
                            <p className="mt-0.5 text-xs opacity-70">{dateTime(review.createdAt)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {order.printJob && (
            <section className="card-pad">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-semibold">Print job</h2>
                <span className="chip border-cyan-200 bg-cyan-50 text-cyan-800">
                  {STAGE_LABEL[order.printJob.stage] || order.printJob.stage}
                </span>
              </div>
              <PrintSpec spec={order.printJob} size="sm" />
              <p className="mt-3 text-xs text-ink-faint">
                Assigned to {order.printJob.printer?.name} by {order.printJob.assignedBy?.name}
                {order.printJob.startedAt ? ` · started ${dateTime(order.printJob.startedAt)}` : ''}
                {order.printJob.completedAt ? ` · finished ${dateTime(order.printJob.completedAt)}` : ''}
              </p>
            </section>
          )}

          <section className="card-pad">
            <h2 className="mb-3 font-semibold">Full timeline</h2>
            <Timeline entries={order.timeline} />
          </section>
        </div>

        {/* ---------- the sidebar --------------------------------------- */}
        <aside className="space-y-4">
          {customerPhoto && (
            <section className="card overflow-hidden">
              <a href={customerPhoto} target="_blank" rel="noreferrer">
                <img src={customerPhoto} alt="Customer photo" className="w-full object-contain" />
              </a>
              <p className="border-t border-stone-200 px-3 py-2 text-xs text-ink-faint">
                The customer photo. Open it to check the quality at full size.
              </p>
            </section>
          )}

          <section className="card-pad text-sm">
            <h2 className="mb-2 font-semibold">Customer</h2>
            <p className="font-medium">{order.customer.name}</p>
            <p className="text-ink-soft">{order.customer.email}</p>
            {order.customer.phone && <p className="text-ink-soft">{order.customer.phone}</p>}
            <p className="mt-2 text-xs text-ink-faint">
              {order.revisions.used} of {order.revisions.max} change requests used
            </p>
          </section>

          <section className="card-pad">
            <h2 className="mb-2 font-semibold">Payment</h2>
            <MoneyRow label="Items" amount={order.subtotal} />
            <MoneyRow label="Shipping" amount={order.shippingFee} />
            <div className="mt-1 border-t border-stone-200 pt-1">
              <MoneyRow label="Total" amount={order.total} strong />
            </div>
            <ul className="mt-3 space-y-2 text-xs">
              {order.payments.map((payment) => (
                <li key={payment.id} className="rounded-lg bg-stone-50 p-2">
                  <p className="font-semibold">{payment.status}</p>
                  <p className="text-ink-faint">{money(payment.amount)}</p>
                  <p className="break-all text-ink-faint">{payment.razorpayOrderId}</p>
                  {payment.refundId && (
                    <p className="break-all text-ink-faint">Refund: {payment.refundId}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="card-pad text-sm">
            <h2 className="mb-2 font-semibold">Assignments</h2>
            <p className="text-ink-faint">
              Designer: <span className="text-ink">{order.assignedDesigner?.name || '—'}</span>
            </p>
            <p className="text-ink-faint">
              Printing: <span className="text-ink">{order.assignedPrinter?.name || '—'}</span>
            </p>
          </section>

          <section className="card-pad text-sm">
            <h2 className="mb-2 font-semibold">Delivering to</h2>
            <p className="font-medium">{order.address.fullName}</p>
            <p className="text-ink-soft">
              {order.address.line1}
              {order.address.line2 ? `, ${order.address.line2}` : ''}
            </p>
            <p className="text-ink-soft">
              {order.address.city}, {order.address.state} {order.address.pincode}
            </p>
            <p className="text-ink-faint">{order.address.phone}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
