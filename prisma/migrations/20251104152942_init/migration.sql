-- AlterTable
ALTER TABLE "achievements" ADD COLUMN     "generated_code" TEXT,
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "trigger_text" TEXT,
ALTER COLUMN "code" DROP NOT NULL,
ALTER COLUMN "title_en" DROP NOT NULL;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "agree" BOOLEAN DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "telegram" TEXT;

-- AlterTable
ALTER TABLE "tests" ALTER COLUMN "title_en" DROP NOT NULL;

-- CreateTable
CREATE TABLE "explanations" (
    "id" SERIAL NOT NULL,
    "question_text_ua" TEXT NOT NULL,
    "question_text_en" TEXT,
    "explanation_ua" TEXT NOT NULL,
    "explanation_en" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "teacher" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL,
    "email_support" TEXT,
    "telegram" TEXT,
    "phone" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "explanations_question_text_ua_key" ON "explanations"("question_text_ua");
