// routes/paymentRoutes.js
import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    createCheckoutSession,
    confirmLocalPayment,
} from "../controllers/paymentController.js";

const router = express.Router();

// 💰 Stripe checkout
router.post("/checkout", authMiddleware, createCheckoutSession);

// 💸 Локальне підтвердження після повернення з Stripe
router.post("/confirm-local", authMiddleware, confirmLocalPayment);

export default router;
