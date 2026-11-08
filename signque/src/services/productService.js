'use strict';

const productRepository = require('../repositories/productRepository');
const { NotFoundError } = require('../utils/errors');

/** Public catalogue: active products only. */
function listPublic() {
  return productRepository.findActive();
}

async function getPublic(id) {
  const product = await productRepository.findActiveById(id);
  if (!product) throw new NotFoundError('Product not found');
  return product;
}

/** Admin catalogue: includes deactivated products. */
function listAll() {
  return productRepository.findAll();
}

function create({ title, description, basePrice, imageUrl }) {
  return productRepository.create({
    title,
    description: description || null,
    basePrice: String(basePrice),
    imageUrl: imageUrl || null,
  });
}

async function update(id, patch) {
  const existing = await productRepository.findById(id);
  if (!existing) throw new NotFoundError('Product not found');

  const data = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description || null;
  if (patch.basePrice !== undefined) data.basePrice = String(patch.basePrice);
  if (patch.imageUrl !== undefined) data.imageUrl = patch.imageUrl || null;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;

  return productRepository.update(id, data);
}

module.exports = { listPublic, getPublic, listAll, create, update };
