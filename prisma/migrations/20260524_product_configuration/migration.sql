ALTER TABLE "products"
ADD COLUMN "public_id" SERIAL,
ADD COLUMN "detail_images" JSONB,
ADD COLUMN "attributes" JSONB,
ADD COLUMN "pricing" JSONB,
ADD COLUMN "pricing_rules" JSONB,
ADD COLUMN "addons" JSONB,
ADD COLUMN "upload_config" JSONB;

CREATE UNIQUE INDEX "products_public_id_key" ON "products"("public_id");
