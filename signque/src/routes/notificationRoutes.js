'use strict';

const { Router } = require('express');

const notificationController = require('../controllers/notificationController');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const { idParam } = require('../validators/common');
const { notificationsQuery } = require('../validators/staffValidators');

const router = Router();

// Any authenticated user, whatever their role.
router.use(authenticate);

router.get('/', validate({ query: notificationsQuery }), notificationController.list);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', validate({ params: idParam('id') }), notificationController.markRead);

module.exports = router;
