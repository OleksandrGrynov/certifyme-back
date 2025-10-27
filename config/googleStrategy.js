import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { pool } from "./db.js";
import dotenv from "dotenv";

dotenv.config();

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "http://localhost:5000/api/auth/google/callback",
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails[0].value;
                const first_name = profile.name.givenName;
                const last_name = profile.name.familyName;

                // 🔸 перевіряємо чи користувач існує
                const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

                if (existing.rows.length > 0) {
                    return done(null, existing.rows[0]);
                }

                // 🔹 якщо ні — створюємо
                const result = await pool.query(
                    `INSERT INTO users (first_name, last_name, email, password, role, created_at)
           VALUES ($1, $2, $3, '', 'user', NOW())
           RETURNING id, first_name, last_name, email, role, created_at`,
                    [first_name, last_name, email]
                );

                done(null, result.rows[0]);
            } catch (err) {
                done(err, null);
            }
        }
    )
);
