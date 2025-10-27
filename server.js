import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./config/db.js";

import achievementRoutes from "./routes/achievementRoutes.js";
import googleAuthRoutes from "./routes/googleAuthRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import testRoutes from "./routes/testRoutes.js";


dotenv.config(); // ① має бути ДО всього

const app = express();

// 🔹 Middleware
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// 🔹 Маршрути
app.use("/api/auth", googleAuthRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/users", userRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/achievements", achievementRoutes);


// 🔹 Головна
app.get("/", (req, res) => {
    res.send("🎓 CertifyMe API running...");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
