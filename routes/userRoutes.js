import express from "express";
import {
    registerUser,
    loginUser,
    getCurrentUser,
    updateProfile,
    changePassword,
    verifyOtp,
    setPassword,
    forgotPassword,
    resetPassword,
    grantUserTest,
} from "../controllers/userController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();


router.post("/register", registerUser);
router.post("/verify-otp", verifyOtp);
router.post("/login", loginUser);
router.get("/me", getCurrentUser);


router.put("/update", updateProfile);
router.put("/password", changePassword);
router.post("/set-password", setPassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);


router.post("/tests/grant", authMiddleware, grantUserTest);

export default router;
