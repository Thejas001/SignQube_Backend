'use strict';

const { Router } = require('express');

const customerController = require('../controllers/customerController');
const authenticate = require('../middlewares/authenticate');
const requireRole = require('../middlewares/requireRole');
const validate = require('../middlewares/validate');
const { idParam } = require('../validators/common');
const v = require('../validators/customerValidators');

const router = Router();

router.use(authenticate, requireRole('CUSTOMER'));

router.get('/', customerController.listAddresses);
router.post('/', validate({ body: v.addressBody }), customerController.createAddress);
router.patch(
  '/:id',
  validate({ params: idParam('id'), body: v.updateAddressBody }),
  customerController.updateAddress,
);
router.delete('/:id', validate({ params: idParam('id') }), customerController.deleteAddress);

module.exports = router;
