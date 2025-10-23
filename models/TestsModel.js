import { pool } from '../config/db.js';

export const getAllCourses = async () => {
    const { rows } = await pool.query('SELECT * FROM courses ORDER BY id ASC');
    return rows;
};

export const createCourse = async ({ title, description, category, teacher }) => {
    const { rows } = await pool.query(
        'INSERT INTO courses (title, description, category, teacher) VALUES ($1, $2, $3, $4) RETURNING *',
        [title, description, category, teacher]
    );
    return rows[0];
};
