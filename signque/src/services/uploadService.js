'use strict';

/**
 * Upload handling. Both the MIME type reported by the browser and the file
 * extension are checked, and the S3 key is random so an uploaded name can
 * never be guessed. The bucket stays private — reads go through pre-signed
 * GET URLs.
 */

const path = require('path');

const s3Client = require('../integrations/s3Client');
const { UPLOAD_LIMITS } = require('../config/constants');
const { ValidationError } = require('../utils/errors');

/**
 * @param {{ originalname: string, mimetype: string, size: number }} file
 * @param {'photo'|'design'} kind
 */
function assertAllowed(file, kind) {
  const limits = UPLOAD_LIMITS[kind];
  if (!file) throw new ValidationError('No file was uploaded');

  if (!limits.mimeTypes.includes(file.mimetype)) {
    throw new ValidationError(`That file type is not allowed. Allowed: ${limits.mimeTypes.join(', ')}`, {
      got: file.mimetype,
      allowed: limits.mimeTypes,
    });
  }

  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!limits.extensions.includes(ext)) {
    throw new ValidationError(`That file extension is not allowed. Allowed: ${limits.extensions.join(', ')}`, {
      got: ext,
      allowed: limits.extensions,
    });
  }

  if (file.size > limits.maxBytes) {
    const mb = Math.round(limits.maxBytes / (1024 * 1024));
    throw new ValidationError(`File is too large. The limit is ${mb} MB.`, { maxBytes: limits.maxBytes });
  }
}

/**
 * Store a customer photo.
 * @returns {Promise<{ url: string, key: string }>} url is a pre-signed GET URL
 */
async function uploadCustomerPhoto({ file, userId }) {
  assertAllowed(file, 'photo');
  const key = s3Client.buildPhotoKey(userId, file.originalname);
  await s3Client.putObject({ key, body: file.buffer, contentType: file.mimetype });
  const url = await s3Client.getPresignedUrl(key);
  return { url, key };
}

/**
 * Store a design file for a specific order and version.
 * @returns {Promise<{ url: string, key: string }>}
 */
async function uploadDesignFile({ file, orderId, versionNo }) {
  assertAllowed(file, 'design');
  const key = s3Client.buildDesignKey(orderId, versionNo, file.originalname);
  await s3Client.putObject({ key, body: file.buffer, contentType: file.mimetype });
  const url = await s3Client.getPresignedUrl(key);
  return { url, key };
}

/** Fresh pre-signed URL for a stored key. Stored urls go stale after 10 min. */
function presign(key) {
  return s3Client.getPresignedUrl(key);
}

/** Replace stored `fileUrl`/`photoUrl` values with fresh pre-signed URLs. */
async function presignFields(obj, pairs) {
  if (!obj) return obj;
  const out = { ...obj };
  await Promise.all(
    pairs.map(async ([keyField, urlField]) => {
      if (out[keyField]) {
        out[urlField] = await s3Client.getPresignedUrl(out[keyField]);
      }
    }),
  );
  return out;
}

module.exports = { assertAllowed, uploadCustomerPhoto, uploadDesignFile, presign, presignFields };
