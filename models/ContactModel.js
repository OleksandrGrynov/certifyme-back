import { pool } from "../config/db.js";

export const addContact = async (data) => {
    const { name, email, phone, telegram, message, agree } = data;
    const result = await pool.query(
        `INSERT INTO contacts (name, email, phone, telegram, message, agree)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [name, email, phone, telegram, message, agree]
    );
    return result.rows[0];
};

export const getAllContacts = async () => {
    const { rows } = await pool.query("SELECT * FROM contacts ORDER BY created_at DESC");
    return rows;
};
