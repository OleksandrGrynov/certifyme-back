import { pool } from "../config/db.js";
import axios from "axios";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

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
        return translated || text;
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
             VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING id`,
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
                     VALUES ($1,$2,$3) RETURNING id`,
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
                             VALUES ($1,$2,$3,$4)`,
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

// 📘 Отримати тест з усіма мовами (для адмінки)
export const getTestById = async (req, res) => {
    try {
        const { id } = req.params;

        const testRes = await pool.query(
            `SELECT id, title_ua, title_en, description_ua, description_en, image_url, price_cents, currency 
       FROM tests WHERE id = $1`,
            [id]
        );

        if (testRes.rows.length === 0)
            return res.status(404).json({ success: false, message: "Test not found" });

        const test = testRes.rows[0];

        // Завантажуємо питання для обох мов
        const questionsRes = await pool.query(
            `SELECT id, question_ua, question_en FROM questions WHERE test_id = $1 ORDER BY id ASC`,
            [id]
        );

        const questions = [];

        for (const q of questionsRes.rows) {
            const answersRes = await pool.query(
                `SELECT id, answer_ua, answer_en, is_correct 
         FROM answers WHERE question_id = $1 ORDER BY id ASC`,
                [q.id]
            );

            questions.push({
                id: q.id,
                question_ua: q.question_ua,
                question_en: q.question_en,
                answers: answersRes.rows.map(a => ({
                    id: a.id,
                    answer_ua: a.answer_ua,
                    answer_en: a.answer_en,
                    is_correct: a.is_correct,
                })),
            });
        }

        res.json({ success: true, test: { ...test, questions } });
    } catch (err) {
        console.error("❌ getTestById error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};



// 🧾 Генерація сертифіката з QR-кодом і двома мовами
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

        const { test_id, test_title, score, total } = req.body;

        // ✅ Якщо test_id переданий — знайдемо назви курсу в БД
        let course_ua = test_title;
        let course_en = test_title;
        if (test_id) {
            const testRes = await pool.query(
                "SELECT title_ua, title_en FROM tests WHERE id = $1",
                [test_id]
            );
            if (testRes.rows.length > 0) {
                course_ua = testRes.rows[0].title_ua;
                course_en = testRes.rows[0].title_en;
            }
        }

        const fullName = `${userRes.rows[0].first_name} ${userRes.rows[0].last_name}`;
        const percent = Math.round((score / total) * 100);
        const certId = `C-UA-${Math.floor(100000 + Math.random() * 900000)}`;
        const issued = new Date();
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);

        // === QR-код ===
        const verifyUrl = `http://localhost:5173/verify/${certId}`;
        fs.mkdirSync("certificates", { recursive: true });
        const qrPath = path.join("certificates", `qr_${certId}.png`);
        await QRCode.toFile(qrPath, verifyUrl, { width: 180, color: { dark: "#00703C" } });

        // === Шрифти і файли ===
        const fontPath = path.join("fonts", "OpenSans-Regular.ttf");
        const filePath = path.join("certificates", `certificate_${certId}.pdf`);
        const logoPath = path.join("assets", "logo.png");
        const stampPath = path.join("assets", "stamp.png");

        const doc = new PDFDocument({ size: "A4", margin: 40 });
        if (fs.existsSync(fontPath)) {
            doc.registerFont("ua", fontPath);
            doc.font("ua");
        }

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // === Параметри сторінки ===
        const PAGE_W = doc.page.width;
        const PAGE_H = doc.page.height;
        const MARGIN = 48;
        const INNER_W = PAGE_W - MARGIN * 2;

        // === Фон і рамка ===
        doc.rect(0, 0, PAGE_W, PAGE_H).fill("#ffffff");
        doc.save()
            .lineWidth(6)
            .strokeColor("#00703C")
            .rect(MARGIN - 20, MARGIN - 20, PAGE_W - (MARGIN - 20) * 2, PAGE_H - (MARGIN - 20) * 2)
            .stroke()
            .restore();

        // === Логотип ===
        let cursorY = MARGIN + 16;
        if (fs.existsSync(logoPath)) {
            const LOGO_W = 72;
            doc.image(logoPath, (PAGE_W - LOGO_W) / 2, cursorY, { width: LOGO_W });
            cursorY += 72 + 14;
        }

        // === Заголовок ===
        doc.fontSize(30).fillColor("#00703C")
            .text("СЕРТИФІКАТ", MARGIN, cursorY, { width: INNER_W, align: "center" });
        cursorY += 34;

        doc.fontSize(12).fillColor("#555")
            .text(`№: ${certId}`, MARGIN, cursorY, { width: INNER_W, align: "center" });
        cursorY += 26;

        // === Основний текст ===
        doc.fontSize(14).fillColor("#000")
            .text("Цей сертифікат засвідчує, що", MARGIN, cursorY, { width: INNER_W, align: "center" });
        cursorY += 22;

        doc.fontSize(20).fillColor("#00703C")
            .text(fullName, MARGIN, cursorY, { width: INNER_W, align: "center" });
        cursorY += 26;

        doc.fontSize(14).fillColor("#000")
            .text("успішно завершив(ла) курс:", MARGIN, cursorY, { width: INNER_W, align: "center" });
        cursorY += 18;

        doc.fontSize(16).fillColor("#00703C")
            .text(`«${course_ua}»`, MARGIN, cursorY, { width: INNER_W, align: "center" });
        cursorY += 22;

        doc.fontSize(12).fillColor("#333")
            .text(`Результат: ${score} з ${total} (${percent}%)`, MARGIN, cursorY, { width: INNER_W, align: "center" });
        cursorY += 40;

        // === Дати + підпис ===
        const LEFT_X = MARGIN + 20;
        const RIGHT_X = PAGE_W - MARGIN - 220;

        doc.fontSize(12).fillColor("#000")
            .text(`Виданий: ${issued.toLocaleDateString("uk-UA")}`, LEFT_X, PAGE_H - MARGIN - 180)
            .text(`Діє до: ${expires.toLocaleDateString("uk-UA")}`, RIGHT_X, PAGE_H - MARGIN - 180);

        doc.text("__________________", LEFT_X, PAGE_H - MARGIN - 130);
        doc.text("Підпис викладача", LEFT_X + 5, PAGE_H - MARGIN - 112);

        if (fs.existsSync(stampPath)) {
            doc.image(stampPath, RIGHT_X, PAGE_H - MARGIN - 142, { width: 96 });
        }

        // === QR-код ===
        const QR_W = 126;
        const QR_X = PAGE_W - MARGIN - QR_W;
        const QR_Y = PAGE_H - MARGIN - QR_W - 40;

        if (fs.existsSync(qrPath)) {
            doc.image(qrPath, QR_X, QR_Y, { width: QR_W });
            doc.fontSize(10).fillColor("#555")
                .text("Перевірити сертифікат:", QR_X - 10, QR_Y + QR_W + 6, { width: QR_W + 20, align: "center" })
                .text(verifyUrl, QR_X - 20, QR_Y + QR_W + 20, { width: QR_W + 40, align: "center" });
        }

        doc.fontSize(10).fillColor("#00703C")
            .text("CertifyMe © 2025", MARGIN, PAGE_H - MARGIN, { width: INNER_W, align: "right" });

        doc.end();

        // === 🧾 Зберігаємо в БД обидві мови ===
        await pool.query(
            `INSERT INTO certificates (cert_id, user_id, user_name, course, course_en, test_id, issued, expires, percent)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [certId, decoded.id, fullName, course_ua, course_en, test_id, issued, expires, percent]
        );

        stream.on("finish", () => res.download(filePath));
    } catch (err) {
        console.error("❌ generateCertificate error:", err);
        res.status(500).json({
            success: false,
            message: "Не вдалося створити сертифікат або QR-код.",
        });
    }
};

// 📈 Динамічний курс USD → UAH з API НБУ
async function getUsdToUahRate() {
    try {
        const res = await axios.get(
            "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json"
        );
        const rate = res.data?.[0]?.rate;
        console.log("💵 Курс НБУ USD→UAH:", rate);
        return rate || 42;
    } catch (err) {
        console.error("⚠️ Не вдалося отримати курс НБУ:", err.message);
        return 42; // fallback
    }
}


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
        res.json({ success: true, message: "🗑️ Тест видалено успішно" });
    } catch (err) {
        console.error("❌ deleteTest error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 🧩 Отримати всі тести з урахуванням мови
export const getAllTests = async (req, res) => {
    try {
        const lang = req.query.lang === "en" ? "en" : "ua";
        const rate = await getUsdToUahRate();

        const titleField = lang === "en" ? "title_en" : "title_ua";
        const descField = lang === "en" ? "description_en" : "description_ua";

        const result = await pool.query(`
      SELECT id, ${titleField} AS title, ${descField} AS description,
             image_url, price_cents, currency, created_at
      FROM tests
      ORDER BY id ASC
    `);

        // 💰 додаємо поле для відображення ціни в гривнях
        const tests = result.rows.map(t => ({
            ...t,
            price_uah: Math.round((t.price_cents / 100) * rate),
        }));

        res.json({ success: true, tests, lang, rate });
    } catch (err) {
        console.error("❌ getAllTests error:", err);
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
            price_amount,
            currency,
        } = req.body;

        // 🔹 Підвантажуємо курс з НБУ
        const rate = await getUsdToUahRate();

        const tUa = title_ua || "Без назви";
        const tEn = title_en || tUa;
        const dUa = description_ua || "";
        const dEn = description_en || dUa;

        let newCurrency = (currency || "usd").toLowerCase();
        let priceCents = 0;

        // 💵 Конвертація ціни
        if (!isNaN(price_amount)) {
            if (newCurrency === "usd") {
                // якщо ціна в доларах
                priceCents = Math.round(price_amount * 100);
            } else if (newCurrency === "uah") {
                // якщо ціна в гривнях → переводимо в USD і зберігаємо у центах
                const usdValue = price_amount / rate;
                priceCents = Math.round(usdValue * 100);
                newCurrency = "usd"; // у БД зберігаємо тільки USD
            }
        }

        // 🧩 Оновлення тесту
        const result = await pool.query(
            `UPDATE tests
             SET title_ua=$1, title_en=$2, description_ua=$3, description_en=$4,
                 image_url=$5, price_cents=$6, currency=$7
             WHERE id=$8 RETURNING *`,
            [tUa, tEn, dUa, dEn, image_url, priceCents, "usd", id]
        );

        if (result.rows.length === 0)
            return res
                .status(404)
                .json({ success: false, message: "❌ Тест не знайдено" });

        res.json({
            success: true,
            message: "✅ Тест оновлено",
            test: result.rows[0],
        });
    } catch (err) {
        console.error("❌ updateTest error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};



// 📜 Перевірка сертифіката за QR-кодом
export const verifyCertificate = async (req, res) => {
    try {
        const { cert_id } = req.params;
        const result = await pool.query(
            `SELECT c.*, json_build_object('id', u.id, 'name', COALESCE(u.first_name || ' ' || u.last_name, c.user_name), 'email', COALESCE(u.email, c.user_email, '-')) AS "user"
             FROM certificates c
             LEFT JOIN users u ON u.id = c.user_id
             WHERE c.cert_id = $1`,
            [cert_id]
        );

        if (result.rows.length === 0)
            return res.status(404).json({
                success: false,
                message: "❌ Сертифікат не знайдено або недійсний",
            });

        const cert = result.rows[0];
        const now = new Date();
        const isExpired = now > new Date(cert.expires);

        res.json({
            success: true,
            valid: !isExpired,
            id: cert.cert_id,
            name: (cert.user && cert.user.name) || cert.user_name,
            user: cert.user || null,
            course: cert.course,
            issued: new Date(cert.issued).toLocaleDateString("uk-UA"),
            expires: new Date(cert.expires).toLocaleDateString("uk-UA"),
            percent: cert.percent,
            status: isExpired ? "Сертифікат прострочений" : "Дійсний сертифікат ✅",
        });
    } catch (err) {
        console.error("❌ verifyCertificate error:", err);
        res.status(500).json({
            success: false,
            message: "Помилка сервера при перевірці сертифіката",
        });
    }
};
// 📜 Отримати всі сертифікати користувача
export const getUserCertificates = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token)
            return res.status(401).json({ success: false, message: "Неавторизовано" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const result = await pool.query(
            `
                SELECT
                    c.cert_id,
                    c.user_id,
                    c.test_id,
                    c.issued,
                    c.expires,
                    c.percent,
                    COALESCE(t.title_ua, c.course) AS course_ua,
                    COALESCE(t.title_en, c.course) AS course_en,
                    json_build_object(
                            'id', u.id,
                            'name', COALESCE(u.first_name || ' ' || u.last_name, c.user_name),
                            'email', COALESCE(u.email, c.user_email, '-')
                    ) AS "user"
                FROM certificates c
                         LEFT JOIN users u ON u.id = c.user_id
                         LEFT JOIN tests t ON t.id = c.test_id
                WHERE c.user_id = $1 OR c.user_name ILIKE $2
                ORDER BY c.issued DESC;
            `,
            [decoded.id, `%${decoded.first_name || ''}%`]
        );

        res.json({ success: true, certificates: result.rows });
    } catch (err) {
        console.error("❌ getUserCertificates error:", err);
        res.status(500).json({
            success: false,
            message: "Помилка при завантаженні сертифікатів",
        });
    }
};