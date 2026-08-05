const asyncHandler = require("../utils/asyncHandler");
const path = require("path");
const { sendSuccess } = require("../utils/apiResponse");
const AppError = require("../utils/appError");
const { buildS3UploadedFileResponse } = require("../services/uploadService");
const { uploadToS3, getObjectFromS3 } = require("../services/s3Service");

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("Image file is required", 400);
  }

  try {
    const s3Result = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype, "images");
    const fileData = buildS3UploadedFileResponse(req, req.file, s3Result);
    return sendSuccess(res, "Image uploaded to S3 successfully", fileData, 201);
  } catch (error) {
    throw new AppError(`S3 upload failed: ${error.message}`, 500);
  }
});

const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("Document file is required", 400);
  }

  try {
    const s3Result = await uploadToS3(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      "documents"
    );

    const fileData = buildS3UploadedFileResponse(req, req.file, s3Result);

    return sendSuccess(res, "Document uploaded to S3 successfully", fileData, 201);
  } catch (error) {
    throw new AppError(`S3 upload failed: ${error.message}`, 500);
  }
});

const downloadFile = asyncHandler(async (req, res) => {
  const key = typeof req.query.key === "string" ? req.query.key.trim() : "";

  if (!key) {
    throw new AppError("File key is required", 400);
  }

  try {
    const s3Object = await getObjectFromS3(key);

    if (!s3Object.body || typeof s3Object.body.pipe !== "function") {
      throw new AppError("Downloaded file stream is unavailable", 500);
    }

    const fileName = path.basename(key);

    res.setHeader("Content-Type", s3Object.contentType);
    if (s3Object.contentLength) {
      res.setHeader("Content-Length", String(s3Object.contentLength));
    }
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);

    s3Object.body.pipe(res);
  } catch (error) {
    if (error.name === "NoSuchKey") {
      throw new AppError("File not found", 404);
    }

    throw new AppError(`S3 download failed: ${error.message}`, error.statusCode || 500);
  }
});

module.exports = {
  uploadImage,
  uploadDocument,
  downloadFile,
};
