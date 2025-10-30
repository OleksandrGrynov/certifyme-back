import { pool } from "../config/db.js";

// 🔹 Отримати всі досягнення користувача з урахуванням мови
export async function getUserAchievements(userId, lang = "ua") {
    const isEnglish = lang === "en";

    const result = await pool.query(
        `
        SELECT 
            a.id,
            a.title_ua,
            a.title_en,
            a.description_ua,
            a.description_en,
            a.category,
            a.icon,
            ua.progress,
            ua.achieved,
            ua.achieved_at,
            -- 🧩 додаємо локалізовані поля
            CASE WHEN $2 = 'en' THEN a.title_en ELSE a.title_ua END AS title,
            CASE WHEN $2 = 'en' THEN a.description_en ELSE a.description_ua END AS description
        FROM user_achievements ua
                 JOIN achievements a ON a.id = ua.achievement_id
        WHERE ua.user_id = $1
        ORDER BY a.category, a.id;
        `,
        [userId, lang]
    );

    return result.rows;
}

// 🔹 Оновити прогрес
export async function updateUserAchievement(userId, achievementId, newProgress) {
    const progress = Math.min(newProgress, 100);
    const achieved = progress >= 100;

    await pool.query(
        `
            UPDATE user_achievements
            SET progress = $1,
                achieved = $2,
                achieved_at = CASE WHEN $2 THEN NOW() ELSE achieved_at END
            WHERE user_id = $3 AND achievement_id = $4
        `,
        [progress, achieved, userId, achievementId]
    );
}

// 🔹 Ініціалізувати досягнення для користувача
export async function initUserAchievements(userId) {
    await pool.query(
        `
            INSERT INTO user_achievements (user_id, achievement_id)
            SELECT $1, id FROM achievements
                ON CONFLICT DO NOTHING
        `,
        [userId]
    );
}

// 🔹 Гарантовано створити досягнення, якщо їх нема (навіть у адміна)
export async function ensureUserAchievements(userId) {
    const existing = await pool.query(
        `SELECT COUNT(*) FROM user_achievements WHERE user_id = $1`,
        [userId]
    );

    if (Number(existing.rows[0].count) === 0) {
        console.log(`🧩 Initializing achievements for user ${userId}`);
        await initUserAchievements(userId);
    }
}

// 🔹 Розблокувати або оновити досягнення за code
export async function setAchievementByCode(userId, code, progress) {
    const achieved = Math.min(progress, 100) >= 100;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const a = await client.query(
            `SELECT id FROM achievements WHERE code = $1 LIMIT 1`,
            [code]
        );
        if (a.rows.length === 0) throw new Error(`Unknown achievement code: ${code}`);
        const achievementId = a.rows[0].id;

        await client.query(
            `
                INSERT INTO user_achievements (user_id, achievement_id, progress, achieved, achieved_at)
                VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END)
                    ON CONFLICT (user_id, achievement_id)
            DO UPDATE SET
                    progress = GREATEST(user_achievements.progress, EXCLUDED.progress),
                                       achieved = user_achievements.achieved OR EXCLUDED.achieved,
                                       achieved_at = CASE
                                       WHEN (user_achievements.achieved = FALSE AND EXCLUDED.achieved = TRUE)
                                       THEN NOW()
                                       ELSE user_achievements.achieved_at
                END;
            `,
            [userId, achievementId, Math.min(progress, 100), achieved]
        );

        await client.query("COMMIT");
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }
}

// 🔹 Оновити кілька досягнень разом
export async function updateAchievementsBatch(userId, updates = []) {
    for (const u of updates) {
        await setAchievementByCode(userId, u.code, u.progress ?? 0);
    }
    return true;
}

// 🔹 Розблокувати досягнення по коду (100% одразу)
export async function unlockUserAchievementByCode(userId, code) {
    const res = await pool.query(
        `SELECT id, title_ua, title_en FROM achievements WHERE code = $1 LIMIT 1`,
        [code]
    );
    if (res.rowCount === 0) return null;
    const achievement = res.rows[0];

    await pool.query(
        `
            INSERT INTO user_achievements (user_id, achievement_id, progress, achieved, achieved_at)
            VALUES ($1, $2, 100, TRUE, NOW())
                ON CONFLICT (user_id, achievement_id)
        DO UPDATE SET progress = 100, achieved = TRUE, achieved_at = NOW()
        `,
        [userId, achievement.id]
    );

    return achievement;
}
