-- Migration: add Phase 3 models and fields

-- Add columns to Territory
ALTER TABLE "Territory"
  ADD COLUMN "minimum_takeover_amount_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD CONSTRAINT "chk_territory_minimum_amount_nonnegative" CHECK ("minimum_takeover_amount_minor" >= 0);

-- Create TakeoverQuote
CREATE TABLE "TakeoverQuote" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "territory_id" UUID NOT NULL REFERENCES "Territory"("id") ON DELETE RESTRICT,
  "territory_version" BIGINT NOT NULL,
  "company_id" UUID NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "currency" VARCHAR(3) NOT NULL,
  "minimum_amount_minor" BIGINT NOT NULL CHECK ("minimum_amount_minor" > 0),
  "status" VARCHAR NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "observed_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "consumed_at" TIMESTAMPTZ,
  "idempotency_key_digest" BYTEA
);

-- Partial unique index for active quotes
CREATE UNIQUE INDEX "uq_takeover_quote_active"
ON "TakeoverQuote" ("territory_id", "company_id", "territory_version")
WHERE "status" = 'ACTIVE';


-- Create CheckoutSession
CREATE TABLE "CheckoutSession" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "quote_id" UUID NOT NULL REFERENCES "TakeoverQuote"("id") ON DELETE RESTRICT,
  "company_id" UUID NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "provider" VARCHAR(20) NOT NULL,
  "provider_checkout_id" VARCHAR NOT NULL,
  "provider_checkout_url" VARCHAR,
  "status" VARCHAR NOT NULL DEFAULT 'CREATED',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ,
  CONSTRAINT "uq_checkout_provider" UNIQUE ("provider", "provider_checkout_id")
);

-- Create CheckoutStatusToken
CREATE TABLE "CheckoutStatusToken" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "checkout_id" UUID NOT NULL REFERENCES "CheckoutSession"("id") ON DELETE CASCADE,
  "token_digest" BYTEA NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create Payment
CREATE TABLE "Payment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "checkout_id" UUID NOT NULL REFERENCES "CheckoutSession"("id") ON DELETE RESTRICT,
  "provider" VARCHAR(20) NOT NULL,
  "provider_payment_id" VARCHAR NOT NULL,
  "amount_minor" BIGINT NOT NULL CHECK ("amount_minor" >= 0),
  "currency" VARCHAR(3) NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "captured_at" TIMESTAMPTZ,
  "failed_at" TIMESTAMPTZ,
  CONSTRAINT "uq_payment_provider" UNIQUE ("provider", "provider_payment_id")
);

-- Create PaymentWebhookEvent
CREATE TABLE "PaymentWebhookEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" VARCHAR(20) NOT NULL,
  "provider_event_id" VARCHAR NOT NULL,
  "signature_digest" BYTEA NOT NULL,
  "payload" JSONB NOT NULL,
  "received_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "processing_status" VARCHAR NOT NULL DEFAULT 'PENDING',
  "payment_id" UUID REFERENCES "Payment"("id") ON DELETE SET NULL,
  "processed_at" TIMESTAMPTZ,
  "error_code" VARCHAR,
  CONSTRAINT "uq_webhook_event" UNIQUE ("provider", "provider_event_id")
);

-- Create OwnershipCapture
CREATE TABLE "OwnershipCapture" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "payment_id" UUID NOT NULL REFERENCES "Payment"("id") ON DELETE RESTRICT,
  "territory_id" UUID NOT NULL REFERENCES "Territory"("id") ON DELETE RESTRICT,
  "new_owner_company_id" UUID NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "expected_territory_version" BIGINT NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'PENDING',
  "attempted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ,
  "failure_code" VARCHAR,
  CONSTRAINT "uq_ownership_capture_payment" UNIQUE ("payment_id")
);

-- Create PaymentReconciliationAction
CREATE TABLE "PaymentReconciliationAction" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "payment_id" UUID NOT NULL REFERENCES "Payment"("id") ON DELETE RESTRICT,
  "action" VARCHAR NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'PENDING',
  "requested_by_actor_type" VARCHAR NOT NULL,
  "requested_by_actor_id" UUID,
  "reason" VARCHAR,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "provider_refund_reference" VARCHAR,
  CONSTRAINT "uq_reconciliation_action" UNIQUE ("payment_id", "action")
);


