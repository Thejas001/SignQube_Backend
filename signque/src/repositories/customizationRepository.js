'use strict';

const { db } = require('./prisma');

function create(data, tx) {
  return db(tx).customization.create({ data });
}

function findById(id, tx) {
  return db(tx).customization.findUnique({ where: { id } });
}

function findOwnedById(id, userId, tx) {
  return db(tx).customization.findFirst({ where: { id, userId } });
}

function findOwnedByIds(ids, userId, tx) {
  return db(tx).customization.findMany({ where: { id: { in: ids }, userId } });
}

module.exports = { create, findById, findOwnedById, findOwnedByIds };
