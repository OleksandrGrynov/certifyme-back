-- DropForeignKey
ALTER TABLE "public"."user_achievements" DROP CONSTRAINT "user_achievements_achievement_id_fkey";

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
