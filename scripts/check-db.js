// scripts/check-db.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const tables = [
  'users','tests','questions','answers','certificates','payments','user_tests','user_test_history',
  'achievements','user_achievements','email_verifications','reviews','contacts','test_attempts',
  'analytics_daily','events','admin_audit','donations','sms_subscriptions','payment_archive',
  'explanations','courses','settings'
];

(async () => {
  try {
    await prisma.$connect();
    for (const t of tables) {
      try {
        await prisma.$queryRawUnsafe(`SELECT 1 FROM ${t} LIMIT 1`);
        console.log(`${t}: OK`);
      } catch (e) {
        console.log(`${t}: MISSING or not accessible -> ${e.message}`);
      }
    }
  } catch (e) {
    console.error('Connection error:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();

