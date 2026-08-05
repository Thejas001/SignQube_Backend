const multer = require("multer");
const env = require("../config/env");
const AppError = require("../utils/appError");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new AppError("Only image uploads are allowed", 400));
  }

  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.uploadMaxFileSize,
  },
});

module.exports = upload;
