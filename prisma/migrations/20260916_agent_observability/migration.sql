-- AlterTable
ALTER TABLE "agent_settings" ADD COLUMN     "welcome_message" TEXT DEFAULT 'Hi! 👋 Welcome to {businessName}. What are you looking for today?';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "model_calls" INTEGER,
ADD COLUMN     "tool_calls" INTEGER;

-- CreateTable
CREATE TABLE "agent_model_calls" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID,
    "round" INTEGER NOT NULL,
    "stage" "ConversationStatus" NOT NULL,
    "request_type" VARCHAR(40) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "cached_tokens" INTEGER,
    "latency_ms" INTEGER NOT NULL,
    "message_count" INTEGER NOT NULL,
    "est_system_tokens" INTEGER NOT NULL,
    "est_context_tokens" INTEGER NOT NULL,
    "est_history_tokens" INTEGER NOT NULL,
    "est_tool_tokens" INTEGER NOT NULL,
    "tool_calls" INTEGER NOT NULL,
    "tool_names" TEXT[],
    "finish_reason" VARCHAR(40),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_model_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_model_calls_created_at_idx" ON "agent_model_calls"("created_at");

-- CreateIndex
CREATE INDEX "agent_model_calls_conversation_id_idx" ON "agent_model_calls"("conversation_id");

-- CreateIndex
CREATE INDEX "agent_model_calls_message_id_idx" ON "agent_model_calls"("message_id");

-- AddForeignKey
ALTER TABLE "agent_model_calls" ADD CONSTRAINT "agent_model_calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
