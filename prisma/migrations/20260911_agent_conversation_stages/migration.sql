-- AlterEnum
BEGIN;
CREATE TYPE "ConversationStatus_new" AS ENUM ('DISCOVERY', 'PRODUCT_RECOMMENDATION', 'PRODUCT_SELECTED', 'CUSTOMIZATION', 'PHOTO_REQUIRED', 'ADDRESS_REQUIRED', 'ORDER_READY', 'PAYMENT_PENDING', 'PAID', 'COMPLETED', 'HUMAN_HANDOFF');
ALTER TABLE "public"."conversations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "conversations" ALTER COLUMN "status" TYPE "ConversationStatus_new" USING ("status"::text::"ConversationStatus_new");
ALTER TYPE "ConversationStatus" RENAME TO "ConversationStatus_old";
ALTER TYPE "ConversationStatus_new" RENAME TO "ConversationStatus";
DROP TYPE "public"."ConversationStatus_old";
ALTER TABLE "conversations" ALTER COLUMN "status" SET DEFAULT 'DISCOVERY';
COMMIT;

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "status" SET DEFAULT 'DISCOVERY';
