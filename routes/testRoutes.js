import express from "express";
import {
    createTest,
    getAllTests,
    deleteTest,
    updateTest,
    getTestById
} from "../controllers/testController.js";
import authMiddleware, { adminOnly } from "../middleware/authMiddleware.js";
import { isAdmin } from "../middleware/adminMiddleware.js"; // якщо цей файл у тебе є

const router = express.Router();

// 🔒 Лише адмін може створювати / редагувати / видаляти
router.post("/", authMiddleware, adminOnly, createTest);
router.put("/:id", authMiddleware, adminOnly, updateTest);
router.delete("/:id", authMiddleware, adminOnly, deleteTest);
router.get("/:id", getTestById);
// 🌍 Усі користувачі можуть переглядати
router.get("/", getAllTests);

export default router;
