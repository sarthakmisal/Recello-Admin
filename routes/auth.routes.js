const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { reqBody } = require('../middlewares/req_body.middleware');
const authMiddleware = require('../middlewares/auth.middleware')

router.post("/request_otp", reqBody, authController.requestOTP);
router.post("/resend_otp", reqBody, authController.resendOTP);
router.post("/verify_otp", reqBody, authController.verifyOTP);
router.post("/login", reqBody, authController.login);
router.post("/register", reqBody, authController.register);
router.delete("/logout", authController.logout);
router.post("/refresh", authController.refresh);

router.get('/me', authMiddleware, authController.me);

router.post("/initiate", reqBody, authController.initiateAuth);

module.exports = router;
