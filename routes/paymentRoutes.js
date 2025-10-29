import express from "express";
import { createCheckoutSession } from "../controllers/paymentController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// 💰 Створення Stripe Checkout Session
router.post("/checkout", authMiddleware, createCheckoutSession);

// ❌ Webhook більше не тут — він тепер у server.js перед express.json()

export default router;
