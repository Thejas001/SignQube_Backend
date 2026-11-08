'use strict';

const { db } = require('./prisma');

function createMany(rows, tx) {
  return db(tx).notification.createMany({ data: rows });
}

function create(data, tx) {
  return db(tx).notification.create({ data });
}

function update(id, data, tx) {
  return db(tx).notification.update({ where: { id }, data });
}

function listForUser({ userId, unreadOnly = false, limit = 50 }, tx) {
  return db(tx).notification.findMany({
    where: { userId, channel: 'IN_APP', ...(unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

function countUnread(userId, tx) {
  return db(tx).notification.count({ where: { userId, channel: 'IN_APP', isRead: false } });
}

/** Scoped by userId so one user cannot mark another's notification read. */
async function markRead(id, userId, tx) {
  const { count } = await db(tx).notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
  return count;
}

function markAllRead(userId, tx) {
  return db(tx).notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}

function setStatus(id, status, tx) {
  return db(tx).notification.update({ where: { id }, data: { status } });
}

module.exports = {
  create,
  createMany,
  update,
  listForUser,
  countUnread,
  markRead,
  markAllRead,
  setStatus,
};
