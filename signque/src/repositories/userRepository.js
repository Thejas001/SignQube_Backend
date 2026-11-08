'use strict';

/** All Prisma access for users and refresh tokens. No business rules here. */

const { db } = require('./prisma');

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

function findById(id, tx) {
  return db(tx).user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
}

/** Includes passwordHash — only authService should call this. */
function findByEmailWithPassword(email, tx) {
  return db(tx).user.findUnique({ where: { email: email.toLowerCase() } });
}

function findByEmail(email, tx) {
  return db(tx).user.findUnique({ where: { email: email.toLowerCase() }, select: PUBLIC_FIELDS });
}

function create(data, tx) {
  return db(tx).user.create({
    data: { ...data, email: data.email.toLowerCase() },
    select: PUBLIC_FIELDS,
  });
}

function update(id, data, tx) {
  return db(tx).user.update({
    where: { id },
    data: data.email ? { ...data, email: data.email.toLowerCase() } : data,
    select: PUBLIC_FIELDS,
  });
}

function findManyByRole(role, { includeInactive = false } = {}, tx) {
  return db(tx).user.findMany({
    where: { role, ...(includeInactive ? {} : { isActive: true }) },
    select: PUBLIC_FIELDS,
    orderBy: { name: 'asc' },
  });
}

function listUsers({ role, isActive, page = 1, pageSize = 20 }, tx) {
  const where = {
    ...(role ? { role } : {}),
    ...(typeof isActive === 'boolean' ? { isActive } : {}),
  };
  return Promise.all([
    db(tx).user.findMany({
      where,
      select: PUBLIC_FIELDS,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db(tx).user.count({ where }),
  ]).then(([items, total]) => ({ items, total }));
}

function findAdminIds(tx) {
  return db(tx)
    .user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } })
    .then((rows) => rows.map((r) => r.id));
}

/**
 * Designers/printers with their count of open (non-final) assigned orders, for
 * the assignment dropdowns.
 */
async function findAssignableWithLoad(role, tx) {
  const client = db(tx);
  const users = await client.user.findMany({
    where: { role, isActive: true },
    select: PUBLIC_FIELDS,
    orderBy: { name: 'asc' },
  });
  if (users.length === 0) return [];

  const FINAL = ['COMPLETED', 'REJECTED', 'CANCELLED'];
  const field = role === 'DESIGNER' ? 'assignedDesignerId' : 'assignedPrinterId';
  const grouped = await client.order.groupBy({
    by: [field],
    where: { [field]: { in: users.map((u) => u.id) }, status: { notIn: FINAL } },
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((g) => [g[field], g._count._all]));
  return users.map((u) => ({ ...u, openJobs: counts.get(u.id) || 0 }));
}

// ---------------------------------------------------------- refresh tokens

function createRefreshToken({ userId, tokenHash, expiresAt }, tx) {
  return db(tx).refreshToken.create({ data: { userId, tokenHash, expiresAt } });
}

function findRefreshToken(tokenHash, tx) {
  return db(tx).refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { select: PUBLIC_FIELDS } },
  });
}

function revokeRefreshToken(tokenHash, tx) {
  return db(tx).refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function revokeAllForUser(userId, tx) {
  return db(tx).refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function deleteExpiredTokens(tx) {
  return db(tx).refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

module.exports = {
  PUBLIC_FIELDS,
  findById,
  findByEmail,
  findByEmailWithPassword,
  create,
  update,
  findManyByRole,
  listUsers,
  findAdminIds,
  findAssignableWithLoad,
  createRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  deleteExpiredTokens,
};
