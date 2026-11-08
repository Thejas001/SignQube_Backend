'use strict';

const { db } = require('./prisma');

function findManyByUser(userId, tx) {
  return db(tx).address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
}

function findById(id, tx) {
  return db(tx).address.findUnique({ where: { id } });
}

function findOwnedById(id, userId, tx) {
  return db(tx).address.findFirst({ where: { id, userId } });
}

function create(data, tx) {
  return db(tx).address.create({ data });
}

function update(id, data, tx) {
  return db(tx).address.update({ where: { id }, data });
}

function remove(id, tx) {
  return db(tx).address.delete({ where: { id } });
}

function clearDefaultForUser(userId, tx) {
  return db(tx).address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
}

function countOrdersForAddress(addressId, tx) {
  return db(tx).order.count({ where: { addressId } });
}

module.exports = {
  findManyByUser,
  findById,
  findOwnedById,
  create,
  update,
  remove,
  clearDefaultForUser,
  countOrdersForAddress,
};
