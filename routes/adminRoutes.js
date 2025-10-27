import express from "express";
import { pool } from "../config/db.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { isAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

// 🔹 Отримати всіх користувачів (лише для адміна)
router.get("/users", authMiddleware, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                first_name || ' ' || last_name AS full_name,
                email,
                role,
                TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
            FROM users
            ORDER BY id ASC
        `);
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error("❌ getAllUsers error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 🔹 Видалити користувача (лише для адміна)
router.delete("/users/:id", authMiddleware, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Захист від видалення адміна
        const userRes = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });
        }

        if (userRes.rows[0].role === "admin") {
            return res
                .status(403)
                .json({ success: false, message: "Неможливо видалити адміністратора" });
        }

        await pool.query("DELETE FROM users WHERE id = $1", [id]);
        res.json({ success: true, message: "Користувача успішно видалено ✅" });
    } catch (err) {
        console.error("❌ deleteUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;
