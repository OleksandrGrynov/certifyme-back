import { pool } from "../config/db.js";

// 🔹 Отримати список усіх користувачів
export const getAllUsers = async (req, res) => {
    try {
        const users = await pool.query(
            "SELECT id, first_name, last_name, email, role, created_at FROM users ORDER BY id ASC"
        );
        res.json({ success: true, users: users.rows });
    } catch (err) {
        console.error("❌ getAllUsers error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 🔹 Видалити користувача
export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        // захист від видалення самого адміна
        const userRes = await pool.query("SELECT role FROM users WHERE id=$1", [id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });
        }

        if (userRes.rows[0].role === "admin") {
            return res
                .status(403)
                .json({ success: false, message: "Неможливо видалити адміністратора" });
        }

        await pool.query("DELETE FROM users WHERE id=$1", [id]);
        res.json({ success: true, message: "Користувача успішно видалено ✅" });
    } catch (err) {
        console.error("❌ deleteUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
