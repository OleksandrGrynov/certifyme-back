import express from "express";
import {
    createTest,
    getAllTests,
    deleteTest,
    updateTest,
    getTestById,
    generateCertificate, // 🆕 нова функція
} from "../controllers/testController.js";
import authMiddleware, { adminOnly } from "../middleware/authMiddleware.js";
import { isAdmin } from "../middleware/adminMiddleware.js"; // якщо у тебе є цей файл

const router = express.Router();

// 🌍 Усі користувачі можуть переглядати тести
router.get("/", getAllTests);
router.get("/:id", getTestById);

// 🔒 Адмін може створювати / редагувати / видаляти
router.post("/", authMiddleware, adminOnly, createTest);
router.put("/:id", authMiddleware, adminOnly, updateTest);
router.delete("/:id", authMiddleware, adminOnly, deleteTest);

// 🪪 Згенерувати сертифікат (лише авторизовані користувачі)
router.post("/certificate", authMiddleware, generateCertificate);

export default router;
