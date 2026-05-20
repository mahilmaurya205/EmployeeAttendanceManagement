const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const auth = require("../middleware/auth.middleware");

// Public routes
router.post("/login", authController.login);
router.post("/logout", auth, authController.logout);

// Protected routes
router.get("/me", auth, authController.me);
router.post("/change-password", auth, authController.changePassword);
router.put("/profile", auth, authController.updateProfile);

module.exports = router;
