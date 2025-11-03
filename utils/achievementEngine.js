import { pool } from "../config/db.js";

/**
 * Перевіряє всі досягнення користувача та повертає нові розблоковані
 * @param {Object} user - користувач (id, testsPassed, certificates, score, тощо)
 * @returns {Array} список нових досягнень [{ id, title_ua, title_en, category }]
 */
export async function checkAchievements(user) {
    try {
        console.log("⚙️ checkAchievements() started for user:", user.id);

        // --- 1. Збір статистики ---
        const [testsPassedRes, certsRes, donationsRes, nightRes] = await Promise.all([
            pool.query(`SELECT COUNT(*) FROM user_test_history WHERE user_id=$1 AND passed=true`, [user.id]),
            pool.query(`SELECT COUNT(*) FROM certificates WHERE user_id=$1`, [user.id]),
            pool.query(`SELECT COUNT(*) FROM donations WHERE user_id=$1`).catch(() => ({ rows: [{ count: 0 }] })),
            pool.query(`
                SELECT COUNT(*)
                FROM user_test_history
                WHERE user_id=$1
                  AND EXTRACT(HOUR FROM created_at) BETWEEN 0 AND 5
            `, [user.id]),
        ]);

        const testsPassed = parseInt(testsPassedRes.rows[0].count);
        const certificates = parseInt(certsRes.rows[0].count);
        const donations = parseInt(donationsRes.rows[0].count);
        const nightTests = parseInt(nightRes.rows[0].count);

        // --- 2. Отримати всі досягнення ---
        const { rows: achievements } = await pool.query(`SELECT * FROM achievements WHERE condition_type IS NOT NULL`);

        for (const a of achievements) {
            let progress = 0;
            let achieved = false;

            switch (a.condition_type) {
                case "tests_completed":
                    progress = Math.min((testsPassed / a.condition_value) * 100, 100);
                    achieved = testsPassed >= a.condition_value;
                    break;
                case "certificates_earned":
                    progress = Math.min((certificates / a.condition_value) * 100, 100);
                    achieved = certificates >= a.condition_value;
                    break;
                case "donations":
                    progress = Math.min((donations / a.condition_value) * 100, 100);
                    achieved = donations >= a.condition_value;
                    break;
                case "night_tests":
                    progress = Math.min((nightTests / a.condition_value) * 100, 100);
                    achieved = nightTests >= a.condition_value;
                    break;
                case "perfect_score":
                    const scoreRes = await pool.query(
                        `SELECT COUNT(*) FROM user_test_history WHERE user_id=$1 AND (score * 100 / total) >= 100`,
                        [user.id]
                    );
                    achieved = parseInt(scoreRes.rows[0].count) > 0;
                    progress = achieved ? 100 : 0;
                    break;
                case "language_master":
                    achieved = false;
                    progress = 0;
                    break;

                case "holiday":
                    achieved = true;
                    progress = 100;
                    break;
                default:
                    console.log("⚠️ Unknown condition:", a.condition_type);
            }

            // --- 3. Вставка або оновлення ---
            const exists = await pool.query(
                `SELECT * FROM user_achievements WHERE user_id=$1 AND achievement_id=$2`,
                [user.id, a.id]
            );

            if (exists.rows.length === 0) {
                await pool.query(
                    `INSERT INTO user_achievements (user_id, achievement_id, progress, achieved, achieved_at, shown)
           VALUES ($1,$2,$3,$4,CASE WHEN $4=true THEN NOW() ELSE NULL END,false)`,
                    [user.id, a.id, progress, achieved]
                );
            } else {
                await pool.query(
                    `UPDATE user_achievements
             SET progress=$3, achieved=$4,
                 achieved_at=CASE WHEN $4=true THEN NOW() ELSE achieved_at END
           WHERE user_id=$1 AND achievement_id=$2`,
                    [user.id, a.id, progress, achieved]
                );
            }
        }

        // --- 4. Знайти нові досягнення, які тільки-но досягнуті але ще не показані ---
        const { rows: newAchievements } = await pool.query(`
      SELECT a.id, a.title_ua, a.title_en
      FROM user_achievements ua
      JOIN achievements a ON ua.achievement_id = a.id
      WHERE ua.user_id = $1 AND ua.achieved = true AND ua.shown = false
    `, [user.id]);

        if (newAchievements.length > 0) {
            // 🔹 позначаємо як "показані"
            await pool.query(
                `UPDATE user_achievements SET shown = true
         WHERE user_id = $1 AND achievement_id = ANY($2::int[])`,
                [user.id, newAchievements.map(a => a.id)]
            );
            console.log(`🏆 Нові досягнення для користувача ${user.id}:`, newAchievements.map(a => a.title_ua));
        }

        return newAchievements; // повертаємо список нових
    } catch (err) {
        console.error("❌ checkAchievements error:", err);
        return [];
    }
}

