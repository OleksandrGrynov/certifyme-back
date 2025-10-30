import {
    getUserAchievements,
    updateUserAchievement,
    ensureUserAchievements,
    updateAchievementsBatch,
    unlockUserAchievementByCode,
} from "../models/AchievementModel.js";

// 🔹 Отримати всі досягнення користувача (з урахуванням мови)
export async function getAchievements(req, res) {
    try {
        const userId = req.user.id;
        const lang = req.query.lang === "en" ? "en" : "ua"; // 🟢 приймаємо параметр ?lang=en або ua

        // гарантуємо наявність усіх записів
        await ensureUserAchievements(userId);

        // передаємо мову в модель
        const data = await getUserAchievements(userId, lang);

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
            return res.status(400).json({
                success: false,
                message: "Invalid input",
            });
        }

        await updateUserAchievement(userId, achievementId, progress);
        res.json({ success: true, message: "Achievement progress updated" });
    } catch (err) {
        console.error("❌ Error updating achievement:", err.message);
        res.status(500).json({ success: false, message: "Server error" });
    }
}

// 🔹 Оновити декілька досягнень разом
export async function updateAchievementsBatchController(req, res) {
    try {
        const userId = req.user.id;
        const { updates } = req.body; // [{code, progress}, ...]

        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No updates provided",
            });
        }

        await updateAchievementsBatch(userId, updates);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ updateAchievementsBatch error:", err.message);
        res.status(500).json({ success: false, message: "Server error" });
    }
}

// 🔹 Розблокувати досягнення по коду (100%)
export async function unlockAchievement(req, res) {
    try {
        const userId = req.user.id;
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: "Achievement code required",
            });
        }

        const unlocked = await unlockUserAchievementByCode(userId, code);

        if (!unlocked) {
            return res.status(404).json({
                success: false,
                message: "Achievement not found",
            });
        }

        res.json({
            success: true,
            message: "Achievement unlocked",
            achievement: unlocked,
        });
    } catch (err) {
        console.error("❌ Error unlocking achievement:", err.message);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
}
