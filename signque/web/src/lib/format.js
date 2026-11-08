/** Shared display helpers: money, dates, statuses and stages. */

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

export function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? rupees.format(n) : '—';
}

export function dateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function dateOnly(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Human labels for every OrderStatus. */
export const STATUS_LABEL = {
  PENDING_PAYMENT: 'Waiting for payment',
  PAYMENT_FAILED: 'Payment failed',
  PLACED: 'Placed',
  DESIGN_ASSIGNED: 'Designer assigned',
  DESIGN_IN_PROGRESS: 'Design in progress',
  DESIGN_SUBMITTED: 'Design submitted',
  AWAITING_CUSTOMER_APPROVAL: 'Awaiting your approval',
  CUSTOMER_APPROVED: 'Design approved',
  PRINT_ASSIGNED: 'Sent to printing',
  PRINTING: 'Printing',
  PRINT_COMPLETED: 'Printing finished',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

/** Tailwind classes per status, so a chip reads at a glance. */
const STATUS_TONE = {
  PENDING_PAYMENT: 'border-amber-200 bg-amber-50 text-amber-800',
  PAYMENT_FAILED: 'border-red-200 bg-red-50 text-red-800',
  PLACED: 'border-blue-200 bg-blue-50 text-blue-800',
  DESIGN_ASSIGNED: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  DESIGN_IN_PROGRESS: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  DESIGN_SUBMITTED: 'border-violet-200 bg-violet-50 text-violet-800',
  AWAITING_CUSTOMER_APPROVAL: 'border-amber-200 bg-amber-50 text-amber-800',
  CUSTOMER_APPROVED: 'border-teal-200 bg-teal-50 text-teal-800',
  PRINT_ASSIGNED: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  PRINTING: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  PRINT_COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  REJECTED: 'border-red-200 bg-red-50 text-red-800',
  CANCELLED: 'border-stone-300 bg-stone-100 text-stone-700',
};

export function statusTone(status) {
  return STATUS_TONE[status] || 'border-stone-300 bg-stone-100 text-stone-700';
}

export const STAGE_LABEL = {
  ASSIGNED: 'Assigned',
  CUTTING: 'Cutting',
  PRINTING: 'Printing',
  QUALITY_CHECK: 'Quality check',
  DONE: 'Done',
};

export const ROLE_HOME = {
  CUSTOMER: '/',
  ADMIN: '/admin',
  DESIGNER: '/designer',
  PRINTER: '/printer',
};

export const ROLE_LABEL = {
  CUSTOMER: 'Customer',
  ADMIN: 'Admin',
  DESIGNER: 'Designer',
  PRINTER: 'Printing',
};
