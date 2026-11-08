/** The order timeline, and the customer-facing 6-step progress tracker. */

import { dateTime } from '../lib/format';

/**
 * The 6 steps the customer understands:
 * Order placed → In review → Designing → Your approval → Printing → Completed
 */
export function ProgressTracker({ progress }) {
  if (!progress) return null;

  const { steps, ended, endedStatus } = progress;

  return (
    <div>
      {ended && (
        <p className="mb-4 rounded-lg border border-stone-300 bg-stone-100 px-3 py-2 text-sm">
          This order was {endedStatus === 'REJECTED' ? 'rejected' : 'cancelled'}, so it did not
          finish the steps below.
        </p>
      )}

      {/* Horizontal on a wide screen, vertical on a phone. */}
      <ol className="hidden items-start sm:flex">
        {steps.map((step, index) => (
          <li key={step.key} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <Rail show={index !== 0} done={step.state === 'done' || step.state === 'current'} />
              <Dot state={step.state} index={index} />
              <Rail show={index !== steps.length - 1} done={step.state === 'done'} />
            </div>
            <p className={`mt-2 px-1 text-xs ${labelTone(step.state)}`}>{step.label}</p>
          </li>
        ))}
      </ol>

      <ol className="space-y-3 sm:hidden">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-center gap-3">
            <Dot state={step.state} index={index} />
            <p className={`text-sm ${labelTone(step.state)}`}>{step.label}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function labelTone(state) {
  if (state === 'current') return 'font-semibold text-ink';
  if (state === 'done') return 'text-ink-soft';
  return 'text-stone-400';
}

function Rail({ show, done }) {
  return (
    <span
      className={`h-0.5 flex-1 ${!show ? 'bg-transparent' : done ? 'bg-ink' : 'bg-stone-200'}`}
      aria-hidden="true"
    />
  );
}

function Dot({ state, index }) {
  const base =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold';
  if (state === 'done') {
    return <span className={`${base} border-ink bg-ink text-stone-50`}>✓</span>;
  }
  if (state === 'current') {
    return (
      <span className={`${base} border-ink bg-white text-ink ring-4 ring-stone-200`}>
        {index + 1}
      </span>
    );
  }
  return <span className={`${base} border-stone-200 bg-white text-stone-400`}>{index + 1}</span>;
}

/** The full history, newest last, exactly as the API built it. */
export function Timeline({ entries }) {
  if (!entries || entries.length === 0) {
    return <p className="text-sm text-ink-faint">Nothing has happened yet.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-stone-200 pl-5">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute -left-[1.52rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-stone-400" />
          <p className="text-sm font-medium">{entry.label}</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {dateTime(entry.at)}
            {entry.by ? ` · ${entry.by.name} (${entry.by.role.toLowerCase()})` : ' · system'}
          </p>
          {entry.note && entry.note !== entry.label && (
            <p className="mt-1 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs text-ink-soft">
              {entry.note}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
