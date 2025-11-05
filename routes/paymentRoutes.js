// routes/paymentRoutes.js
import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    createCheckoutSession,
    confirmLocalPayment,
} from "../controllers/paymentController.js";

const router = express.Router();

// 💰 Stripe checkout (створення сесії)
router.post("/checkout", authMiddleware, createCheckoutSession);

// 💸 Локальне підтвердження після повернення зі Stripe (для DEV)
// (На проді використовуємо webhook, цей маршрут можна не викликати)
router.post("/confirm-local", authMiddleware, confirmLocalPayment);

// 📨 УВАГА: webhook-роут РЕЄСТРУЄМО В server.js ДО express.json()
// Тому тут НЕ оголошуємо /webhook, щоб не зламати raw-тіло

export default router;
