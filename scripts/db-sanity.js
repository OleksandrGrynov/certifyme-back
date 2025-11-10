
import { prisma } from '../config/prisma.js';

async function main() {
  const results = {};
  try {
    
    results.users = await prisma.user.count();
    results.tests = await prisma.test.count();
    results.questions = await prisma.question.count();
    results.answers = await prisma.answer.count();
    results.achievements = await prisma.achievement.count();
    results.user_achievements = await prisma.userAchievement.count();

    
    results.analytics_daily = await prisma.analyticsDaily.count();
    results.events = await prisma.event.count();
    results.admin_audit = await prisma.adminAudit.count();

    
    const cert = await prisma.certificate.findFirst({ select: { id: true, userId: true } });
    results.certificate_userId_column = cert ? typeof cert.userId !== 'undefined' : true;

    console.log(' DB sanity OK:', JSON.stringify(results, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(' DB sanity failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

