import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { STATUS_LABEL, statusTone } from '../../lib/format';
import { Spinner, ErrorPanel, PageHeader } from '../../components/ui';

/** The order the status cards are shown in — roughly the workflow order. */
const CARD_ORDER = [
  'PLACED',
  'DESIGN_ASSIGNED',
  'DESIGN_IN_PROGRESS',
  'DESIGN_SUBMITTED',
  'AWAITING_CUSTOMER_APPROVAL',
  'CUSTOMER_APPROVED',
  'PRINT_ASSIGNED',
  'PRINTING',
  'PRINT_COMPLETED',
  'COMPLETED',
  'PENDING_PAYMENT',
  'PAYMENT_FAILED',
  'REJECTED',
  'CANCELLED',
];

/** Statuses that need an admin to do something next. */
const NEEDS_ATTENTION = ['PLACED', 'DESIGN_SUBMITTED', 'CUSTOMER_APPROVED'];

export default function Dashboard() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get('/admin/dashboard'),
    refetchInterval: 30000,
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorPanel error={error} onRetry={refetch} />;

  const { statusCounts, totalOrders, designers, printers } = data;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${totalOrders} order${totalOrders === 1 ? '' : 's'} in the system. Click a card to filter the orders table.`}
      />

      <h2 className="label">Waiting on you</h2>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {NEEDS_ATTENTION.map((status) => (
          <Link
            key={status}
            to={`/admin/orders?status=${status}`}
            className={`card p-4 transition hover:border-stone-400 ${
              statusCounts[status] > 0 ? 'ring-1 ring-amber-200' : ''
            }`}
          >
            <p className="text-3xl font-bold">{statusCounts[status]}</p>
            <p className="mt-1 text-sm font-medium">{STATUS_LABEL[status]}</p>
            <p className="mt-0.5 text-xs text-ink-faint">{ACTION_HINT[status]}</p>
          </Link>
        ))}
      </div>

      <h2 className="label">Every status</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {CARD_ORDER.map((status) => (
          <Link
            key={status}
            to={`/admin/orders?status=${status}`}
            className="card p-3 transition hover:border-stone-400"
          >
            <p className="text-2xl font-bold">{statusCounts[status]}</p>
            <p className={`chip mt-2 ${statusTone(status)}`}>{STATUS_LABEL[status]}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LoadPanel title="Open jobs per designer" people={designers} empty="No designers yet." />
        <LoadPanel title="Open jobs per printing user" people={printers} empty="No printing users yet." />
      </div>
    </div>
  );
}

const ACTION_HINT = {
  PLACED: 'Check the photo, then approve or reject.',
  DESIGN_SUBMITTED: 'Review the design and send it on.',
  CUSTOMER_APPROVED: 'Set the print spec and assign printing.',
};

function LoadPanel({ title, people, empty }) {
  const busiest = Math.max(1, ...people.map((p) => p.openJobs));

  return (
    <section className="card-pad">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {people.length === 0 ? (
        <p className="text-sm text-ink-faint">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {people.map((person) => (
            <li key={person.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">{person.name}</p>
                <p className="text-sm font-semibold">{person.openJobs}</p>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-ink"
                  style={{ width: `${(person.openJobs / busiest) * 100}%` }}
                />
              </div>
              <p className="mt-0.5 text-xs text-ink-faint">{person.email}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
