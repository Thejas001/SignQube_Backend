ALTER TABLE "payments"
ADD COLUMN "gateway_order_id" VARCHAR(255),
ADD COLUMN "gateway_payment_id" VARCHAR(255),
ADD COLUMN "gateway_signature" VARCHAR(255);

CREATE INDEX "payments_gateway_order_id_idx" ON "payments"("gateway_order_id");
CREATE INDEX "payments_gateway_payment_id_idx" ON "payments"("gateway_payment_id");
