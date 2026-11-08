import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { money, dateOnly } from '../../lib/format';
import { Spinner, ErrorPanel, EmptyState, PageHeader, StatusChip } from '../../components/ui';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'PENDING_PAYMENT', label: 'Awaiting payment' },
  { value: 'AWAITING_CUSTOMER_APPROVAL', label: 'Needs your approval' },
  { value: 'PRINTING', label: 'Printing' },
  { value: 'COMPLETED', label: 'Completed' },
];

export default function MyOrders() {
  const [status, setStatus] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-orders', status],
    queryFn: () => api.get(`/orders/mine${status ? `?status=${status}` : ''}`),
  });

  return (
    <div>
      <PageHeader title="My orders" subtitle="Track every frame you have ordered." />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatus(filter.value)}
            className={`chip ${
              status === filter.value
                ? 'border-ink bg-ink text-stone-50'
                : 'border-stone-300 bg-white text-ink-soft hover:bg-stone-100'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorPanel error={error} onRetry={refetch} />
      ) : (data.items || []).length === 0 ? (
        <EmptyState
          title="No orders here"
          hint={status ? 'Try a different filter.' : 'Your orders will appear here once you place one.'}
          action={
            <Link to="/" className="btn-primary btn-sm mt-2">
              Browse frames
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.items.map((order) => (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              className="card flex flex-wrap items-center gap-4 p-4 transition hover:border-stone-400"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{order.orderNumber}</p>
                <p className="mt-0.5 text-sm text-ink-faint">
                  {order.items.map((item) => item.product.title).join(', ')}
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">Placed {dateOnly(order.createdAt)}</p>
              </div>

              <div className="flex items-center gap-4">
                <StatusChip status={order.status} />
                <p className="font-semibold">{money(order.total)}</p>
              </div>

              {order.status === 'AWAITING_CUSTOMER_APPROVAL' && (
                <p className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Your design is ready — please review and approve it.
                </p>
              )}
              {order.status === 'PAYMENT_FAILED' && (
                <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                  The payment did not go through. Open the order to try again.
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
