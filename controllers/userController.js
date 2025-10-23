import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";

// 🔹 Реєстрація користувача
export const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Email already exists" });
        }

        const hashed = await bcrypt.hash(password, 10);

        // 🔸 за замовчуванням роль "user"
        const result = await pool.query(
            `INSERT INTO users (name, email, password, role, created_at)
       VALUES ($1, $2, $3, 'user', NOW())
       RETURNING id, name, email, role, created_at`,
            [name, email, hashed]
        );

        // 🔸 створюємо токен із роллю
        const token = jwt.sign(
            { id: result.rows[0].id, role: result.rows[0].role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "Registration successful",
            token,
            user: result.rows[0],
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
            return res.status(400).json({ success: false, message: "User not found" });
        }

        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
            return res.status(401).json({ success: false, message: "Invalid password" });
        }

        // 🔸 токен з роллю
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
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
        if (!token) return res.status(401).json({ success: false, message: "No token provided" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRes = await pool.query(
            "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
            [decoded.id]
        );

        if (userRes.rows.length === 0)
            return res.status(404).json({ success: false, message: "User not found" });

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
        if (!token) return res.status(401).json({ success: false, message: "No token provided" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { name, email } = req.body;

        const result = await pool.query(
            "UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email, role, created_at",
            [name, email, decoded.id]
        );

        res.json({
            success: true,
            message: "Profile updated successfully",
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
        if (!token) return res.status(401).json({ success: false, message: "No token provided" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { oldPassword, newPassword } = req.body;

        const userRes = await pool.query("SELECT password FROM users WHERE id = $1", [decoded.id]);
        if (userRes.rows.length === 0)
            return res.status(404).json({ success: false, message: "User not found" });

        const isMatch = await bcrypt.compare(oldPassword, userRes.rows[0].password);
        if (!isMatch)
            return res.status(400).json({ success: false, message: "Incorrect old password" });

        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, decoded.id]);

        res.json({ success: true, message: "Password updated successfully" });
    } catch (err) {
        console.error("❌ changePassword error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
