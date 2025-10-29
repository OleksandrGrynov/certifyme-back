//adminController
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
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const userRes = await client.query("SELECT role FROM users WHERE id=$1", [id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });
        }

        if (userRes.rows[0].role === "admin") {
            return res.status(403).json({ success: false, message: "Неможливо видалити адміністратора" });
        }

        await client.query("BEGIN");

        // Видаляємо пов'язані дані (сертифікати, досягнення, тощо)
        await client.query("DELETE FROM certificates WHERE user_id = $1", [id]);
        await client.query("DELETE FROM user_achievements WHERE user_id = $1", [id]);
        // Якщо у вашій БД є інші таблиці з user_id - додайте їх сюди
        // await client.query("DELETE FROM reviews WHERE user_id = $1", [id]);

        // Видаляємо користувача
        await client.query("DELETE FROM users WHERE id = $1", [id]);

        await client.query("COMMIT");
        res.json({ success: true, message: "Користувача успішно видалено ✅" });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ deleteUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    } finally {
        client.release();
    }
};
