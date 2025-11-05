import express from "express";
import {
    createTest,
    getAllTests,
    deleteTest,
    updateTest,
    getTestById,
    generateCertificate,
    verifyCertificate,
    saveTestResult,
    getUserPassedTests,
    getUserCertificates,
    getUserTestResult,
} from "../controllers/testController.js";
import fs from "fs";
import path from "path";
import authMiddleware, { isAdmin } from "../middleware/authMiddleware.js";
import { explainOneQuestion } from "../controllers/explanationController.js";
import prisma from "../config/prisma.js";

const router = express.Router();
router.get("/result/:testId", authMiddleware, getUserTestResult);
/* ────────────────────────────────────────────────────────────────
   📚 Публічні роути
   ──────────────────────────────────────────────────────────────── */
router.get("/", getAllTests);
router.get("/certificates/:cert_id", verifyCertificate);

/* ────────────────────────────────────────────────────────────────
   📜 Сертифікати користувача
   ──────────────────────────────────────────────────────────────── */

// 🔍 Перевірка чи вже існує PDF сертифікат користувача для тесту
router.get("/certificate/check/:testId", authMiddleware, async (req, res) => {
    try {
        const testId = Number(req.params.testId);
        const userId = req.user.id;

        const cert = await prisma.certificate.findFirst({
            where: { userId, testId },
        });

        if (!cert) {
            return res
                .status(404)
                .json({ success: false, message: "Certificate not found" });
        }

        const filePath = path.resolve("certificates", `certificate_${cert.certId}.pdf`);

        if (fs.existsSync(filePath)) {
            console.log("📄 Found existing certificate:", cert.certId);
            res.setHeader("Content-Type", "application/pdf");
            return res.download(filePath);
        }

        return res.status(404).json({ success: false, message: "PDF file not found" });
    } catch (err) {
        console.error("❌ Error checking certificate:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 🧾 Генерація нового сертифіката
router.post("/certificate", authMiddleware, generateCertificate);

/* ────────────────────────────────────────────────────────────────
   👤 Роути користувача
   ──────────────────────────────────────────────────────────────── */
router.get("/user/certificates", authMiddleware, getUserCertificates);
router.get("/user/passed", authMiddleware, getUserPassedTests);
router.post("/record", authMiddleware, saveTestResult);
router.post("/explain-one", explainOneQuestion);

/* ────────────────────────────────────────────────────────────────
   🛠️ Адмінські CRUD-операції
   ──────────────────────────────────────────────────────────────── */
router.post("/", authMiddleware, isAdmin, createTest);
router.put("/:id", authMiddleware, isAdmin, updateTest);
router.delete("/:id", authMiddleware, isAdmin, deleteTest);

/* ────────────────────────────────────────────────────────────────
   🧩 PUT /:id/questions — Повне оновлення питань тесту
   ──────────────────────────────────────────────────────────────── */
router.put("/:id/questions", authMiddleware, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { questions } = req.body;

    try {
        const testId = Number(id);
        if (!questions || !Array.isArray(questions)) {
            return res
                .status(400)
                .json({ success: false, message: "Некоректний формат питань" });
        }

        await prisma.$transaction(async (tx) => {
            await tx.answer.deleteMany({ where: { question: { testId } } });
            await tx.question.deleteMany({ where: { testId } });

            for (const q of questions) {
                const newQ = await tx.question.create({
                    data: {
                        testId,
                        questionUa: q.question_ua,
                        questionEn: q.question_en,
                    },
                    select: { id: true },
                });

                if (Array.isArray(q.answers) && q.answers.length > 0) {
                    await tx.answer.createMany({
                        data: q.answers.map((a) => ({
                            questionId: newQ.id,
                            answerUa: a.answer_ua,
                            answerEn: a.answer_en,
                            isCorrect: Boolean(a.is_correct),
                        })),
                    });
                }
            }
        });

        res.json({ success: true, message: "✅ Питання оновлено успішно" });
    } catch (err) {
        console.error("❌ Помилка оновлення питань:", err);
        res.status(500).json({
            success: false,
            message: "Помилка при оновленні питань",
        });
    }
});


/* ────────────────────────────────────────────────────────────────
   📘 Отримати тест за ID — завжди останній!
   ──────────────────────────────────────────────────────────────── */
router.get("/:id", getTestById);

export default router;
