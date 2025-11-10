
import {
    getUserAchievements,
    updateUserAchievement,
    ensureUserAchievements,
    updateAchievementsBatch,
    unlockUserAchievementByCode,
} from "../models/AchievementModel.js";
import { triggerAchievementsCheck } from "../utils/achievementEngine.js";

export async function getAchievements(req, res) {
    try {
        const userId = req.user.id;
        const lang = req.query.lang === "en" ? "en" : "ua"; 

        
        await ensureUserAchievements(userId);

        
        const data = await getUserAchievements(userId, lang);

        res.json({ success: true, achievements: data });
    } catch (err) {
        console.error(" Error fetching achievements:", err.message);
        res.status(500).json({ success: false, message: "Server error" });
    }
}


export async function updateAchievement(req, res) {
    try {
        const userId = req.user.id;
        const { achievementId, progress } = req.body;

        if (!achievementId || progress === undefined) {
            return res.status(400).json({
                success: false,
                message: "Invalid input",
            });
        }

        await updateUserAchievement(userId, achievementId, progress);
        res.json({ success: true, message: "Achievement progress updated" });
    } catch (err) {
        console.error(" Error updating achievement:", err.message);
        res.status(500).json({ success: false, message: "Server error" });
    }
}


export async function updateAchievementsBatchController(req, res) {
    try {
        const userId = req.user.id;
        const { updates } = req.body; 

        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No updates provided",
            });
        }

        await updateAchievementsBatch(userId, updates);
        res.json({ success: true });
    } catch (err) {
        console.error(" updateAchievementsBatch error:", err.message);
        res.status(500).json({ success: false, message: "Server error" });
    }
}


export async function unlockAchievement(req, res) {
    try {
        const userId = req.user.id;
        const { code } = req.body;

        if (!code) return res.status(400).json({ success: false, message: "Achievement code required" });

        const unlocked = await unlockUserAchievementByCode(userId, code);
        const newlyUnlocked = await triggerAchievementsCheck(userId);

        res.json({
            success: true,
            message: "Achievement unlocked",
            achievement: unlocked,
            newAchievements: newlyUnlocked,
        });
    } catch (err) {
        console.error(" Error unlocking achievement:", err.message);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
