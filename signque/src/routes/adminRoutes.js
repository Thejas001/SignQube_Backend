'use strict';

const { Router } = require('express');

const adminController = require('../controllers/adminController');

const authenticate = require('../middlewares/authenticate');
const requireRole = require('../middlewares/requireRole');
const validate = require('../middlewares/validate');

const { idParam } = require('../validators/common');
const v = require('../validators/adminValidators');

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

// ----------------------------------------------------------------- dashboard
router.get('/dashboard', adminController.dashboard);
router.get('/print-options', adminController.printOptions);

// -------------------------------------------------------------------- orders
router.get('/orders', validate({ query: v.listOrdersQuery }), adminController.listOrders);
router.get('/orders/:id', validate({ params: idParam('id') }), adminController.getOrder);

router.post(
  '/orders/:id/approve',
  validate({ params: idParam('id'), body: v.approveOrderSchema }),
  adminController.approveOrder,
);
router.post(
  '/orders/:id/reject',
  validate({ params: idParam('id'), body: v.rejectOrderSchema }),
  adminController.rejectOrder,
);
router.post(
  '/orders/:id/cancel',
  validate({ params: idParam('id'), body: v.cancelOrderSchema }),
  adminController.cancelOrder,
);
router.post(
  '/orders/:id/reassign-designer',
  validate({ params: idParam('id'), body: v.reassignDesignerSchema }),
  adminController.reassignDesigner,
);

// -------------------------------------------------------------- design check
router.post(
  '/orders/:id/design/approve',
  validate({ params: idParam('id'), body: v.approveDesignSchema }),
  adminController.approveDesign,
);
router.post(
  '/orders/:id/design/send-back',
  validate({ params: idParam('id'), body: v.sendBackDesignSchema }),
  adminController.sendBackDesign,
);

// ---------------------------------------------------------------- print jobs
router.post(
  '/orders/:id/print-job',
  validate({ params: idParam('id'), body: v.createPrintJobSchema }),
  adminController.createPrintJob,
);
router.post(
  '/orders/:id/reassign-printer',
  validate({ params: idParam('id'), body: v.reassignPrinterSchema }),
  adminController.reassignPrinter,
);

// -------------------------------------------------------------------- users
router.get('/users', validate({ query: v.listUsersQuery }), adminController.listUsers);
router.post('/users', validate({ body: v.createUserSchema }), adminController.createUser);
router.patch(
  '/users/:id',
  validate({ params: idParam('id'), body: v.updateUserSchema }),
  adminController.updateUser,
);

// ----------------------------------------------------------------- products
router.get('/products', adminController.listProducts);
router.post('/products', validate({ body: v.createProductSchema }), adminController.createProduct);
router.patch(
  '/products/:id',
  validate({ params: idParam('id'), body: v.updateProductSchema }),
  adminController.updateProduct,
);

module.exports = router;
