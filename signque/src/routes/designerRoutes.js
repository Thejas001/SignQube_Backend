'use strict';

const { Router } = require('express');

const designerController = require('../controllers/designerController');

const authenticate = require('../middlewares/authenticate');
const requireRole = require('../middlewares/requireRole');
const validate = require('../middlewares/validate');
const { designUpload } = require('../middlewares/upload');
const { uploadLimiter } = require('../middlewares/rateLimit');

const { idParam } = require('../validators/common');
const v = require('../validators/staffValidators');

const router = Router();

router.use(authenticate, requireRole('DESIGNER'));

router.get('/jobs', validate({ query: v.designerJobsQuery }), designerController.listJobs);

router.get('/jobs/:orderId', validate({ params: idParam('orderId') }), designerController.getJob);

router.post('/jobs/:orderId/take', validate({ params: idParam('orderId') }), designerController.takeJob);

// multipart: `file` plus a `note` text field. validate() runs after multer so
// the text fields are populated on req.body.
router.post(
  '/jobs/:orderId/submit',
  uploadLimiter,
  designUpload,
  validate({ params: idParam('orderId'), body: v.submitDesignSchema }),
  designerController.submitDesign,
);

module.exports = router;
