'use strict';

/**
 * Mounts every area under /api. Each router carries its own authenticate and
 * requireRole guards, so nothing is mounted at a path that would leak one
 * role's guard onto another role's routes.
 *
 * The webhook is mounted separately in app.js, before express.json().
 */

const { Router } = require('express');

const { apiLimiter } = require('../middlewares/rateLimit');

const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const uploadRoutes = require('./uploadRoutes');
const customizationRoutes = require('./customizationRoutes');
const addressRoutes = require('./addressRoutes');
const customerOrderRoutes = require('./customerOrderRoutes');
const adminRoutes = require('./adminRoutes');
const designerRoutes = require('./designerRoutes');
const printerRoutes = require('./printerRoutes');
const notificationRoutes = require('./notificationRoutes');

const router = Router();

router.get('/health', (req, res) =>
  res.json({
    success: true,
    message: 'OK',
    data: { status: 'up', at: new Date().toISOString() },
    error: null,
  }),
);

router.use(apiLimiter);

// public
router.use('/auth', authRoutes);
router.use('/products', productRoutes);

// customer
router.use('/uploads', uploadRoutes);
router.use('/customizations', customizationRoutes);
router.use('/addresses', addressRoutes);
router.use('/orders', customerOrderRoutes);

// staff
router.use('/admin', adminRoutes);
router.use('/designer', designerRoutes);
router.use('/printer', printerRoutes);

// any authenticated user
router.use('/notifications', notificationRoutes);

module.exports = router;
