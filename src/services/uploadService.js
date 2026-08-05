function buildDownloadUrl(req, key) {
  return `${req.protocol}://${req.get("host")}/api/uploads/file?key=${encodeURIComponent(key)}`;
}

function buildS3UploadedFileResponse(req, file, uploadResult) {
  return {
    filename: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    path: uploadResult.key,
    url: buildDownloadUrl(req, uploadResult.key),
    storageUrl: uploadResult.url,
    bucket: uploadResult.bucket,
  };
}

module.exports = {
  buildDownloadUrl,
  buildS3UploadedFileResponse,
};
