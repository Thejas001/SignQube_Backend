'use strict';

const { Router } = require('express');

const productController = require('../controllers/productController');
const validate = require('../middlewares/validate');
const { idParam } = require('../validators/common');

const router = Router();

// Public: active products only.
router.get('/', productController.list);
router.get('/:id', validate({ params: idParam('id') }), productController.get);

module.exports = router;
