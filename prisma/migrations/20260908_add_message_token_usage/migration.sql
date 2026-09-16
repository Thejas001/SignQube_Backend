-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "completion_tokens" INTEGER,
ADD COLUMN     "duration_ms" INTEGER,
ADD COLUMN     "prompt_tokens" INTEGER,
ADD COLUMN     "total_tokens" INTEGER;
