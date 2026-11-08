'use strict';

const { Router } = require('express');

const authController = require('../controllers/authController');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const { authLimiter } = require('../middlewares/rateLimit');
const { registerSchema, loginSchema, refreshSchema } = require('../validators/authValidators');

const router = Router();

router.use(authLimiter);

router.post('/register', validate({ body: registerSchema }), authController.register);
router.post('/login', validate({ body: loginSchema }), authController.login);
router.post('/refresh', validate({ body: refreshSchema }), authController.refresh);
router.post('/logout', validate({ body: refreshSchema }), authController.logout);
router.get('/me', authenticate, authController.me);

module.exports = router;
