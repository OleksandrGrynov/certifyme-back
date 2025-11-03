import { pool } from "../config/db.js";
import { translateText } from "../utils/translate.js";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// 🟢 Створити досягнення (автопереклад)
export async function createAchievement(req, res) {
    try {
        const {
            title_ua,
            description_ua,
            image_url,
            category,
            icon,
            trigger_text,
        } = req.body;

        // 🧠 Запит до ChatGPT для генерації коду
        const prompt = `
      Напиши фрагмент коду JavaScript, який перевіряє умову:
      "${trigger_text}".
      Змінна "user" містить дані користувача: testsPassed, certificates, score тощо.
      Використай функцію unlockAchievement(user, "код_досягнення") якщо умова виконується.
      Тільки код, без пояснень.
    `;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
        });

        const generated_code = response.choices[0].message.content.trim();

        // 🔹 зберігаємо все
        const result = await pool.query(
            `INSERT INTO achievements 
      (title_ua, description_ua, image_url, category, icon, trigger_text, generated_code)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
            [title_ua, description_ua, image_url, category, icon, trigger_text, generated_code]
        );

        res.json({ success: true, achievement: result.rows[0] });
    } catch (err) {
        console.error("❌ createAchievement error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
}

// 🔴 Видалити досягнення
export async function deleteAchievement(req, res) {
    try {
        const { id } = req.params;
        await pool.query(`DELETE FROM achievements WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ deleteAchievement error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// 🟡 Оновити досягнення
export async function updateAchievement(req, res) {
    try {
        const { id } = req.params;
        const {
            title_ua,
            description_ua,
            image_url,
            category,
            icon,
            trigger_text,
        } = req.body;

        // Якщо оновили умову — GPT має знову згенерувати код
        let generated_code = null;
        if (trigger_text) {
            const prompt = `
              Напиши фрагмент коду JavaScript, який перевіряє умову:
              "${trigger_text}".
              Змінна "user" містить дані користувача: testsPassed, certificates, score тощо.
              Використай функцію unlockAchievement(user, "код_досягнення") якщо умова виконується.
              Тільки код, без пояснень.
            `;

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
            });

            generated_code = response.choices[0].message.content.trim();
        }

        const result = await pool.query(
            `UPDATE achievements 
             SET title_ua=$1, description_ua=$2, image_url=$3, category=$4, icon=$5, trigger_text=$6, generated_code=COALESCE($7, generated_code)
             WHERE id=$8
             RETURNING *`,
            [
                title_ua,
                description_ua,
                image_url,
                category,
                icon,
                trigger_text,
                generated_code,
                id,
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Achievement not found" });
        }

        res.json({ success: true, achievement: result.rows[0] });
    } catch (err) {
        console.error("❌ updateAchievement error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
