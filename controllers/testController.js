import { pool } from "../config/db.js";
import axios from "axios";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

// 🌍 Автоматичний переклад через безкоштовний Google Translate API
async function translateText(text, from = "uk", to = "en") {
    if (!text || !text.trim()) return text;
    try {
        const response = await axios.get("https://translate.googleapis.com/translate_a/single", {
            params: {
                client: "gtx",
                sl: from,
                tl: to,
                dt: "t",
                q: text,
            },
            timeout: 10000,
        });
        const translated = response.data?.[0]?.[0]?.[0];
        if (translated && translated !== text) {
            console.log(`✅ Переклад: "${text}" → "${translated}"`);
            return translated;
        } else {
            console.warn(`⚠️ Не отримано переклад для: "${text}"`);
            return text;
        }
    } catch (err) {
        console.error("❌ Помилка перекладу:", err.message);
        return text;
    }
}

// 🧩 Створення тесту з авто-перекладом
export const createTest = async (req, res) => {
    try {
        let {
            title_ua,
            title_en,
            description_ua,
            description_en,
            image_url,
            questions,
            title,
            description,
        } = req.body;

        title_ua = title_ua || title || "Без назви";
        description_ua = description_ua || description || "";

        if (!title_en || !title_en.trim()) title_en = await translateText(title_ua);
        if (!description_en || !description_en.trim())
            description_en = await translateText(description_ua);

        const testResult = await pool.query(
            `INSERT INTO tests (title_ua, title_en, description_ua, description_en, image_url, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
            [title_ua, title_en, description_ua, description_en, image_url]
        );

        const testId = testResult.rows[0].id;

        if (questions && Array.isArray(questions)) {
            for (const q of questions) {
                const question_ua = q.question_ua || q.text || "";
                const question_en =
                    q.question_en && q.question_en.trim()
                        ? q.question_en
                        : await translateText(question_ua);

                const qRes = await pool.query(
                    `INSERT INTO questions (test_id, question_ua, question_en)
           VALUES ($1, $2, $3)
           RETURNING id`,
                    [testId, question_ua, question_en]
                );

                const qId = qRes.rows[0].id;

                if (q.answers && Array.isArray(q.answers)) {
                    for (const a of q.answers) {
                        const answer_ua = a.answer_ua || a.text || "";
                        const answer_en =
                            a.answer_en && a.answer_en.trim()
                                ? a.answer_en
                                : await translateText(answer_ua);

                        await pool.query(
                            `INSERT INTO answers (question_id, answer_ua, answer_en, is_correct)
               VALUES ($1, $2, $3, $4)`,
                            [qId, answer_ua, answer_en, a.is_correct || false]
                        );
                    }
                }
            }
        }

        res.json({ success: true, message: "✅ Тест створено з авто-перекладом" });
    } catch (err) {
        console.error("❌ createTest error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 🧩 Отримати всі тести
export const getAllTests = async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM tests ORDER BY id ASC");
        res.json({ success: true, tests: result.rows });
    } catch (err) {
        console.error("❌ getAllTests error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 🗑️ Видалити тест
export const deleteTest = async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query(
            `DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE test_id = $1)`,
            [id]
        );
        await pool.query(`DELETE FROM questions WHERE test_id = $1`, [id]);
        await pool.query(`DELETE FROM tests WHERE id = $1`, [id]);

        res.json({ success: true, message: "🗑️ Тест видалено" });
    } catch (err) {
        console.error("❌ deleteTest error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ✏️ Оновити тест
export const updateTest = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title_ua,
            title_en,
            description_ua,
            description_en,
            image_url,
            title,
            description,
        } = req.body;

        const tUa = title_ua || title || "Без назви";
        const tEn = title_en && title_en.trim() ? title_en : await translateText(tUa);
        const dUa = description_ua || description || "";
        const dEn =
            description_en && description_en.trim()
                ? description_en
                : await translateText(dUa);

        const result = await pool.query(
            `UPDATE tests
       SET title_ua=$1, title_en=$2, description_ua=$3, description_en=$4, image_url=$5
       WHERE id=$6
       RETURNING *`,
            [tUa, tEn, dUa, dEn, image_url, id]
        );

        res.json({ success: true, test: result.rows[0] });
    } catch (err) {
        console.error("❌ updateTest error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 📘 Отримати тест з питаннями та відповідями
export const getTestById = async (req, res) => {
    try {
        const { id } = req.params;

        const testRes = await pool.query("SELECT * FROM tests WHERE id = $1", [id]);
        if (testRes.rows.length === 0)
            return res.status(404).json({ success: false, message: "Test not found" });

        const test = testRes.rows[0];

        const questionsRes = await pool.query(
            "SELECT * FROM questions WHERE test_id = $1 ORDER BY id ASC",
            [id]
        );

        const questions = [];
        for (const q of questionsRes.rows) {
            const answersRes = await pool.query(
                "SELECT * FROM answers WHERE question_id = $1 ORDER BY id ASC",
                [q.id]
            );
            questions.push({ ...q, answers: answersRes.rows });
        }

        res.json({ success: true, test: { ...test, questions } });
    } catch (err) {
        console.error("❌ getTestById error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 🪪 Генерація PDF-сертифіката
export const generateCertificate = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token)
            return res.status(401).json({ success: false, message: "No token provided" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRes = await pool.query(
            "SELECT first_name, last_name FROM users WHERE id = $1",
            [decoded.id]
        );

        if (userRes.rows.length === 0)
            return res.status(404).json({ success: false, message: "User not found" });

        const { test_title, score, total } = req.body;
        const fullName = `${userRes.rows[0].first_name} ${userRes.rows[0].last_name}`;
        const percent = Math.round((score / total) * 100);

        // Створюємо папку для сертифікатів
        fs.mkdirSync("certificates", { recursive: true });
        const filePath = path.join("certificates", `certificate_${Date.now()}.pdf`);

        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // 🔸 Білий фон
        doc.rect(0, 0, doc.page.width, doc.page.height).fill("#ffffff");

        // 🔸 Заголовок
        doc.fontSize(28).fillColor("#22c55e").text("CertifyMe", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(12).fillColor("#555").text("Офіційне підтвердження проходження тесту", { align: "center" });
        doc.moveDown(2);

        // 🔸 Тіло сертифіката
        doc.fontSize(16).fillColor("#000").text("Цей сертифікат підтверджує, що", { align: "center" });
        doc.moveDown(1);
        doc.fontSize(22).fillColor("#111").text(fullName, { align: "center", underline: true });
        doc.moveDown(1);
        doc.fontSize(14).fillColor("#000").text(`успішно завершив(ла) тест: "${test_title}"`, { align: "center" });
        doc.moveDown(1);
        doc.fontSize(12).fillColor("#333").text(`Результат: ${score} з ${total} (${percent}%)`, { align: "center", italic: true });
        doc.moveDown(3);

        // 🔸 Підпис і дата
        const currentDate = new Date().toLocaleDateString("uk-UA");
        doc.fontSize(10).fillColor("#555").text("__________________", 100, 700);
        doc.text("Підпис викладача", 105, 715);
        doc.text(`Дата видачі: ${currentDate}`, 400, 700);

        doc.end();

        stream.on("finish", () => {
            res.download(filePath);
        });
    } catch (err) {
        console.error("❌ generateCertificate error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
