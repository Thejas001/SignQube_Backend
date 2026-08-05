const multer = require("multer");
const env = require("../config/env");
const AppError = require("../utils/appError");

// Use memory storage so we have the file buffer for S3 upload directly
const storage = multer.memoryStorage();

// Supported MIME types for document and image uploads
const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  // Documents
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "text/plain",
  "text/csv",
];

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new AppError(
        "Only images and document formats (PDF, Word, Excel, CSV, Text) are allowed",
        400
      )
    );
  }

  return cb(null, true);
};

const documentUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.uploadMaxFileSize,
  },
});

module.exports = documentUpload;
