const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const addressController = require("../controllers/addressController");
const { createAddressSchema } = require("../validators/addressValidators");

const router = express.Router();

router.use(authMiddleware);
router.post("/", validate(createAddressSchema), addressController.createAddress);
router.get("/", addressController.getAddresses);

module.exports = router;
