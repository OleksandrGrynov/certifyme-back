import express from "express";
import { getAchievements, updateAchievement } from "../controllers/achievementController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { updateAchievementsBatchController } from "../controllers/achievementController.js";
const router = express.Router();

router.get("/", authMiddleware, getAchievements);
router.post("/update", authMiddleware, updateAchievement);
router.post("/update-batch", authMiddleware, updateAchievementsBatchController);
export default router;
