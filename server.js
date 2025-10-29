import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { stripeWebhook } from "./controllers/paymentController.js"; // ⬅️ Додано тут

import { pool } from "./config/db.js";
import achievementRoutes from "./routes/achievementRoutes.js";
import googleAuthRoutes from "./routes/googleAuthRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import testRoutes from "./routes/testRoutes.js";
import emailRoutes from "./routes/emailRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import adminAnalyticsRoutes from "./routes/adminAnalyticsRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import userTestsRoutes from "./routes/userTestsRoutes.js";

dotenv.config();

const app = express();

/* 🔥 Stripe webhook має бути САМЕ перед express.json()
   і використовувати express.raw(), щоб Stripe міг перевірити підпис */
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), stripeWebhook);

// Інші мідлвари
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json()); // <--- тільки після webhook
app.use(cookieParser());

// 🔹 Маршрути
app.use("/api/auth", googleAuthRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/users", userRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminAnalyticsRoutes);
app.use("/api/achievements", achievementRoutes);
app.use("/api/auth", emailRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/payments", paymentRoutes); // 🔹 без webhook тут
app.use("/api/user", userTestsRoutes);

// 🔹 Головна
app.get("/", (req, res) => {
    res.send("🎓 CertifyMe API running...");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
