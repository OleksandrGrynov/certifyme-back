import express from "express";
import cors from "cors";
import dotenv from "dotenv"; // ① імпорт dotenv
dotenv.config(); // ② конфігурація має бути ДО всього

import { pool } from "./config/db.js";

import userRoutes from "./routes/userRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import testRoutes from "./routes/testRoutes.js";
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/tests", testRoutes);
app.use("/api/users", userRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/admin", adminRoutes);
app.get("/", (req, res) => {
    res.send("🎓 CertifyMe API running...");
});

const PORT = process.env.PORT || 5000;
console.log("✅ JWT_SECRET =", process.env.JWT_SECRET); // 👈 Додай тимчасово для перевірки

app.listen(PORT, () =>
    console.log(`🚀 Server running on port ${PORT}`)
);
