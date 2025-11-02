import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    getAchievements,
    updateAchievement,
    updateAchievementsBatchController,
    unlockAchievement,
} from "../controllers/achievementController.js";

const router = express.Router();

// 🔹 Отримати всі досягнення користувача
router.get("/", authMiddleware, getAchievements);

// 🔹 Оновити прогрес одного досягнення
router.post("/update", authMiddleware, updateAchievement);

// 🔹 Оновити кілька досягнень за раз
router.post("/update-batch", authMiddleware, updateAchievementsBatchController);

// 🔹 Розблокувати досягнення (наприклад, після проходження тесту)
router.post("/unlock", authMiddleware, unlockAchievement);

export default router;