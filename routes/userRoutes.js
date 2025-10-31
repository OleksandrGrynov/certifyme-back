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
} from "../controllers/userController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { pool } from "../config/db.js";

const router = express.Router();

// ======================================================
// 🔹 Основні маршрути користувача
// ======================================================
router.post("/register", registerUser);        // реєстрація + OTP
router.post("/verify-otp", verifyOtp);         // підтвердження OTP
router.post("/login", loginUser);              // звичайний логін
router.get("/me", getCurrentUser);             // поточний користувач
router.put("/update", updateProfile);          // оновлення профілю
router.put("/password", changePassword);       // зміна пароля (в профілі)
router.post("/set-password", setPassword);     // створення після Google
router.post("/forgot-password", forgotPassword); // лист для відновлення
router.post("/reset-password", resetPassword);   // новий пароль після листа






export default router;
