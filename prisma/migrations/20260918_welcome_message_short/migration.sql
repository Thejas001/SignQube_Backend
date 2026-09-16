-- AlterTable
ALTER TABLE "agent_settings" ALTER COLUMN "welcome_message" SET DEFAULT 'Hi, how can I help you?';

-- Replace the previous default only where it was never customised.
UPDATE "agent_settings"
SET "welcome_message" = 'Hi, how can I help you?'
WHERE "welcome_message" = 'Hi, welcome to {businessName}. What are you looking for today?';
