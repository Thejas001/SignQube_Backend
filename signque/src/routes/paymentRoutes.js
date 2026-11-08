'use strict';

/**
 * The Razorpay webhook. Public (the signature is the authentication) and it
 * needs the RAW body, so app.js mounts this with express.raw() BEFORE
 * express.json().
 */

const { Router } = require('express');

const paymentController = require('../controllers/paymentController');

const router = Router();

router.post('/razorpay/webhook', paymentController.webhook);

module.exports = router;
