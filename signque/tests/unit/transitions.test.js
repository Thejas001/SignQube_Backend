'use strict';

/** The transition table itself: shape, coverage and the helper predicates. */

const transitions = require('../../src/services/workflow/transitions');
const { ORDER_STATUS } = require('../../src/config/constants');

const ALL_STATUSES = Object.keys(ORDER_STATUS);
const ROLES = ['CUSTOMER', 'ADMIN', 'DESIGNER', 'PRINTER', 'SYSTEM'];

describe('transition table', () => {
  it('has an entry for every OrderStatus', () => {
    for (const status of ALL_STATUSES) {
      expect(transitions.TRANSITIONS[status]).toBeDefined();
    }
    expect(Object.keys(transitions.TRANSITIONS).sort()).toEqual(ALL_STATUSES.sort());
  });

  it('only ever points at a real status, and only names a real role', () => {
    for (const [from, rules] of Object.entries(transitions.TRANSITIONS)) {
      for (const rule of rules) {
        expect(ALL_STATUSES).toContain(rule.to);
        expect(ROLES).toContain(rule.by);
        expect(rule.to).not.toBe(from);
      }
    }
  });

  it('treats COMPLETED, REJECTED and CANCELLED as final', () => {
    // FINAL_STATUSES is frozen, so sort a copy.
    expect([...transitions.FINAL_STATUSES].sort()).toEqual(['CANCELLED', 'COMPLETED', 'REJECTED']);
    for (const status of transitions.FINAL_STATUSES) {
      expect(transitions.isFinal(status)).toBe(true);
      expect(transitions.allowedFrom(status)).toEqual([]);
    }
  });

  it('lets an admin cancel from every non-final status except PRINT_COMPLETED', () => {
    const cancellable = ALL_STATUSES.filter(
      (s) => !transitions.isFinal(s) && s !== 'PRINT_COMPLETED',
    );
    for (const status of cancellable) {
      expect(transitions.isAllowed(status, 'CANCELLED', 'ADMIN')).toBe(true);
    }
  });

  describe('isKnownTransition', () => {
    it('is true for a move in the table, whatever the role', () => {
      expect(transitions.isKnownTransition('PLACED', 'DESIGN_ASSIGNED')).toBe(true);
    });

    it('is false for a move that is not in the table', () => {
      expect(transitions.isKnownTransition('PLACED', 'COMPLETED')).toBe(false);
      expect(transitions.isKnownTransition('PLACED', 'PRINTING')).toBe(false);
      expect(transitions.isKnownTransition('COMPLETED', 'PLACED')).toBe(false);
    });

    it('is false for an unknown status', () => {
      expect(transitions.isKnownTransition('NOT_A_STATUS', 'PLACED')).toBe(false);
    });
  });

  describe('isAllowed', () => {
    it('is true only for the role named in the table', () => {
      expect(transitions.isAllowed('DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', 'DESIGNER')).toBe(true);
      expect(transitions.isAllowed('DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', 'ADMIN')).toBe(false);
      expect(transitions.isAllowed('DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', 'CUSTOMER')).toBe(false);
    });

    it('keeps the two DESIGN_IN_PROGRESS routes with their own roles', () => {
      // Admin sends back from DESIGN_SUBMITTED; the customer requests changes
      // from AWAITING_CUSTOMER_APPROVAL. Neither may use the other's route.
      expect(transitions.isAllowed('DESIGN_SUBMITTED', 'DESIGN_IN_PROGRESS', 'ADMIN')).toBe(true);
      expect(transitions.isAllowed('DESIGN_SUBMITTED', 'DESIGN_IN_PROGRESS', 'CUSTOMER')).toBe(false);
      expect(transitions.isAllowed('AWAITING_CUSTOMER_APPROVAL', 'DESIGN_IN_PROGRESS', 'CUSTOMER')).toBe(true);
      expect(transitions.isAllowed('AWAITING_CUSTOMER_APPROVAL', 'DESIGN_IN_PROGRESS', 'ADMIN')).toBe(false);
    });

    it('reserves payment outcomes and completion for SYSTEM', () => {
      expect(transitions.isAllowed('PENDING_PAYMENT', 'PLACED', 'SYSTEM')).toBe(true);
      expect(transitions.isAllowed('PENDING_PAYMENT', 'PLACED', 'CUSTOMER')).toBe(false);
      expect(transitions.isAllowed('PRINT_COMPLETED', 'COMPLETED', 'SYSTEM')).toBe(true);
      expect(transitions.isAllowed('PRINT_COMPLETED', 'COMPLETED', 'PRINTER')).toBe(false);
    });
  });

  describe('rolesFor', () => {
    it('names the roles allowed to make a move', () => {
      expect(transitions.rolesFor('PLACED', 'DESIGN_ASSIGNED')).toEqual(['ADMIN']);
      expect(transitions.rolesFor('PLACED', 'COMPLETED')).toEqual([]);
    });
  });

  describe('allowedFrom', () => {
    it('can be narrowed to one role', () => {
      expect(transitions.allowedFrom('AWAITING_CUSTOMER_APPROVAL', 'CUSTOMER').map((r) => r.to).sort()).toEqual(
        ['CUSTOMER_APPROVED', 'DESIGN_IN_PROGRESS'],
      );
      expect(transitions.allowedFrom('AWAITING_CUSTOMER_APPROVAL', 'ADMIN').map((r) => r.to)).toEqual(['CANCELLED']);
      expect(transitions.allowedFrom('AWAITING_CUSTOMER_APPROVAL', 'PRINTER')).toEqual([]);
    });

    it('returns copies, so a caller cannot mutate the table', () => {
      const rules = transitions.allowedFrom('PLACED');
      rules[0].to = 'TAMPERED';
      expect(transitions.TRANSITIONS.PLACED[0].to).toBe('DESIGN_ASSIGNED');
    });
  });

  it('can reach COMPLETED from PENDING_PAYMENT by the happy path', () => {
    const happyPath = [
      ['PENDING_PAYMENT', 'PLACED', 'SYSTEM'],
      ['PLACED', 'DESIGN_ASSIGNED', 'ADMIN'],
      ['DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', 'DESIGNER'],
      ['DESIGN_IN_PROGRESS', 'DESIGN_SUBMITTED', 'DESIGNER'],
      ['DESIGN_SUBMITTED', 'AWAITING_CUSTOMER_APPROVAL', 'ADMIN'],
      ['AWAITING_CUSTOMER_APPROVAL', 'CUSTOMER_APPROVED', 'CUSTOMER'],
      ['CUSTOMER_APPROVED', 'PRINT_ASSIGNED', 'ADMIN'],
      ['PRINT_ASSIGNED', 'PRINTING', 'PRINTER'],
      ['PRINTING', 'PRINT_COMPLETED', 'PRINTER'],
      ['PRINT_COMPLETED', 'COMPLETED', 'SYSTEM'],
    ];
    for (const [from, to, role] of happyPath) {
      expect(transitions.isAllowed(from, to, role)).toBe(true);
    }
  });
});
