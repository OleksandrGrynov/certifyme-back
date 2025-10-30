import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";

export default async function authMiddleware(req, res, next) {
    try {
        // 👇 Гнучке зчитування
        const authHeader = req.headers.authorization || req.headers.Authorization;

        if (!authHeader) {
            console.log("🚫 No Authorization header:", req.headers);
            return res.status(401).json({ success: false, message: "No token provided" });
        }

        // 👇 Перевіряємо правильний формат
        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, message: "Invalid token format" });
        }

        const token = authHeader.split(" ")[1];
        if (!token) {
            return res.status(401).json({ success: false, message: "Token missing" });
        }

        // 👇 Розшифровуємо токен
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const userRes = await pool.query(
            "SELECT id, email, role, first_name, last_name FROM users WHERE id = $1",
            [decoded.id]
        );

        if (userRes.rows.length === 0) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        req.user = userRes.rows[0];
        next();
    } catch (err) {
        console.error("❌ authMiddleware error:", err.message);
        return res.status(403).json({ success: false, message: "Invalid or expired token" });
    }
}

// 🔒 єдина перевірка для адміна
export function isAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    if (req.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Access denied: admin only" });
    }
    next();
}
