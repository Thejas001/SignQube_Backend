'use strict';

const { z } = require('zod');
const c = require('./common');

/** Role is deliberately absent — registration always creates a CUSTOMER. */
const registerSchema = z.object({
  name: c.name,
  email: c.email,
  phone: c.phone,
  password: c.password,
});

const loginSchema = z.object({
  email: c.email,
  password: z.string().min(1, 'Password is required'),
});

/** The refresh token normally arrives as an httpOnly cookie; a body is allowed too. */
const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

module.exports = { registerSchema, loginSchema, refreshSchema };
