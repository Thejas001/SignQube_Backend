-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "agent_context" JSONB,
ADD COLUMN     "handoff_at" TIMESTAMP(3),
ADD COLUMN     "handoff_reason" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "media_id" VARCHAR(255),
ADD COLUMN     "media_url" TEXT;
