/**
 * The customer's order page: the 6-step tracker, the full timeline, and — when
 * the order is awaiting their approval — a large design preview with Approve
 * and Request changes.
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { money, dateTime } from '../../lib/format';
import {
  Spinner,
  ErrorPanel,
  PageHeader,
  StatusChip,
  Field,
  MoneyRow,
  Toast,
  PrintSpec,
} from '../../components/ui';
import { ProgressTracker, Timeline } from '../../components/Timeline';

export default function OrderDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const [comment, setComment] = useState('');
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [toast, setToast] = useState(null);
  const [actionError, setActionError] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get(`/orders/${id}`),
  });

  /** Every action refetches, so a 409 just resolves into fresh state. */
  function mutation(fn, successMessage) {
    return {
      mutationFn: fn,
      onMutate: () => setActionError(null),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ['order', id] });
        await queryClient.invalidateQueries({ queryKey: ['my-orders'] });
        await queryClient.invalidateQueries({ queryKey: ['notifications'] });
        setToast({ message: successMessage, tone: 'ok' });
      },
      onError: async (err) => {
        if (err.isConflict) {
          await queryClient.invalidateQueries({ queryKey: ['order', id] });
          setToast({ message: 'This order was updated by someone else. Refreshed.', tone: 'warn' });
        } else {
          setActionError(err);
        }
      },
    };
  }

  const approve = useMutation(
    mutation(() => api.post(`/orders/${id}/design/approve`), 'Design approved. Thank you!'),
  );

  const requestChanges = useMutation(
    mutation(
      () => api.post(`/orders/${id}/design/request-changes`, { comment: comment.trim() }),
      'Your change request has been sent to the designer.',
    ),
  );

  const retryPayment = useMutation({
    mutationFn: () => api.post(`/orders/${id}/retry-payment`),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['order', id] });
      if (!window.Razorpay) {
        setToast({ message: 'Payment window could not load. Please try again.', tone: 'bad' });
        return;
      }
      const checkout = new window.Razorpay({
        key: result.razorpay.keyId,
        order_id: result.razorpay.orderId,
        amount: result.razorpay.amount,
        currency: result.razorpay.currency,
        name: 'SIGNQUE',
        description: `Order ${result.order.orderNumber}`,
        handler: async (response) => {
          try {
            await api.post(`/orders/${id}/verify-payment`, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
          } catch {
            // The webhook settles it either way.
          }
          await queryClient.invalidateQueries({ queryKey: ['order', id] });
        },
        theme: { color: '#1c1917' },
      });
      checkout.open();
    },
    onError: (err) => setActionError(err),
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorPanel error={error} onRetry={refetch} />;

  const order = data.order;
  const awaitingApproval = order.status === 'AWAITING_CUSTOMER_APPROVAL';
  const revisions = order.revisions;
  const commentTooShort = comment.trim().length < 5;

  return (
    <div>
      <Toast message={toast?.message} tone={toast?.tone} onDone={() => setToast(null)} />

      <PageHeader
        title={order.orderNumber}
        subtitle={`Placed ${dateTime(order.createdAt)}`}
        actions={<StatusChip status={order.status} />}
      />

      {/* --- the 6-step tracker ------------------------------------------- */}
      <section className="card-pad mb-6">
        <ProgressTracker progress={order.progress} />
      </section>

      {(order.rejectReason || order.cancelReason) && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">
            This order was {order.status === 'REJECTED' ? 'rejected' : 'cancelled'}
          </p>
          <p className="mt-1">{order.rejectReason || order.cancelReason}</p>
          <p className="mt-2 text-red-800">A refund has been started.</p>
        </div>
      )}

      {order.canRetryPayment && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">The payment did not go through</p>
          <p className="mt-1 text-sm text-amber-800">
            Nothing has been charged. You can try again now.
          </p>
          <button
            type="button"
            className="btn-primary btn-sm mt-3"
            onClick={() => retryPayment.mutate()}
            disabled={retryPayment.isPending}
          >
            {retryPayment.isPending ? 'Starting…' : 'Retry payment'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* --- the design, when the customer may act on it --------------- */}
          {order.design && (
            <section className="card-pad">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  Your design {order.design.versionNo ? `(version ${order.design.versionNo})` : ''}
                </h2>
                {awaitingApproval && (
                  <span className="chip border-amber-200 bg-amber-50 text-amber-800">
                    Waiting for your approval
                  </span>
                )}
              </div>

              <a
                href={order.design.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-xl border border-stone-200 bg-stone-100"
              >
                <img
                  src={order.design.fileUrl}
                  alt={`Design version ${order.design.versionNo}`}
                  className="max-h-[32rem] w-full object-contain"
                />
              </a>

              {order.design.designerNote && (
                <p className="mt-3 rounded-lg bg-stone-50 p-3 text-sm">
                  <span className="font-semibold">From the designer: </span>
                  {order.design.designerNote}
                </p>
              )}

              {awaitingApproval && (
                <div className="mt-4 border-t border-stone-200 pt-4">
                  {actionError && (
                    <div className="mb-3">
                      <ErrorPanel error={actionError} />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => approve.mutate()}
                      disabled={approve.isPending || requestChanges.isPending}
                    >
                      {approve.isPending ? 'Approving…' : 'Approve design'}
                    </button>

                    {revisions.canRequestChanges ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setShowChangeForm((v) => !v)}
                        disabled={approve.isPending}
                      >
                        Request changes
                      </button>
                    ) : (
                      <p className="flex items-center rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-ink-soft">
                        Contact support for more changes
                      </p>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-ink-faint">
                    {revisions.canRequestChanges
                      ? `${revisions.left} of ${revisions.max} change request${revisions.left === 1 ? '' : 's'} left.`
                      : `You have used all ${revisions.max} change requests.`}
                  </p>

                  {showChangeForm && revisions.canRequestChanges && (
                    <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
                      <Field
                        label="What should change?"
                        hint="At least 5 characters. The designer sees exactly this."
                      >
                        <textarea
                          className="input min-h-[96px]"
                          maxLength={1000}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="For example: the crop cuts off my daughter on the left."
                        />
                      </Field>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          disabled={commentTooShort || requestChanges.isPending}
                          onClick={() =>
                            requestChanges.mutate(undefined, {
                              onSuccess: () => {
                                setComment('');
                                setShowChangeForm(false);
                              },
                            })
                          }
                        >
                          {requestChanges.isPending ? 'Sending…' : 'Send change request'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => setShowChangeForm(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* --- items ---------------------------------------------------- */}
          <section className="card-pad">
            <h2 className="mb-3 font-semibold">Items</h2>
            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex gap-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                    {item.customization?.photoUrl && (
                      <img
                        src={item.customization.photoUrl}
                        alt="Your photo"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 text-sm">
                    <p className="font-medium">{item.product.title}</p>
                    <p className="text-ink-faint">
                      {money(item.unitPrice)} × {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold">{money(item.lineTotal)}</p>
                </div>
              ))}
            </div>
          </section>

          {order.printJob && (
            <section className="card-pad">
              <h2 className="mb-3 font-semibold">How it is being made</h2>
              <PrintSpec spec={order.printJob} size="sm" />
            </section>
          )}

          {/* --- the full timeline ---------------------------------------- */}
          <section className="card-pad">
            <h2 className="mb-3 font-semibold">History</h2>
            <Timeline entries={order.timeline} />
          </section>
        </div>

        {/* --- summary --------------------------------------------------- */}
        <aside className="space-y-4">
          <section className="card-pad">
            <h2 className="mb-2 font-semibold">Payment</h2>
            <MoneyRow label="Items" amount={order.subtotal} />
            <MoneyRow label="Shipping" amount={order.shippingFee} />
            <div className="mt-1 border-t border-stone-200 pt-1">
              <MoneyRow label="Total" amount={order.total} strong />
            </div>
            {order.payments?.length > 0 && (
              <p className="mt-2 text-xs text-ink-faint">
                Payment status: {order.payments[order.payments.length - 1].status.toLowerCase()}
              </p>
            )}
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
