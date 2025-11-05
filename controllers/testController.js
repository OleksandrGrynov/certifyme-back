//testController.js
import prisma from "../config/prisma.js";
import axios from "axios";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { checkAchievements } from "../utils/achievementEngine.js";
import { generateCertificatePDF } from "../utils/certificateGenerator.js";
// 🌍 Автоматичний переклад через Google Translate
async function translateText(text, from = "uk", to = "en") {
    if (!text?.trim()) return text;
    try {
        const res = await axios.get("https://translate.googleapis.com/translate_a/single", {
            params: { client: "gtx", sl: from, tl: to, dt: "t", q: text },
            timeout: 10000,
        });
        return res.data?.[0]?.[0]?.[0] || text;
    } catch (err) {
        console.error("❌ translateText error:", err.message);
        return text;
    }
}

// 🧩 Створення тесту
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
            price_cents, // ✅ додано
            currency,    // ✅ додано
        } = req.body;

        // 🧠 Підстраховка для назв / описів
        title_ua = title_ua || title || "Без назви";
        description_ua = description_ua || description || "";

        // 🌍 Автоматичний переклад, якщо англ. не заповнено
        title_en = title_en?.trim() || (await translateText(title_ua));
        description_en = description_en?.trim() || (await translateText(description_ua));

        // 💾 Створення тесту
        const test = await prisma.test.create({
            data: {
                titleUa: title_ua,
                titleEn: title_en,
                descriptionUa: description_ua,
                descriptionEn: description_en,
                imageUrl: image_url,
                priceCents: Number(price_cents) || 0, // ✅ тепер працює
                currency: currency || "usd",           // ✅ тепер зберігається
                createdAt: new Date(),
            },
        });

        // 🧩 Збереження питань та відповідей
        if (Array.isArray(questions)) {
            for (const q of questions) {
                const questionUa = q.question_ua || q.text || "";
                const questionEn = q.question_en?.trim() || (await translateText(questionUa));

                const question = await prisma.question.create({
                    data: { testId: test.id, questionUa, questionEn },
                });

                if (Array.isArray(q.answers)) {
                    for (const a of q.answers) {
                        const answerUa = a.answer_ua || a.text || "";
                        const answerEn = a.answer_en?.trim() || (await translateText(answerUa));

                        await prisma.answer.create({
                            data: {
                                questionId: question.id,
                                answerUa,
                                answerEn,
                                isCorrect: !!a.is_correct,
                            },
                        });
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


// 📘 Отримати тест з питаннями та відповідями
export const getTestById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const test = await prisma.test.findUnique({
            where: { id },
            select: {
                id: true,
                titleUa: true,
                titleEn: true,
                descriptionUa: true,
                descriptionEn: true,
                imageUrl: true,
                priceCents: true,
                currency: true,
                questions: {
                    select: {
                        id: true,
                        questionUa: true,
                        questionEn: true,
                        answers: {
                            select: {
                                id: true,
                                answerUa: true,
                                answerEn: true,
                                isCorrect: true,
                            },
                            orderBy: { id: "asc" },
                        },
                    },
                    orderBy: { id: "asc" },
                },
            },
        });

        if (!test)
            return res.status(404).json({ success: false, message: "Test not found" });

        const formatted = {
            id: test.id,
            title_ua: test.titleUa,
            title_en: test.titleEn,
            description_ua: test.descriptionUa,
            description_en: test.descriptionEn,
            image_url: test.imageUrl,
            price_cents: test.priceCents,
            currency: test.currency,
            questions: test.questions.map((q) => ({
                id: q.id,
                question_ua: q.questionUa,
                question_en: q.questionEn,
                answers: q.answers.map((a) => ({
                    id: a.id,
                    answer_ua: a.answerUa,
                    answer_en: a.answerEn,
                    is_correct: a.isCorrect,
                })),
            })),
        };

        res.json({ success: true, test: formatted });
    } catch (err) {
        console.error("❌ getTestById error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};



// 📜 Генерація або завантаження існуючого сертифіката
export const generateCertificate = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ success: false, message: "No token" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const { testId, score, total } = req.body;
        if (!testId || score == null || total == null)
            return res.status(400).json({ success: false, message: "Missing test data" });

        const test = await prisma.test.findUnique({ where: { id: Number(testId) } });
        if (!test) return res.status(404).json({ success: false, message: "Test not found" });

        const percent = Math.round((score / total) * 100);

        // 🔍 Перевірка: чи вже є сертифікат цього користувача за цей тест
        let existingCert = await prisma.certificate.findFirst({
            where: { userId: decoded.id, testId: test.id },
        });

        if (existingCert) {
            // 🧾 Якщо PDF уже згенерований — просто віддаємо файл
            const existingPath = path.resolve(
                "certificates",
                `certificate_${existingCert.certId}.pdf`
            );
            if (fs.existsSync(existingPath)) {
                console.log("📎 Returning existing certificate:", existingCert.certId);
                return res.download(existingPath, `certificate_${existingCert.certId}.pdf`);
            }

            // Якщо запис є, але PDF втрачено → згенеруємо заново
            console.log("⚠️ PDF missing, regenerating...");
            const pdfPath = await generateCertificatePDF(existingCert.certId);
            await new Promise((r) => setTimeout(r, 200));
            return res.download(pdfPath, `certificate_${existingCert.certId}.pdf`);
        }

        // 🆕 Інакше створюємо новий сертифікат
        const certId = `C-UA-${Math.floor(100000 + Math.random() * 900000)}`;
        const certificate = await prisma.certificate.create({
            data: {
                certId,
                userId: decoded.id,
                userName: `${user.firstName} ${user.lastName}`,
                userEmail: user.email,
                testId: test.id,
                course: test.titleUa,
                courseEn: test.titleEn || test.titleUa,
                issued: new Date(),
                expires: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                percent,
            },
        });

        const pdfPath = await generateCertificatePDF(certId);
        await new Promise((r) => setTimeout(r, 200));

        console.log("✅ New certificate created:", certId);
        res.download(pdfPath, `certificate_${certId}.pdf`);
    } catch (err) {
        console.error("❌ generateCertificate error:", err);
        res
            .status(500)
            .json({ success: false, message: "Certificate generation failed" });
    }
};



// 💵 Курс USD→UAH
async function getUsdToUahRate() {
    try {
        const r = await axios.get(
            "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json"
        );
        return r.data?.[0]?.rate || 42;
    } catch {
        return 42;
    }
}

// 🗑️ Видалити тест
export const deleteTest = async (req, res) => {
    try {
        const id = Number(req.params.id);

        await prisma.$transaction(async (tx) => {
            // 1️⃣ Видаляємо доступи користувачів (user_tests)
            await tx.userTest.deleteMany({ where: { testId: id } });

            // 2️⃣ Видаляємо історію проходжень (user_test_history)
            await tx.userTestHistory.deleteMany({ where: { testId: id } });

            // 3️⃣ Видаляємо сертифікати
            await tx.certificate.deleteMany({ where: { testId: id } });

            // 4️⃣ Видаляємо платежі, якщо є
            await tx.payment.deleteMany({ where: { testId: id } });

            // 5️⃣ Видаляємо відповіді та питання
            await tx.answer.deleteMany({ where: { question: { testId: id } } });
            await tx.question.deleteMany({ where: { testId: id } });

            // 6️⃣ Видаляємо сам тест
            await tx.test.delete({ where: { id } });
        });

        res.json({ success: true, message: "🗑️ Тест успішно видалено" });
    } catch (err) {
        console.error("❌ deleteTest error:", err);
        res.status(500).json({
            success: false,
            message: "Помилка при видаленні тесту",
            error: err.message,
        });
    }
};


// 🧩 Усі тести
export const getAllTests = async (req, res) => {
    try {
        const lang = req.query.lang === "en" ? "en" : "ua";
        const rate = await getUsdToUahRate();

        const tests = await prisma.test.findMany({ orderBy: { id: "asc" } });
        const result = tests.map((t) => ({
            id: t.id,
            title: lang === "en" ? t.titleEn : t.titleUa,
            description: lang === "en" ? t.descriptionEn : t.descriptionUa,
            image_url: t.imageUrl,
            price_cents: t.priceCents,
            currency: t.currency,
            created_at: t.createdAt,
            price_uah: Math.round(((t.priceCents || 0) / 100) * rate),
        }));
        res.json({ success: true, tests: result, lang, rate });
    } catch (err) {
        console.error("❌ getAllTests error:", err);
        res.status(500).json({ success: false });
    }
};

// ✏️ Оновлення тесту
export const updateTest = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { title_ua, title_en, description_ua, description_en, image_url, price_amount, currency } =
            req.body;
        const rate = await getUsdToUahRate();

        let newCurrency = (currency || "usd").toLowerCase();
        let priceCents = 0;
        if (!isNaN(price_amount)) {
            if (newCurrency === "usd") priceCents = Math.round(price_amount * 100);
            else if (newCurrency === "uah") {
                const usd = price_amount / rate;
                priceCents = Math.round(usd * 100);
                newCurrency = "usd";
            }
        }

        const updated = await prisma.test.update({
            where: { id },
            data: {
                titleUa: title_ua || "Без назви",
                titleEn: title_en || title_ua,
                descriptionUa: description_ua || "",
                descriptionEn: description_en || description_ua,
                imageUrl: image_url,
                priceCents,
                currency: newCurrency,
            },
        });

        res.json({ success: true, message: "✅ Тест оновлено", test: updated });
    } catch (err) {
        console.error("❌ updateTest error:", err);
        res.status(500).json({ success: false });
    }
};

// 📜 Перевірка сертифіката
export const verifyCertificate = async (req, res) => {
    try {
        const cert = await prisma.certificate.findUnique({
            where: { certId: req.params.cert_id },
            include: { user: true },
        });
        if (!cert)
            return res.status(404).json({ success: false, message: "❌ Сертифікат не знайдено" });

        const expired = new Date() > cert.expires;
        res.json({
            success: true,
            valid: !expired,
            id: cert.certId,
            name: cert.user
                ? `${cert.user.firstName} ${cert.user.lastName}`
                : cert.userName,
            course: cert.course,
            issued: new Date(cert.issued).toLocaleDateString("uk-UA"),
            expires: new Date(cert.expires).toLocaleDateString("uk-UA"),
            percent: cert.percent,
            status: expired ? "Сертифікат прострочений" : "Дійсний сертифікат ✅",
        });
    } catch (err) {
        console.error("❌ verifyCertificate error:", err);
        res.status(500).json({ success: false });
    }
};

// 📜 Усі сертифікати користувача
export const getUserCertificates = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ success: false, message: "Неавторизовано" });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const certs = await prisma.certificate.findMany({
            where: { userId: decoded.id },
            include: {
                user: true,
                test: true,
            },
            orderBy: { issued: "desc" },
        });

        const result = certs.map((c) => ({
            cert_id: c.certId,
            user_id: c.userId,
            test_id: c.testId,
            issued: c.issued,
            expires: c.expires,
            percent: c.percent,
            course_ua: c.test?.titleUa || c.course,
            course_en: c.test?.titleEn || c.course,
            user: {
                id: c.user?.id,
                name: `${c.user?.firstName || ""} ${c.user?.lastName || ""}`.trim(),
                email: c.user?.email || c.userEmail || "-",
            },
        }));

        res.json({ success: true, certificates: result });
    } catch (err) {
        console.error("❌ getUserCertificates error:", err);
        res.status(500).json({ success: false });
    }
};

// 🧩 Збереження результату тесту
export const saveTestResult = async (req, res) => {
    try {
        console.log("📥 Test result received:", { body: req.body, user: req.user });

        const userId = req.user.id;
        const { testId, score, total } = req.body;
        if (!testId || score == null || total == null)
            return res.status(400).json({ success: false, message: "Invalid data" });

        const passed = score >= total * 0.6;
        await prisma.userTestHistory.create({
            data: { userId, testId: Number(testId), score, total, passed },
        });

        const [testsPassed, certCount] = await Promise.all([
            prisma.userTestHistory.count({ where: { userId, passed: true } }),
            prisma.certificate.count({ where: { userId } }),
        ]);

        const newAchievements = await checkAchievements({
            id: userId,
            testsPassed,
            certificates: certCount,
            score: (score / total) * 100,
        });

        res.json({ success: true, newAchievements });
    } catch (err) {
        console.error("❌ saveTestResult error:", err);
        res.status(500).json({ success: false });
    }
};

// 🧩 Пройдені тести користувача
export const getUserPassedTests = async (req, res) => {
    try {
        const userId = req.user.id;
        const history = await prisma.userTestHistory.findMany({
            where: { userId },
            include: { test: true },
            orderBy: { createdAt: "desc" },
        });

        const tests = history.map((h) => ({
            ...h,
            title_ua: h.test?.titleUa,
            title_en: h.test?.titleEn,
            image_url: h.test?.imageUrl,
        }));

        res.json({ success: true, tests });
    } catch (err) {
        console.error("❌ getUserPassedTests error:", err);
        res.status(500).json({ success: false });
    }
};
export const getUserTestResult = async (req, res) => {
    try {
        const userId = req.user.id;
        const testId = Number(req.params.testId);

        const attempt = await prisma.userTestHistory.findFirst({
            where: { userId, testId },
            orderBy: { createdAt: "desc" }, // ✅ правильне поле
            include: {
                test: {
                    select: {
                        id: true,
                        titleUa: true,
                        titleEn: true,
                        descriptionUa: true,
                        descriptionEn: true,
                    },
                },
            },
        });

        if (!attempt)
            return res
                .status(404)
                .json({ success: false, message: "Result not found" });

        res.json({
            success: true,
            result: {
                id: attempt.testId,
                score: attempt.score,
                total: attempt.total,
                passed: attempt.passed,
                created_at: attempt.createdAt, // ✅ лишаємо camelCase з Prisma
                title_ua: attempt.test.titleUa,
                title_en: attempt.test.titleEn,
            },
        });
    } catch (err) {
        console.error("❌ getUserTestResult error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


