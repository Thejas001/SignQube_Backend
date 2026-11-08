'use strict';

const { Router } = require('express');

const uploadController = require('../controllers/uploadController');
const authenticate = require('../middlewares/authenticate');
const requireRole = require('../middlewares/requireRole');
const { photoUpload } = require('../middlewares/upload');
const { uploadLimiter } = require('../middlewares/rateLimit');

const router = Router();

// jpg/png/heic, max 15 MB, field name `photo`. Returns { url, key }.
router.post(
  '/photo',
  authenticate,
  requireRole('CUSTOMER'),
  uploadLimiter,
  photoUpload,
  uploadController.uploadPhoto,
);

module.exports = router;
