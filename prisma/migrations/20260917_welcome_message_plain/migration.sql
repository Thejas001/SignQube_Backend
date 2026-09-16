-- AlterTable
ALTER TABLE "agent_settings" ALTER COLUMN "welcome_message" SET DEFAULT 'Hi, welcome to {businessName}. What are you looking for today?';

-- Replace the previous default only where it was never customised.
UPDATE "agent_settings"
SET "welcome_message" = 'Hi, welcome to {businessName}. What are you looking for today?'
WHERE "welcome_message" = 'Hi! 👋 Welcome to {businessName}. What are you looking for today?';
