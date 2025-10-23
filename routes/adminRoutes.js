import express from "express";
import { pool } from "../config/db.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { isAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

// 🔹 Отримати всіх користувачів (лише для адміна)
router.get("/users", authMiddleware, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, name, email, role, created_at FROM users ORDER BY id ASC"
        );
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error("❌ getAllUsers error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;
