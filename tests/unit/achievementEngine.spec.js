import { jest } from '@jest/globals';

const achievementsState = [];
const unlockedByUser = new Map();

await jest.unstable_mockModule('../../config/prisma.js', () => ({
  __esModule: true,
  default: {
    achievement: {
      findMany: jest.fn(async () => achievementsState)
    },
    userAchievement: {
      findMany: jest.fn(async ({ where }) => {
        const set = unlockedByUser.get(where.userId) || new Set();
        return Array.from(set).map(achievementId => ({ achievementId, achieved: true }));
      }),
      upsert: jest.fn(async ({ where }) => {
        const uid = where.userId_achievementId.userId;
        const aid = where.userId_achievementId.achievementId;
        const set = unlockedByUser.get(uid) || new Set();
        set.add(aid);
        unlockedByUser.set(uid, set);
        return {};
      }),
      findFirst: jest.fn(async ({ where }) => achievementsState.find(a => a.id === where.achievementId) ? { achieved: false } : null),
      create: jest.fn(async ({ data }) => ({ ...data })),
      update: jest.fn(async ({ data }) => ({ ...data }))
    }
  }
}));

// Mock initial achievements
achievementsState.push({ id:1, code:'tests_1', conditionType:'tests_passed', conditionValue:1 });
achievementsState.push({ id:2, code:'certs_1', conditionType:'certificates', conditionValue:1 });

const { checkAchievements } = await import('../../utils/achievementEngine.js');

describe('achievementEngine checkAchievements', () => {
  test('awards tests_passed achievement', async () => {
    const newAchievements = await checkAchievements({ id: 10, testsPassed: 1, certificates: 0, score: 80 });
    expect(newAchievements.some(a => a.code === 'tests_1')).toBe(true);
  });
  test('awards certificates achievement', async () => {
    const newAchievements = await checkAchievements({ id: 11, testsPassed: 0, certificates: 1, score: 90 });
    expect(newAchievements.some(a => a.code === 'certs_1')).toBe(true);
  });
  test('does not duplicate achievements', async () => {
    await checkAchievements({ id: 12, testsPassed: 1, certificates: 1, score: 70 });
    const again = await checkAchievements({ id: 12, testsPassed: 1, certificates: 1, score: 70 });
    expect(again.length).toBe(0);
  });
});
