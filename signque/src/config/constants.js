'use strict';

/** Single source of truth for the fixed value sets the API and UI share. */

const ROLES = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
  DESIGNER: 'DESIGNER',
  PRINTER: 'PRINTER',
});

const ORDER_STATUS = Object.freeze({
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PLACED: 'PLACED',
  DESIGN_ASSIGNED: 'DESIGN_ASSIGNED',
  DESIGN_IN_PROGRESS: 'DESIGN_IN_PROGRESS',
  DESIGN_SUBMITTED: 'DESIGN_SUBMITTED',
  AWAITING_CUSTOMER_APPROVAL: 'AWAITING_CUSTOMER_APPROVAL',
  CUSTOMER_APPROVED: 'CUSTOMER_APPROVED',
  PRINT_ASSIGNED: 'PRINT_ASSIGNED',
  PRINTING: 'PRINTING',
  PRINT_COMPLETED: 'PRINT_COMPLETED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
});

const FINAL_STATUSES = Object.freeze(['COMPLETED', 'REJECTED', 'CANCELLED']);

/** Print spec option sets. Exposed through GET /api/admin/print-options. */
const MATERIAL_COLORS = Object.freeze(['WHITE', 'BLACK']);
const THICKNESSES_MM = Object.freeze([2, 3, 4, 5, 6, 8]);
const SHEET_SIZES = Object.freeze(['A1', 'A2', 'A3', 'A4']);

const PRINT_STAGES = Object.freeze({
  ASSIGNED: 'ASSIGNED',
  CUTTING: 'CUTTING',
  PRINTING: 'PRINTING',
  QUALITY_CHECK: 'QUALITY_CHECK',
  DONE: 'DONE',
});

/** Stages a printer may move a live job between. DONE is reached by /complete. */
const PRINTER_SETTABLE_STAGES = Object.freeze(['CUTTING', 'PRINTING', 'QUALITY_CHECK']);

const UPLOAD_LIMITS = Object.freeze({
  photo: {
    maxBytes: 15 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/heic', 'image/heif'],
    extensions: ['.jpg', '.jpeg', '.png', '.heic', '.heif'],
  },
  design: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    extensions: ['.jpg', '.jpeg', '.png', '.pdf'],
  },
});

/** Pre-signed GET URL lifetime, in seconds. */
const PRESIGN_TTL_SECONDS = 10 * 60;

const NOTIFICATION_TYPE = Object.freeze({
  ORDER_PLACED: 'ORDER_PLACED',
  ORDER_RECEIVED: 'ORDER_RECEIVED',
  DESIGNER_ASSIGNED: 'DESIGNER_ASSIGNED',
  DESIGN_SUBMITTED: 'DESIGN_SUBMITTED',
  DESIGN_SENT_BACK: 'DESIGN_SENT_BACK',
  DESIGN_READY_FOR_CUSTOMER: 'DESIGN_READY_FOR_CUSTOMER',
  CUSTOMER_REQUESTED_CHANGES: 'CUSTOMER_REQUESTED_CHANGES',
  CUSTOMER_APPROVED: 'CUSTOMER_APPROVED',
  PRINT_ASSIGNED: 'PRINT_ASSIGNED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  ORDER_REJECTED: 'ORDER_REJECTED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
});

const PAGINATION = Object.freeze({ defaultPageSize: 20, maxPageSize: 100 });

module.exports = {
  ROLES,
  ORDER_STATUS,
  FINAL_STATUSES,
  MATERIAL_COLORS,
  THICKNESSES_MM,
  SHEET_SIZES,
  PRINT_STAGES,
  PRINTER_SETTABLE_STAGES,
  UPLOAD_LIMITS,
  PRESIGN_TTL_SECONDS,
  NOTIFICATION_TYPE,
  PAGINATION,
};
