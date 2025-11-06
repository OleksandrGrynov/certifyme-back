// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";

import authMiddleware, { isAdmin } from "./middleware/authMiddleware.js";

// 📦 Імпорти роутів
import testRoutes from "./routes/testRoutes.js";
import achievementRoutes from "./routes/achievementRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import userTestsRoutes from "./routes/userTestsRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import adminAnalyticsRoutes from "./routes/adminAnalyticsRoutes.js";
import adminAchievementsRouter from "./routes/adminAchievements.js";
import googleAuthRoutes from "./routes/googleAuthRoutes.js";
import emailRoutes from "./routes/emailRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import certificateRoutes from "./routes/certificateRoutes.js";
import smsRoutes from "./routes/smsRoutes.js";

// 📨 ВАЖЛИВО: імпортуємо webhook-контролер, щоб зареєструвати raw-маршрут ДО express.json()
import { stripeWebhook } from "./controllers/paymentController.js";

dotenv.config();

const app = express();

// ⚙️ CORS (гнучкий whitelist)
const allowedOrigins = [
    "https://certifyme.me",
    "https://www.certifyme.me",
    "http://localhost:5173",
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn("❌ Blocked CORS for origin:", origin);
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
}));




// 📨 Stripe Webhook має бачити сире тіло (Buffer)!
// ТОМУ цей маршрут реєструємо ДО app.use(express.json())
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), stripeWebhook);

// Далі можна парсити JSON для всіх звичайних API
app.use(express.json());
app.use(cookieParser());

// 🧩 Основні API-розділи (у правильному порядку)
app.use("/api/tests", testRoutes);
app.use("/api/achievements", achievementRoutes);
app.use("/api/payments", paymentRoutes); // тут БІЛЬШЕ НЕ оголошуємо /webhook!
app.use("/api/user", userTestsRoutes);
app.use("/api/users", userRoutes);

// 🛠️ Адмінка
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminAnalyticsRoutes);
app.use("/api/admin/achievements", authMiddleware, isAdmin, adminAchievementsRouter);

// 💬 Інші
app.use("/api/auth", googleAuthRoutes);
app.use("/api/auth", emailRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/sms", smsRoutes);

// 📄 Сертифікати (статичні PDF + API)
app.use("/certificates", express.static(path.join(process.cwd(), "certificates")));
app.use("/api/certificates", certificateRoutes);

// 🏠 Головна
app.get("/", (req, res) => {
    res.send("🎓 CertifyMe API running (webhook mode ready)");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
