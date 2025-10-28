// middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";

export default async function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token)
        return res.status(401).json({ success: false, message: "No token provided" });

    try {
        // 1️⃣ Розшифровуємо токен
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 2️⃣ Отримуємо користувача з БД (щоб підтягнути роль)
        const userRes = await pool.query(
            "SELECT id, email, role, first_name, last_name FROM users WHERE id = $1",
            [decoded.id]
        );

        if (userRes.rows.length === 0)
            return res.status(401).json({ success: false, message: "User not found" });

        // 3️⃣ Зберігаємо повну інфу в req.user
        req.user = userRes.rows[0];
        next();
    } catch (err) {
        console.error("❌ authMiddleware error:", err.message);
        return res
            .status(403)
            .json({ success: false, message: "Invalid or expired token" });
    }
}

// 🔒 окрема перевірка для ролі адміністратора
export function adminOnly(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    if (req.user.role !== "admin") {
        return res
            .status(403)
            .json({ success: false, message: "Access denied: admin only" });
    }
    next();
}
