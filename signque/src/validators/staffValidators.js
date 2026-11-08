'use strict';

const { z } = require('zod');
const c = require('./common');

// ----------------------------------------------------------------- designer

const DESIGNER_JOB_STATUSES = ['DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', 'DESIGN_SUBMITTED'];

const designerJobsQuery = z.object({
  status: z.enum([...DESIGNER_JOB_STATUSES, 'all']).default('all'),
});

/** `note` arrives as a multipart text field alongside the file. */
const submitDesignSchema = z.object({
  note: z.string().trim().max(1000).optional().or(z.literal('').transform(() => undefined)),
});

// ------------------------------------------------------------------ printer

const printerJobsQuery = z.object({
  stage: z.enum(['ASSIGNED', 'CUTTING', 'PRINTING', 'QUALITY_CHECK', 'DONE']).optional(),
});

const updateStageSchema = z.object({
  stage: c.printerStageEnum,
  notes: z.string().trim().max(1000).optional().or(z.literal('').transform(() => undefined)),
});

// ------------------------------------------------------------ notifications

const notificationsQuery = z.object({
  unread: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

module.exports = {
  DESIGNER_JOB_STATUSES,
  designerJobsQuery,
  submitDesignSchema,
  printerJobsQuery,
  updateStageSchema,
  notificationsQuery,
};
