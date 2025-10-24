import {
    getUserAchievements,
    updateUserAchievement,
    ensureUserAchievements, // 🆕 нова функція
} from "../models/AchievementModel.js";
import { updateAchievementsBatch } from "../models/AchievementModel.js";

// 🔹 Отримати всі досягнення користувача
export async function getAchievements(req, res) {
    try {
        const userId = req.user.id;

        // 🧩 гарантуємо, що користувач має записи user_achievements
        await ensureUserAchievements(userId);

        const data = await getUserAchievements(userId);
        res.json({ success: true, achievements: data });
    } catch (err) {
        console.error("❌ Error fetching achievements:", err.message);
        res.status(500).json({ success: false, message: "Server error" });
    }
}

// 🔹 Оновити прогрес певного досягнення
export async function updateAchievement(req, res) {
    try {
        const userId = req.user.id;
        const { achievementId, progress } = req.body;

        if (!achievementId || progress === undefined) {
            return res.status(400).json({ success: false, message: "Invalid input" });
        }

        await updateUserAchievement(userId, achievementId, progress);
        res.json({ success: true, message: "Achievement progress updated" });
    } catch (err) {
        console.error("❌ Error updating achievement:", err.message);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
export async function updateAchievementsBatchController(req, res) {
    try {
        const userId = req.user.id;
        const { updates } = req.body; // [{code, progress}, ...]
        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ success: false, message: "No updates provided" });
        }
        await updateAchievementsBatch(userId, updates);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ updateAchievementsBatch error:", err.message);
        res.status(500).json({ success: false, message: "Server error" });
    }
}