import express from "express";
import {
    registerUser,
    loginUser,
    getCurrentUser,
    updateProfile,
    changePassword,
    verifyOtp,
    setPassword
} from "../controllers/userController.js";

const router = express.Router();

// ======================================================
// 🔹 Основні маршрути користувача
// ======================================================
router.post("/register", registerUser);       // реєстрація + надсилання OTP
router.post("/verify-otp", verifyOtp);        // перевірка OTP і логін
router.post("/login", loginUser);             // звичайний логін (для тих, хто вже підтвердив)
router.get("/me", getCurrentUser);            // отримати поточного користувача
router.put("/update", updateProfile);         // оновити профіль
router.put("/password", changePassword);      // змінити пароль
router.post("/set-password", setPassword);
export default router;
