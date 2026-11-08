'use strict';

/**
 * Private S3 bucket. Files are never public — reads go through pre-signed GET
 * URLs with a short lifetime (config/constants.PRESIGN_TTL_SECONDS).
 */

const crypto = require('crypto');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const env = require('../config/env');
const { PRESIGN_TTL_SECONDS } = require('../config/constants');
const logger = require('../utils/logger');

const client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

/** Random key so an uploaded filename can never be guessed or collide. */
function buildPhotoKey(userId, originalName) {
  const ext = path.extname(originalName || '').toLowerCase() || '.jpg';
  return `photos/${userId}/${crypto.randomUUID()}${ext}`;
}

function buildDesignKey(orderId, versionNo, originalName) {
  const ext = path.extname(originalName || '').toLowerCase() || '.png';
  return `designs/${orderId}/v${versionNo}-${crypto.randomUUID()}${ext}`;
}

/**
 * @param {{ key: string, body: Buffer, contentType: string }} args
 * @returns {Promise<{ key: string }>}
 */
async function putObject({ key, body, contentType }) {
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    }),
  );
  logger.debug('s3 put', { key, bytes: body.length });
  return { key };
}

/** Short-lived read URL. Returns null for a missing key. */
async function getPresignedUrl(key, ttlSeconds = PRESIGN_TTL_SECONDS) {
  if (!key) return null;
  return getSignedUrl(client, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
    expiresIn: ttlSeconds,
  });
}

async function deleteObject(key) {
  if (!key) return;
  await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

module.exports = { client, buildPhotoKey, buildDesignKey, putObject, getPresignedUrl, deleteObject };
