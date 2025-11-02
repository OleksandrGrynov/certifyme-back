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
// 🔹 Отримати всі сертифікати (для адмін-панелі)
export const getAllCertificates = async (req, res) => {
    try {
        const lang = req.query.lang || "ua";

        const query = `
            SELECT c.id, c.user_id, c.test_id, c.percent, c.issued, c.expires,
                   u.first_name || ' ' || u.last_name AS user_name, 
                   u.email AS user_email,
                   t.title_ua AS test_title_ua, t.title_en AS test_title_en
            FROM certificates c
            JOIN users u ON c.user_id = u.id
            JOIN tests t ON c.test_id = t.id
            ORDER BY c.id DESC
        `;

        const result = await pool.query(query);
        res.json({ success: true, certificates: result.rows });
    } catch (err) {
        console.error("❌ getAllCertificates error:", err);
        res.status(500).json({ success: false, message: "Server error while loading certificates" });
    }
};

// 🔹 Видалити сертифікат
export const deleteCertificate = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM certificates WHERE id = $1", [id]);
        res.json({ success: true, message: "Certificate deleted" });
    } catch (err) {
        console.error("❌ deleteCertificate error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
