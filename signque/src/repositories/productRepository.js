'use strict';

const { db } = require('./prisma');

function findActive(tx) {
  return db(tx).product.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } });
}

function findActiveById(id, tx) {
  return db(tx).product.findFirst({ where: { id, isActive: true } });
}

function findById(id, tx) {
  return db(tx).product.findUnique({ where: { id } });
}

function findActiveByIds(ids, tx) {
  return db(tx).product.findMany({ where: { id: { in: ids }, isActive: true } });
}

function findAll(tx) {
  return db(tx).product.findMany({ orderBy: { id: 'asc' } });
}

function create(data, tx) {
  return db(tx).product.create({ data });
}

function update(id, data, tx) {
  return db(tx).product.update({ where: { id }, data });
}

module.exports = {
  findActive,
  findActiveById,
  findById,
  findActiveByIds,
  findAll,
  create,
  update,
};
