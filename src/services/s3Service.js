const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const env = require("../config/env");
const path = require("path");

const { accessKeyId, secretAccessKey, region, bucketName } = env.aws;

let s3Client = null;

if (accessKeyId && secretAccessKey) {
  s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Uploads a file buffer to AWS S3.
 * @param {Buffer} fileBuffer - The file content buffer.
 * @param {string} originalName - The original name of the file.
 * @param {string} mimeType - The mime type of the file.
 * @param {string} folder - The target folder inside S3 bucket (default is "documents").
 * @returns {Promise<{url: string, key: string, bucket: string}>} S3 upload result.
 */
async function uploadToS3(fileBuffer, originalName, mimeType, folder = "documents") {
  if (!s3Client) {
    throw new Error("AWS S3 client is not configured. Check your AWS environment variables.");
  }

  const ext = path.extname(originalName);
  const safeName = originalName
    .replace(ext, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const key = `${folder}/${Date.now()}-${safeName || "file"}${ext}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  // Construct public url
  const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

  return {
    url,
    key,
    bucket: bucketName,
  };
}

async function getObjectFromS3(key) {
  if (!s3Client) {
    throw new Error("AWS S3 client is not configured. Check your AWS environment variables.");
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const result = await s3Client.send(command);

  return {
    body: result.Body,
    contentType: result.ContentType || "application/octet-stream",
    contentLength: result.ContentLength,
  };
}

module.exports = {
  s3Client,
  uploadToS3,
  getObjectFromS3,
};
