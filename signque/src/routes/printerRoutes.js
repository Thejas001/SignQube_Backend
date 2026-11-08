'use strict';

const { Router } = require('express');

const printerController = require('../controllers/printerController');

const authenticate = require('../middlewares/authenticate');
const requireRole = require('../middlewares/requireRole');
const validate = require('../middlewares/validate');

const { idParam } = require('../validators/common');
const v = require('../validators/staffValidators');

const router = Router();

router.use(authenticate, requireRole('PRINTER'));

router.get('/jobs', validate({ query: v.printerJobsQuery }), printerController.listJobs);

router.get('/jobs/:orderId', validate({ params: idParam('orderId') }), printerController.getJob);

router.post('/jobs/:orderId/take', validate({ params: idParam('orderId') }), printerController.takeJob);

router.patch(
  '/jobs/:orderId/stage',
  validate({ params: idParam('orderId'), body: v.updateStageSchema }),
  printerController.updateStage,
);

router.post(
  '/jobs/:orderId/complete',
  validate({ params: idParam('orderId') }),
  printerController.completeJob,
);

module.exports = router;
