import express from "express";
import {
    createTest, getAllTests, deleteTest, updateTest,
    getTestById, generateCertificate, verifyCertificate,saveTestResult,getUserPassedTests

} from "../controllers/testController.js";
import authMiddleware, { isAdmin } from "../middleware/authMiddleware.js";
import { explainOneQuestion } from "../controllers/explanationController.js";
import { getUserCertificates } from "../controllers/testController.js";
import { pool } from "../config/db.js";

const router = express.Router();

router.get("/", getAllTests);
router.get("/user/certificates", authMiddleware, getUserCertificates);
router.get("/certificates/:cert_id", verifyCertificate);
router.get("/:id", getTestById);

router.post("/", authMiddleware, isAdmin, createTest);
router.put("/:id", authMiddleware, isAdmin, updateTest);
router.delete("/:id", authMiddleware, isAdmin, deleteTest);

router.post("/certificate", authMiddleware, generateCertificate);
router.post("/record", authMiddleware, saveTestResult);
router.get("/user/passed", authMiddleware, getUserPassedTests);
router.post("/explain-one", explainOneQuestion);
router.put("/:id/questions", authMiddleware, isAdmin, async (req, res) => {
    const {id} = req.params;
    const {questions} = req.body;

    try {
        await pool.query(
            "DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE test_id = $1)",
            [id]
        );
        await pool.query("DELETE FROM questions WHERE test_id = $1", [id]);

        for (const q of questions) {
            const qRes = await pool.query(
                `INSERT INTO questions (test_id, question_ua, question_en)
                 VALUES ($1, $2, $3) RETURNING id`,
                [id, q.question_ua, q.question_en]
            );

            const questionId = qRes.rows[0].id;

            for (const a of q.answers) {
                await pool.query(
                    `INSERT INTO answers (question_id, answer_ua, answer_en, is_correct)
                     VALUES ($1, $2, $3, $4)`,
                    [questionId, a.answer_ua, a.answer_en, a.is_correct]
                );
            }
        }

        res.json({success: true, message: "✅ Питання оновлено успішно"});
    } catch (err) {
        console.error("❌ Помилка оновлення питань:", err);
        res.status(500).json({
            success: false,
            message: "Помилка при оновленні питань",
        });
    }
});
export default router;
