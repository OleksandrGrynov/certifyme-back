import express from "express";
import {
    createAchievement,
    updateAchievement,
    deleteAchievement,
    getAllAchievements,
} from "../controllers/adminAchievementController.js";
import { isAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

/**
 * 📘 Admin Achievement Routes
 * Дозволяють створювати, оновлювати й видаляти досягнення через адмін-панель.
 * Усі запити проходять через middleware isAdmin.
 */
// 🟢 Отримати всі досягнення
router.get("/", isAdmin, getAllAchievements);

// 🟢 Створити нове досягнення
router.post("/", isAdmin, createAchievement);

// 🟡 Оновити існуюче досягнення
router.put("/:id", isAdmin, updateAchievement);

// 🔴 Видалити досягнення
router.delete("/:id", isAdmin, deleteAchievement);

// 🔹 (опціонально, на майбутнє) Отримати всі досягнення
// router.get("/", isAdmin, getAllAchievements);

export default router;
