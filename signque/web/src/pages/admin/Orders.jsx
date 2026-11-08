import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { money, dateOnly, STATUS_LABEL } from '../../lib/format';
import { Spinner, ErrorPanel, EmptyState, PageHeader, StatusChip } from '../../components/ui';

const ALL_STATUSES = Object.keys(STATUS_LABEL);

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');

  const filters = {
    status: params.get('status') || '',
    designerId: params.get('designerId') || '',
    printerId: params.get('printerId') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
    search: params.get('search') || '',
    page: Number(params.get('page') || 1),
  };

  function setFilter(patch) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Any filter change starts at page one.
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, String(value));
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-orders', query.toString()],
    queryFn: () => api.get(`/admin/orders?${query.toString()}`),
  });

  const { data: designers } = useQuery({
    queryKey: ['assignable', 'DESIGNER'],
    queryFn: () => api.get('/admin/users?role=DESIGNER'),
  });
  const { data: printers } = useQuery({
    queryKey: ['assignable', 'PRINTER'],
    queryFn: () => api.get('/admin/users?role=PRINTER'),
  });

  const activeFilters = Object.entries(filters).filter(
    ([key, value]) => value && key !== 'page',
  ).length;

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={data ? `${data.pagination.total} matching order${data.pagination.total === 1 ? '' : 's'}` : null}
        actions={
          activeFilters > 0 && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setParams(new URLSearchParams())}>
              Clear filters ({activeFilters})
            </button>
          )
        }
      />

      <section className="card-pad mb-5">
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter({ search });
          }}
        >
          <div className="lg:col-span-2">
            <span className="label">Search</span>
            <input
              className="input"
              placeholder="Order number, customer or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div>
            <span className="label">Status</span>
            <select
              className="input"
              value={filters.status}
              onChange={(e) => setFilter({ status: e.target.value })}
            >
              <option value="">Any</option>
              {ALL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="label">Designer</span>
            <select
              className="input"
              value={filters.designerId}
              onChange={(e) => setFilter({ designerId: e.target.value })}
            >
              <option value="">Any</option>
              {(designers?.users || []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="label">From</span>
            <input
              type="date"
              className="input"
              value={filters.from ? filters.from.slice(0, 10) : ''}
              onChange={(e) => setFilter({ from: e.target.value })}
            />
          </div>

          <div>
            <span className="label">To</span>
            <input
              type="date"
              className="input"
              value={filters.to ? filters.to.slice(0, 10) : ''}
              onChange={(e) => setFilter({ to: e.target.value })}
            />
          </div>

          <div>
            <span className="label">Printing user</span>
            <select
              className="input"
              value={filters.printerId}
              onChange={(e) => setFilter({ printerId: e.target.value })}
            >
              <option value="">Any</option>
              {(printers?.users || []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end lg:col-span-1">
            <button type="submit" className="btn-primary w-full">
              Search
            </button>
          </div>
        </form>
      </section>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorPanel error={error} onRetry={refetch} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No orders match" hint="Try widening the filters." />
      ) : (
        <>
          {/* Table on a wide screen, cards on a phone. */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left">
                <tr>
                  <Th>Order</Th>
                  <Th>Customer</Th>
                  <Th>Status</Th>
                  <Th>Designer</Th>
                  <Th>Printing</Th>
                  <Th>Placed</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((order) => (
                  <tr key={order.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                    <td className="px-3 py-2.5">
                      <Link to={`/admin/orders/${order.id}`} className="font-semibold underline">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <p>{order.customer.name}</p>
                      <p className="text-xs text-ink-faint">{order.customer.phone || order.customer.email}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusChip status={order.status} />
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">{order.assignedDesigner?.name || '—'}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{order.assignedPrinter?.name || '—'}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{dateOnly(order.createdAt)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{money(order.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {data.items.map((order) => (
              <Link key={order.id} to={`/admin/orders/${order.id}`} className="card block p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{order.orderNumber}</p>
                  <StatusChip status={order.status} />
                </div>
                <p className="mt-1 text-sm">{order.customer.name}</p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {dateOnly(order.createdAt)} · {money(order.total)}
                </p>
                <p className="mt-1 text-xs text-ink-faint">
                  Designer: {order.assignedDesigner?.name || '—'} · Printing:{' '}
                  {order.assignedPrinter?.name || '—'}
                </p>
              </Link>
            ))}
          </div>

          {data.pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={filters.page <= 1}
                onClick={() => setFilter({ page: String(filters.page - 1) })}
              >
                Previous
              </button>
              <p className="text-sm text-ink-faint">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </p>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={filters.page >= data.pagination.totalPages}
                onClick={() => setFilter({ page: String(filters.page + 1) })}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Th({ children, className = '' }) {
  return (
    <th className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint ${className}`}>
      {children}
    </th>
  );
}
