import prisma from "../config/prisma.js";
import { updateAchievementsBatch } from "../models/AchievementModel.js";

/**
 * 🧠 Перевіряє всі умови досягнень і розблоковує ті, що користувач виконав
 * Викликається після подій: тест, сертифікат, оплата тощо
 */
export async function checkAchievements(userStats) {
    const {
        id: userId,
        testsPassed = 0,
        certificates = 0,
        payments = 0,
        score = 0,
        avgScore = 0,
        streakDays = 0,
    } = userStats;

    try {
        // 🔹 1. Отримуємо всі досягнення та вже отримані користувачем
        const [achievements, userAchievements] = await Promise.all([
            prisma.achievement.findMany(),
            prisma.userAchievement.findMany({
                where: { userId, achieved: true },
                select: { achievementId: true },
            }),
        ]);

        const alreadyUnlockedIds = new Set(
            userAchievements.map((ua) => ua.achievementId)
        );

        const unlocked = [];

        for (const a of achievements) {
            const { conditionType, conditionValue } = a;
            if (!conditionType || !conditionValue) continue;

            let achieved = false;

            switch (conditionType) {
                case "tests_passed":
                    achieved = testsPassed >= conditionValue;
                    break;
                case "certificates":
                    achieved = certificates >= conditionValue;
                    break;
                case "payments":
                    achieved = payments >= conditionValue;
                    break;
                case "score_avg":
                    achieved = avgScore >= conditionValue;
                    break;
                case "streak_days":
                    achieved = streakDays >= conditionValue;
                    break;
            }

            // 🔒 2. Якщо виконано, але ще не було отримано
            if (achieved && !alreadyUnlockedIds.has(a.id)) {
                unlocked.push({
                    achievementId: a.id,
                    code: a.code,
                    progress: 100,
                });
            }
        }

        // 🔄 3. Записуємо тільки нові досягнення
        if (unlocked.length) {
            for (const a of unlocked) {
                await prisma.userAchievement.upsert({
                    where: { userId_achievementId: { userId, achievementId: a.achievementId } },
                    create: {
                        userId,
                        achievementId: a.achievementId,
                        achieved: true,
                        achievedAt: new Date(),
                        progress: 100,
                    },
                    update: { achieved: true, achievedAt: new Date(), progress: 100 },
                });
            }
        }

        return unlocked; // тільки нові
    } catch (err) {
        console.error("❌ checkAchievements error:", err);
        return [];
    }
}


export async function triggerAchievementsCheck(userId) {
    try {
        const [testsPassed, certificates, payments, avgScoreObj] = await Promise.all([
            // ✅ тільки пройдені тести
            prisma.userTestHistory.count({ where: { userId, passed: true } }),

            prisma.certificate.count({ where: { userId } }),

            prisma.payment.count({
                where: {
                    userId,
                    status: { in: ["paid", "succeeded", "pending"] },
                },
            }),

            prisma.userTestHistory.aggregate({
                where: { userId, passed: true },
                _avg: { score: true },
            }),
        ]);

        const avgScore = Math.round(avgScoreObj._avg.score || 0);

        const userStats = {
            id: userId,
            testsPassed,
            certificates,
            payments,
            avgScore,
        };

        return await checkAchievements(userStats);
    } catch (err) {
        console.error("❌ triggerAchievementsCheck error:", err);
        return [];
    }
}

