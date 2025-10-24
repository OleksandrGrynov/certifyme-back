import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { initUserAchievements } from "../models/AchievementModel.js";

// 🔹 Реєстрація користувача
export const registerUser = async (req, res) => {
    try {
        const { first_name, last_name, email, password } = req.body;

        if (!first_name || !last_name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Будь ласка, заповніть усі поля (імʼя, прізвище, email, пароль)",
            });
        }

        // 🔸 перевірка існуючого користувача
        const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Email вже використовується" });
        }

        // 🔸 хешування паролю
        const hashed = await bcrypt.hash(password, 10);

        // 🔸 створення нового користувача
        const result = await pool.query(
            `INSERT INTO users (first_name, last_name, email, password, role, created_at)
             VALUES ($1, $2, $3, $4, 'user', NOW())
                 RETURNING id, first_name, last_name, email, role, created_at`,
            [first_name, last_name, email, hashed]
        );

        const user = result.rows[0];

        // 🔹 Ініціалізація досягнень (щоб новому користувачу створилися всі 15)
        await initUserAchievements(user.id);

        // 🔹 Створюємо JWT токен
        const token = jwt.sign(
            { id: user.id, role: user.role, first_name: user.first_name, last_name: user.last_name },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "Реєстрація успішна ✅",
            token,
            user,
        });
    } catch (err) {
        console.error("❌ registerUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 🔹 Логін користувача
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: "Користувача не знайдено" });
        }

        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
            return res.status(401).json({ success: false, message: "Невірний пароль" });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, first_name: user.first_name, last_name: user.last_name },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "Вхід успішний ✅",
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
                created_at: user.created_at,
            },
        });
    } catch (err) {
        console.error("❌ loginUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 🔹 Отримати поточного користувача
export const getCurrentUser = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token)
            return res.status(401).json({ success: false, message: "Немає токена авторизації" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const userRes = await pool.query(
            `SELECT id, first_name, last_name, email, role, created_at
             FROM users WHERE id = $1`,
            [decoded.id]
        );

        if (userRes.rows.length === 0)
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });

        res.json({ success: true, user: userRes.rows[0] });
    } catch (err) {
        console.error("❌ getCurrentUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 🔹 Оновлення профілю
export const updateProfile = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token)
            return res.status(401).json({ success: false, message: "Немає токена авторизації" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { first_name, last_name, email } = req.body;

        const result = await pool.query(
            `UPDATE users
             SET first_name = $1, last_name = $2, email = $3
             WHERE id = $4
                 RETURNING id, first_name, last_name, email, role, created_at`,
            [first_name, last_name, email, decoded.id]
        );

        res.json({
            success: true,
            message: "Профіль оновлено ✅",
            user: result.rows[0],
        });
    } catch (err) {
        console.error("❌ updateProfile error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 🔒 Зміна пароля
export const changePassword = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token)
            return res.status(401).json({ success: false, message: "Немає токена авторизації" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { oldPassword, newPassword } = req.body;

        const userRes = await pool.query("SELECT password FROM users WHERE id = $1", [decoded.id]);
        if (userRes.rows.length === 0)
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });

        const isMatch = await bcrypt.compare(oldPassword, userRes.rows[0].password);
        if (!isMatch)
            return res.status(400).json({ success: false, message: "Старий пароль невірний" });

        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, decoded.id]);

        res.json({ success: true, message: "Пароль успішно змінено ✅" });
    } catch (err) {
        console.error("❌ changePassword error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
