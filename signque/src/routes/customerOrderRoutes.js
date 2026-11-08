'use strict';

/** /api/orders — the customer's own orders, payments and design review. */

const { Router } = require('express');

const customerController = require('../controllers/customerController');
const authenticate = require('../middlewares/authenticate');
const requireRole = require('../middlewares/requireRole');
const validate = require('../middlewares/validate');
const { idParam } = require('../validators/common');
const v = require('../validators/customerValidators');

const router = Router();

router.use(authenticate, requireRole('CUSTOMER'));

router.post('/', validate({ body: v.createOrderSchema }), customerController.createOrder);

// Before /:id, so "mine" is not read as an id.
router.get('/mine', validate({ query: v.listMineQuery }), customerController.listMyOrders);

router.post(
  '/:id/verify-payment',
  validate({ params: idParam('id'), body: v.verifyPaymentSchema }),
  customerController.verifyPayment,
);
router.post(
  '/:id/retry-payment',
  validate({ params: idParam('id') }),
  customerController.retryPayment,
);

router.get('/:id/design', validate({ params: idParam('id') }), customerController.getMyDesign);
router.post(
  '/:id/design/approve',
  validate({ params: idParam('id') }),
  customerController.approveDesign,
);
router.post(
  '/:id/design/request-changes',
  validate({ params: idParam('id'), body: v.requestChangesSchema }),
  customerController.requestChanges,
);

router.get('/:id', validate({ params: idParam('id') }), customerController.getMyOrder);

module.exports = router;
