'use strict';

/**
 * THE transition table. This is the only place order status transitions are
 * defined — no other file may hard-code "status X can become status Y".
 *
 * `by` is the role allowed to make the move. SYSTEM means the server does it
 * (webhook, or the automatic PRINT_COMPLETED → COMPLETED step).
 */

const TRANSITIONS = Object.freeze({
  PENDING_PAYMENT: [
    { to: 'PLACED', by: 'SYSTEM' },
    { to: 'PAYMENT_FAILED', by: 'SYSTEM' },
    { to: 'CANCELLED', by: 'ADMIN' },
  ],
  PAYMENT_FAILED: [
    { to: 'PENDING_PAYMENT', by: 'CUSTOMER' },
    { to: 'CANCELLED', by: 'ADMIN' },
  ],
  PLACED: [
    { to: 'DESIGN_ASSIGNED', by: 'ADMIN' },
    { to: 'REJECTED', by: 'ADMIN' },
    { to: 'CANCELLED', by: 'ADMIN' },
  ],
  DESIGN_ASSIGNED: [
    { to: 'DESIGN_IN_PROGRESS', by: 'DESIGNER' },
    { to: 'CANCELLED', by: 'ADMIN' },
  ],
  DESIGN_IN_PROGRESS: [
    { to: 'DESIGN_SUBMITTED', by: 'DESIGNER' },
    { to: 'CANCELLED', by: 'ADMIN' },
  ],
  DESIGN_SUBMITTED: [
    { to: 'AWAITING_CUSTOMER_APPROVAL', by: 'ADMIN' },
    { to: 'DESIGN_IN_PROGRESS', by: 'ADMIN' },
    { to: 'CANCELLED', by: 'ADMIN' },
  ],
  AWAITING_CUSTOMER_APPROVAL: [
    { to: 'CUSTOMER_APPROVED', by: 'CUSTOMER' },
    { to: 'DESIGN_IN_PROGRESS', by: 'CUSTOMER' },
    { to: 'CANCELLED', by: 'ADMIN' },
  ],
  CUSTOMER_APPROVED: [
    { to: 'PRINT_ASSIGNED', by: 'ADMIN' },
    { to: 'CANCELLED', by: 'ADMIN' },
  ],
  PRINT_ASSIGNED: [
    { to: 'PRINTING', by: 'PRINTER' },
    { to: 'CANCELLED', by: 'ADMIN' },
  ],
  PRINTING: [
    { to: 'PRINT_COMPLETED', by: 'PRINTER' },
    { to: 'CANCELLED', by: 'ADMIN' },
  ],
  PRINT_COMPLETED: [{ to: 'COMPLETED', by: 'SYSTEM' }],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
});

/** Statuses from which nothing more can happen. */
const FINAL_STATUSES = Object.freeze(
  Object.keys(TRANSITIONS).filter((s) => TRANSITIONS[s].length === 0),
);

/** The actor role the engine uses when the server itself makes the change. */
const SYSTEM_ACTOR = 'SYSTEM';

/**
 * Is this move in the table at all, regardless of role?
 * @param {string} from @param {string} to
 */
function isKnownTransition(from, to) {
  const rules = TRANSITIONS[from];
  if (!rules) return false;
  return rules.some((r) => r.to === to);
}

/**
 * Is this move allowed for this role?
 * @param {string} from @param {string} to @param {string} role
 */
function isAllowed(from, to, role) {
  const rules = TRANSITIONS[from];
  if (!rules) return false;
  return rules.some((r) => r.to === to && r.by === role);
}

/** Every move allowed out of `from`, optionally for one role. */
function allowedFrom(from, role) {
  const rules = TRANSITIONS[from] || [];
  return (role ? rules.filter((r) => r.by === role) : rules).map((r) => ({ ...r }));
}

/** Which roles may make this move (empty when the move is unknown). */
function rolesFor(from, to) {
  const rules = TRANSITIONS[from] || [];
  return rules.filter((r) => r.to === to).map((r) => r.by);
}

function isFinal(status) {
  return FINAL_STATUSES.includes(status);
}

module.exports = {
  TRANSITIONS,
  FINAL_STATUSES,
  SYSTEM_ACTOR,
  isKnownTransition,
  isAllowed,
  allowedFrom,
  rolesFor,
  isFinal,
};
