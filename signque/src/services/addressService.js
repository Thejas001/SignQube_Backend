'use strict';

const addressRepository = require('../repositories/addressRepository');
const { prisma } = require('../repositories/prisma');
const { NotFoundError, ValidationError } = require('../utils/errors');

function listMine(userId) {
  return addressRepository.findManyByUser(userId);
}

async function create({ userId, ...data }) {
  return prisma.$transaction(async (tx) => {
    const existing = await addressRepository.findManyByUser(userId, tx);
    // The first address is the default whether or not the client said so.
    const isDefault = data.isDefault === true || existing.length === 0;
    if (isDefault) await addressRepository.clearDefaultForUser(userId, tx);
    return addressRepository.create({ ...data, userId, isDefault }, tx);
  });
}

async function update({ id, userId, ...patch }) {
  const existing = await addressRepository.findOwnedById(id, userId);
  if (!existing) throw new NotFoundError('Address not found');

  return prisma.$transaction(async (tx) => {
    if (patch.isDefault === true) await addressRepository.clearDefaultForUser(userId, tx);
    return addressRepository.update(id, patch, tx);
  });
}

async function remove({ id, userId }) {
  const existing = await addressRepository.findOwnedById(id, userId);
  if (!existing) throw new NotFoundError('Address not found');

  // Orders point at an address with onDelete: Restrict, so a used address stays.
  const orderCount = await addressRepository.countOrdersForAddress(id);
  if (orderCount > 0) {
    throw new ValidationError('This address is used by an order and cannot be deleted', { orderCount });
  }

  await addressRepository.remove(id);
  return { id };
}

module.exports = { listMine, create, update, remove };
