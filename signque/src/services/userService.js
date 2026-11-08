'use strict';

/**
 * Admin user management. Only an admin reaches these, and only an admin can
 * create ADMIN, DESIGNER and PRINTER accounts — customers self-register through
 * authService.
 */

const userRepository = require('../repositories/userRepository');
const authService = require('./authService');
const { ConflictError, NotFoundError, ValidationError } = require('../utils/errors');

/** Roles an admin may create here. CUSTOMER accounts come from registration. */
const CREATABLE_ROLES = ['ADMIN', 'DESIGNER', 'PRINTER'];

async function createStaffUser({ name, email, phone, password, role }) {
  if (!CREATABLE_ROLES.includes(role)) {
    throw new ValidationError('Only ADMIN, DESIGNER and PRINTER accounts can be created here', {
      allowed: CREATABLE_ROLES,
    });
  }
  const existing = await userRepository.findByEmail(email);
  if (existing) throw new ConflictError('An account with that email already exists');

  return userRepository.create({
    name,
    email,
    phone: phone || null,
    passwordHash: await authService.hashPassword(password),
    role,
  });
}

async function listUsers({ role, isActive, page, pageSize }) {
  return userRepository.listUsers({ role, isActive, page, pageSize });
}

/** Designers or printers with their open-job counts, for assignment dropdowns. */
async function listAssignable(role) {
  if (role !== 'DESIGNER' && role !== 'PRINTER') {
    throw new ValidationError('Role must be DESIGNER or PRINTER', { role });
  }
  return userRepository.findAssignableWithLoad(role);
}

async function updateUser(id, patch) {
  const user = await userRepository.findById(id);
  if (!user) throw new NotFoundError('User not found');

  const data = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.phone !== undefined) data.phone = patch.phone || null;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.role !== undefined) {
    if (!CREATABLE_ROLES.includes(patch.role) && patch.role !== 'CUSTOMER') {
      throw new ValidationError('Unknown role', { role: patch.role });
    }
    data.role = patch.role;
  }
  if (patch.password) data.passwordHash = await authService.hashPassword(patch.password);

  if (Object.keys(data).length === 0) throw new ValidationError('Nothing to update');

  const updated = await userRepository.update(id, data);

  // A deactivated user must not keep working with an old refresh token.
  if (patch.isActive === false) await userRepository.revokeAllForUser(id);

  return updated;
}

/**
 * Confirm a user exists, is active and has the expected role — used before
 * assigning a designer or printer to an order.
 */
async function requireActiveUserWithRole(id, role, label = 'User') {
  const user = await userRepository.findById(id);
  if (!user) throw new NotFoundError(`${label} not found`);
  if (user.role !== role) throw new ValidationError(`${label} must have the ${role} role`, { role: user.role });
  if (!user.isActive) throw new ValidationError(`${label} is deactivated`);
  return user;
}

module.exports = {
  CREATABLE_ROLES,
  createStaffUser,
  listUsers,
  listAssignable,
  updateUser,
  requireActiveUserWithRole,
};
