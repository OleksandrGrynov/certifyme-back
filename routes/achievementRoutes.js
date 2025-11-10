
import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    getAchievements,
    updateAchievement,
    updateAchievementsBatchController,
    unlockAchievement,
} from "../controllers/achievementController.js";

const router = express.Router();


router.get("/", authMiddleware, getAchievements);


router.post("/update", authMiddleware, updateAchievement);


router.post("/update-batch", authMiddleware, updateAchievementsBatchController);


router.post("/unlock", authMiddleware, unlockAchievement);

export default router;