-- AlterTable
ALTER TABLE "products" ADD COLUMN     "embedding" JSONB,
ADD COLUMN     "embedding_model" VARCHAR(100),
ADD COLUMN     "embedding_updated_at" TIMESTAMP(3);
