import prisma from "../config/prisma.js";

/* ======================================================
   🔹 Отримати всі досягнення користувача з урахуванням мови
   ====================================================== */
export async function getUserAchievements(userId, lang = "ua") {
    const rows = await prisma.userAchievement.findMany({
        where: { userId },
        include: { achievement: true },
        orderBy: [
            { achievement: { category: "asc" } },
            { achievementId: "asc" },
        ],
    });

    return rows.map((r) => ({
        id: r.achievementId,
        title_ua: r.achievement.titleUa,
        title_en: r.achievement.titleEn,
        description_ua: r.achievement.descriptionUa,
        description_en: r.achievement.descriptionEn,
        category: r.achievement.category,
        icon: r.achievement.icon,
        progress: r.progress,
        achieved: r.achieved,
        achieved_at: r.achievedAt,
        title: lang === "en" ? r.achievement.titleEn : r.achievement.titleUa,
        description:
            lang === "en"
                ? r.achievement.descriptionEn
                : r.achievement.descriptionUa,
    }));
}

/* ======================================================
   🔹 Оновити прогрес (еквівалент SQL UPDATE)
   ====================================================== */
export async function updateUserAchievement(userId, achievementId, newProgress) {
    const progress = Math.min(newProgress, 100);
    const achieved = progress >= 100;

    return prisma.userAchievement.update({
        where: { userId_achievementId: { userId, achievementId } },
        data: {
            progress,
            achieved,
            achievedAt: achieved ? new Date() : undefined,
        },
    });
}

/* ======================================================
   🔹 Ініціалізувати досягнення для користувача
   ====================================================== */
export async function initUserAchievements(userId) {
    const achievements = await prisma.achievement.findMany({ select: { id: true } });

    await prisma.$transaction(
        achievements.map((a) =>
            prisma.userAchievement.upsert({
                where: { userId_achievementId: { userId, achievementId: a.id } },
                create: { userId, achievementId: a.id },
                update: {},
            })
        )
    );
}

/* ======================================================
   🔹 Гарантовано створити досягнення, якщо їх нема
   ====================================================== */
export async function ensureUserAchievements(userId) {
    const allAchievements = await prisma.achievement.findMany({ select: { id: true } });
    const userAchievements = await prisma.userAchievement.findMany({
        where: { userId },
        select: { achievementId: true },
    });

    const existingIds = new Set(userAchievements.map((u) => u.achievementId));
    const missing = allAchievements.filter((a) => !existingIds.has(a.id));

    if (missing.length > 0) {
        console.log(`🧩 Adding ${missing.length} missing achievements for user ${userId}`);
        await prisma.userAchievement.createMany({
            data: missing.map((a) => ({
                userId,
                achievementId: a.id,
            })),
            skipDuplicates: true,
        });
    }
}


/* ======================================================
   🔹 Розблокувати або оновити досягнення за code
   ====================================================== */
export async function setAchievementByCode(userId, code, progress) {
    const achievement = await prisma.achievement.findUnique({ where: { code } });
    if (!achievement) throw new Error(`Unknown achievement code: ${code}`);

    const newProgress = Math.min(progress, 100);
    const achieved = newProgress >= 100;

    // Еквівалент INSERT ... ON CONFLICT DO UPDATE
    await prisma.userAchievement.upsert({
        where: {
            userId_achievementId: { userId, achievementId: achievement.id },
        },
        create: {
            userId,
            achievementId: achievement.id,
            progress: newProgress,
            achieved,
            achievedAt: achieved ? new Date() : null,
        },
        update: {
            progress: { set: newProgress },
            achieved: { set: achieved },
            achievedAt: achieved ? new Date() : undefined,
        },
    });
}

/* ======================================================
   🔹 Оновити кілька досягнень разом
   ====================================================== */
export async function updateAchievementsBatch(userId, updates = []) {
    for (const u of updates) {
        await setAchievementByCode(userId, u.code, u.progress ?? 0);
    }
    return true;
}

/* ======================================================
   🔹 Розблокувати досягнення по коду (100% одразу)
   ====================================================== */
export async function unlockUserAchievementByCode(userId, code) {
    const achievement = await prisma.achievement.findUnique({ where: { code } });
    if (!achievement) return null;

    await prisma.userAchievement.upsert({
        where: { userId_achievementId: { userId, achievementId: achievement.id } },
        create: {
            userId,
            achievementId: achievement.id,
            progress: 100,
            achieved: true,
            achievedAt: new Date(),
        },
        update: {
            progress: 100,
            achieved: true,
            achievedAt: new Date(),
        },
    });

    return achievement;
}

/* ======================================================
   🔹 Забезпечити наявність базового каталогу досягнень
   ====================================================== */
async function ensureAchievementCatalog() {
    const existing = await prisma.achievement.count();
    if (existing > 0) return;

    const defaults = [
        { code: "tests_1", titleUa: "Перший тест", titleEn: "First Test", category: "progress" },
        { code: "certs_1", titleUa: "Перший сертифікат", titleEn: "First Certificate", category: "progress" },
        { code: "night_owl", titleUa: "Нічна сова", titleEn: "Night Owl", category: "fun" },
    ];

    await prisma.$transaction(
        defaults.map((a) =>
            prisma.achievement.upsert({
                where: { code: a.code },
                update: {},
                create: a,
            })
        )
    );
}
