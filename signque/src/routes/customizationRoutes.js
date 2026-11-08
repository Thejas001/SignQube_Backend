'use strict';

const { Router } = require('express');

const customerController = require('../controllers/customerController');
const authenticate = require('../middlewares/authenticate');
const requireRole = require('../middlewares/requireRole');
const validate = require('../middlewares/validate');
const { createCustomizationSchema } = require('../validators/customerValidators');

const router = Router();

router.use(authenticate, requireRole('CUSTOMER'));

router.post('/', validate({ body: createCustomizationSchema }), customerController.createCustomization);

module.exports = router;
