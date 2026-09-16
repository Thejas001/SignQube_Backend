-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'QUALIFIED', 'AWAITING_PAYMENT', 'ORDERED', 'HUMAN_TAKEOVER', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL', 'ADMIN');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('WEB', 'WHATSAPP');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYMENT_LINK';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "conversation_id" UUID,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'WEB';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "payment_link_id" VARCHAR(255),
ADD COLUMN     "payment_link_url" TEXT;

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "wa_phone_number" VARCHAR(20) NOT NULL,
    "wa_profile_name" VARCHAR(255),
    "user_id" UUID,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "draft_order" JSONB,
    "last_inbound_at" TIMESTAMP(3),
    "last_outbound_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "wa_message_id" VARCHAR(255),
    "tool_name" VARCHAR(100),
    "tool_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "business_name" VARCHAR(255) NOT NULL DEFAULT 'SIGNQUE',
    "tone" VARCHAR(255) NOT NULL DEFAULT 'Friendly and helpful',
    "system_prompt_extra" TEXT,
    "delivery_info" TEXT,
    "return_policy" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_wa_phone_number_key" ON "conversations"("wa_phone_number");

-- CreateIndex
CREATE INDEX "conversations_wa_phone_number_idx" ON "conversations"("wa_phone_number");

-- CreateIndex
CREATE INDEX "conversations_user_id_idx" ON "conversations"("user_id");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "messages_wa_message_id_key" ON "messages"("wa_message_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "messages_wa_message_id_idx" ON "messages"("wa_message_id");

-- CreateIndex
CREATE INDEX "orders_conversation_id_idx" ON "orders"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_link_id_key" ON "payments"("payment_link_id");

-- CreateIndex
CREATE INDEX "payments_payment_link_id_idx" ON "payments"("payment_link_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
