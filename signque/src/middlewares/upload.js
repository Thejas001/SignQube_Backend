'use strict';

/**
 * Multer, in memory, so the buffer goes straight to S3 and nothing is written
 * to the API's disk. The size limit and type check are enforced here and again
 * in uploadService.
 */

const path = require('path');
const multer = require('multer');
const { UPLOAD_LIMITS } = require('../config/constants');

/** @param {'photo'|'design'} kind */
function build(kind, field) {
  const limits = UPLOAD_LIMITS[kind];
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: limits.maxBytes, files: 1 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!limits.mimeTypes.includes(file.mimetype) || !limits.extensions.includes(ext)) {
        const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE', field);
        err.message = `Allowed types: ${limits.extensions.join(', ')}`;
        return cb(err);
      }
      return cb(null, true);
    },
  }).single(field);
}

/** Customer photo: jpg/png/heic, max 15 MB, field name `photo`. */
const photoUpload = build('photo', 'photo');

/** Design file: png/jpg/pdf, max 25 MB, field name `file`. */
const designUpload = build('design', 'file');

module.exports = { photoUpload, designUpload };
