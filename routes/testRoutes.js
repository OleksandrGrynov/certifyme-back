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

router.get("/", getAllTests);
router.get("/certificates/:cert_id", verifyCertificate);




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
        console.error(" Error checking certificate:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});


router.post("/certificate", authMiddleware, generateCertificate);


router.get("/user/certificates", authMiddleware, getUserCertificates);
router.get("/user/passed", authMiddleware, getUserPassedTests);
router.post("/record", authMiddleware, saveTestResult);
router.post("/explain-one", explainOneQuestion);


router.post("/", authMiddleware, isAdmin, createTest);
router.put("/:id", authMiddleware, isAdmin, updateTest);
router.delete("/:id", authMiddleware, isAdmin, deleteTest);


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

        res.json({ success: true, message: " Питання оновлено успішно" });
    } catch (err) {
        console.error(" Помилка оновлення питань:", err);
        res.status(500).json({
            success: false,
            message: "Помилка при оновленні питань",
        });
    }
});

router.get("/public/:id", async (req, res) => {
    try {
        const testId = Number(req.params.id);

        const test = await prisma.test.findUnique({
            where: { id: testId },
            include: {
                questions: {
                    take: 3, 
                    include: {
                        answers: {
                            take: 3,
                        },
                    },
                },
            },
        });

        if (!test) {
            return res.status(404).json({ success: false, message: "Test not found" });
        }

        
        const formattedQuestions = test.questions.map((q) => ({
            id: q.id,
            question_ua: q.questionUa,
            question_en: q.questionEn,
            answers: q.answers.map((a) => ({
                id: a.id,
                answer_ua: a.answerUa,
                answer_en: a.answerEn,
                is_correct: a.isCorrect,
            })),
        }));

        const formattedTest = {
            id: test.id,
            title_ua: test.titleUa,
            title_en: test.titleEn,
            description_ua: test.descriptionUa,
            description_en: test.descriptionEn,
            price: test.price,
            image_url: test.imageUrl,
            questions: formattedQuestions,
        };

        res.json({ success: true, test: formattedTest });
    } catch (err) {
        console.error(" getPublicTest error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});


router.get("/admin/:id", authMiddleware, isAdmin, getTestById);

router.get("/:id", authMiddleware, async (req, res) => {
    try {
        const testId = Number(req.params.id);
        const userId = req.user.id;

        const test = await prisma.test.findUnique({
            where: { id: testId },
            include: {
                questions: {
                    include: {
                        answers: true,
                    },
                },
            },
        });

        if (!test) {
            return res.status(404).json({ success: false, message: "Test not found" });
        }

        
        if (!test.priceCents || test.priceCents === 0) {
            const formattedQuestions = test.questions.map((q) => ({
                id: q.id,
                question_ua: q.questionUa,
                question_en: q.questionEn,
                answers: q.answers.map((a) => ({
                    id: a.id,
                    answer_ua: a.answerUa,
                    answer_en: a.answerEn,
                    is_correct: a.isCorrect,
                })),
            }));

            return res.json({
                success: true,
                test: {
                    ...test,
                    title_ua: test.titleUa,
                    title_en: test.titleEn,
                    description_ua: test.descriptionUa,
                    description_en: test.descriptionEn,
                    questions: formattedQuestions,
                },
            });
        }

        
        const manualAccess = await prisma.userTest.findFirst({
            where: { userId, testId, isUnlocked: true },
        });

        
        const payment = await prisma.payment.findFirst({
            where: {
                userId,
                testId,
                status: { in: ["paid", "succeeded", "success", "completed"] },
            },
        });

        
        if (!payment && !manualAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Test not purchased.",
            });
        }

        
        const formattedQuestions = test.questions.map((q) => ({
            id: q.id,
            question_ua: q.questionUa,
            question_en: q.questionEn,
            answers: q.answers.map((a) => ({
                id: a.id,
                answer_ua: a.answerUa,
                answer_en: a.answerEn,
                is_correct: a.isCorrect,
            })),
        }));

        res.json({
            success: true,
            test: {
                ...test,
                title_ua: test.titleUa,
                title_en: test.titleEn,
                description_ua: test.descriptionUa,
                description_en: test.descriptionEn,
                questions: formattedQuestions,
            },
        });
    } catch (err) {
        console.error(" getTestById error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});





export default router;
