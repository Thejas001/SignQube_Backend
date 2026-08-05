const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const upload = require("../middlewares/upload");
const documentUpload = require("../middlewares/documentUpload");
const uploadController = require("../controllers/uploadController");

const router = express.Router();

router.get("/file", uploadController.downloadFile);
router.post("/image", authMiddleware, upload.single("image"), uploadController.uploadImage);
router.post("/document", authMiddleware, documentUpload.single("document"), uploadController.uploadDocument);

module.exports = router;
