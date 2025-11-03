import express from "express";
import {
    createAchievement,
    deleteAchievement,
    updateAchievement,
} from "../controllers/adminAchievementController.js";
import { isAdmin } from "../middleware/adminMiddleware.js"; // тільки адмін

const router = express.Router();

// 🟢 Створити нове досягнення
router.post("/", isAdmin, createAchievement);

// 🟡 Оновити існуюче досягнення
router.put("/:id", isAdmin, updateAchievement);

// 🔴 Видалити досягнення
router.delete("/:id", isAdmin, deleteAchievement);

export default router;
