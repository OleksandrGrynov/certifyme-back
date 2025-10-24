import { pool } from "../config/db.js";

const UserModel = {
    // 🔹 Отримати користувача за ID
    async getById(id) {
        const result = await pool.query(
            `SELECT id, first_name, last_name, email, role, created_at
       FROM users
       WHERE id = $1`,
            [id]
        );
        return result.rows[0];
    },

    // 🔹 Оновити профіль користувача
    async updateProfile(id, first_name, last_name, email) {
        const result = await pool.query(
            `UPDATE users
       SET first_name = $1,
           last_name = $2,
           email = $3
       WHERE id = $4
       RETURNING id, first_name, last_name, email, role, created_at`,
            [first_name, last_name, email, id]
        );
        return result.rows[0];
    },

    // 🔹 Оновити пароль
    async updatePassword(id, newPassword) {
        await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [newPassword, id]);
    },
};

export default UserModel;
