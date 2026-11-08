'use strict';

const customizationRepository = require('../repositories/customizationRepository');
const productRepository = require('../repositories/productRepository');
const uploadService = require('./uploadService');
const { NotFoundError } = require('../utils/errors');

/** Pin an uploaded photo to a product, ready to be ordered. */
async function create({ userId, productId, photoUrl, photoKey }) {
  const product = await productRepository.findActiveById(productId);
  if (!product) throw new NotFoundError('Product not found');

  const created = await customizationRepository.create({ userId, productId, photoUrl, photoKey });
  // The stored url expires; hand back a fresh one.
  return uploadService.presignFields(created, [['photoKey', 'photoUrl']]);
}

async function getMine({ id, userId }) {
  const found = await customizationRepository.findOwnedById(id, userId);
  if (!found) throw new NotFoundError('Customization not found');
  return uploadService.presignFields(found, [['photoKey', 'photoUrl']]);
}

module.exports = { create, getMine };
