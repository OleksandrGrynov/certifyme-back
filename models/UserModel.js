import pool from "../db.js";

const UserModel = {
    // 🔹 Отримати користувача за ID
    async getById(id) {
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
        return result.rows[0];
    },

    // 🔹 Оновити профіль
    async updateProfile(id, name, email) {
        const result = await pool.query(
            "UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email",
            [name, email, id]
        );
        return result.rows[0];
    },

    // 🔹 Оновити пароль
    async updatePassword(id, newPassword) {
        await pool.query("UPDATE users SET password = $1 WHERE id = $2", [newPassword, id]);
    },
};

export default UserModel;
