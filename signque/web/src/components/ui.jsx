/** Small shared pieces used across all four role areas. */

import { useEffect, useState } from 'react';
import { STATUS_LABEL, statusTone, money } from '../lib/format';

export function StatusChip({ status, className = '' }) {
  return (
    <span className={`chip ${statusTone(status)} ${className}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-ink-faint">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-ink" />
      {label}
    </div>
  );
}

/**
 * Error panel. A 409 from the workflow gets the wording the spec asks for,
 * because it means someone else moved the order on.
 */
export function ErrorPanel({ error, onRetry }) {
  if (!error) return null;
  const conflict = error.status === 409;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-semibold">
        {conflict ? 'This order was updated by someone else. Refreshed.' : 'Something went wrong'}
      </p>
      {!conflict && <p className="mt-1">{error.message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary btn-sm mt-3">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-faint">{hint}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-faint">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, error, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

/** A banner that fades itself out, for "Design submitted" style feedback. */
export function Toast({ message, tone = 'ok', onDone }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => onDone?.(), 4000);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  if (!message) return null;
  const tones = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    bad: 'border-red-200 bg-red-50 text-red-900',
  };
  return (
    <div className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-lg ${tones[tone]}`}>
      {message}
    </div>
  );
}

/**
 * A confirm-inside-the-page panel, used for destructive actions like cancelling
 * an order. No browser dialog, and a reason can be required.
 */
export function ConfirmPanel({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger = false,
  requireReason = false,
  reasonLabel = 'Reason',
  minLength = 5,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  if (!open) return null;

  const tooShort = requireReason && reason.trim().length < minLength;

  return (
    <div className={`mt-3 rounded-xl border p-4 ${danger ? 'border-red-200 bg-red-50' : 'border-stone-200 bg-stone-50'}`}>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}

      {requireReason && (
        <div className="mt-3">
          <Field label={reasonLabel} hint={`At least ${minLength} characters.`}>
            <textarea
              className="input min-h-[80px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              placeholder="Tell them why…"
            />
          </Field>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={danger ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
          disabled={busy || tooShort}
          onClick={() => onConfirm(reason.trim())}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel} disabled={busy}>
          Keep as is
        </button>
      </div>
    </div>
  );
}

/** A labelled money or text row for summary panels. */
export function SummaryRow({ label, value, strong = false }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? 'font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-sm text-ink-faint'}>{label}</span>
      <span className={strong ? '' : 'text-sm'}>{value}</span>
    </div>
  );
}

export function MoneyRow({ label, amount, strong }) {
  return <SummaryRow label={label} value={money(amount)} strong={strong} />;
}

/** A big, clear print spec readout — the printer needs this unmissable. */
export function PrintSpec({ spec, size = 'lg' }) {
  if (!spec) return <p className="text-sm text-ink-faint">No print spec yet.</p>;
  const cells = [
    { label: 'Material colour', value: spec.color === 'WHITE' ? 'White' : 'Black' },
    { label: 'Thickness', value: `${spec.thicknessMm} mm` },
    { label: 'Size', value: spec.size },
  ];
  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{cell.label}</p>
            <p className={`mt-1 font-bold ${size === 'lg' ? 'text-2xl' : 'text-lg'}`}>{cell.value}</p>
          </div>
        ))}
      </div>
      {spec.notes && (
        <p className="mt-3 rounded-lg border border-stone-200 bg-white p-3 text-sm">
          <span className="font-semibold">Notes: </span>
          {spec.notes}
        </p>
      )}
    </div>
  );
}
