import express from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { pool } from "../config/db.js";

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// 🔹 Отримує Google ID токен із фронта, перевіряє його та повертає JWT
router.post("/google-token", async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ success: false, message: "Token відсутній" });
        }

        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const email = payload.email;
        const first_name = payload.given_name;
        const last_name = payload.family_name;

        // 🔸 Перевіряємо користувача
        const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        let user;

        if (existing.rows.length > 0) {
            user = existing.rows[0];
        } else {
            const newUser = await pool.query(
                `INSERT INTO users (first_name, last_name, email, password, role, created_at)
         VALUES ($1, $2, $3, '', 'user', NOW())
         RETURNING id, first_name, last_name, email, role, created_at`,
                [first_name, last_name, email]
            );
            user = newUser.rows[0];
        }

        const jwtToken = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({ success: true, token: jwtToken, user });
    } catch (err) {
        console.error("❌ Google auth error:", err.message);
        res.status(403).json({ success: false, message: "Помилка авторизації через Google" });
    }
});

export default router;
