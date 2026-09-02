-- Forward migration to reconcile Phase 3 schema changes

-- Create ENUM types
CREATE TYPE "QuoteStatus" AS ENUM ('ACTIVE','EXPIRED','CANCELLED');
CREATE TYPE "CheckoutStatus" AS ENUM ('CREATED','PENDING','COMPLETED','FAILED','CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','CONFIRMED','FAILED','REFUNDED','RECONCILED');
CREATE TYPE "OwnershipCaptureStatus" AS ENUM ('PENDING','COMPLETED','FAILED','REFUNDED');

-- Rename tables to snake_case
ALTER TABLE "Territory" RENAME TO "territories";
ALTER TABLE "TakeoverQuote" RENAME TO "takeover_quotes";
ALTER TABLE "CheckoutSession" RENAME TO "checkout_sessions";
ALTER TABLE "CheckoutStatusToken" RENAME TO "checkout_status_tokens";
ALTER TABLE "Payment" RENAME TO "payments";
ALTER TABLE "PaymentWebhookEvent" RENAME TO "payment_webhook_events";
ALTER TABLE "OwnershipCapture" RENAME TO "ownership_captures";
ALTER TABLE "PaymentReconciliationAction" RENAME TO "payment_reconciliation_actions";

-- Update status columns to use ENUM types
ALTER TABLE "takeover_quotes" ALTER COLUMN "status" TYPE "QuoteStatus" USING "status"::"QuoteStatus";
ALTER TABLE "checkout_sessions" ALTER COLUMN "status" TYPE "CheckoutStatus" USING "status"::"CheckoutStatus";
ALTER TABLE "payments" ALTER COLUMN "status" TYPE "PaymentStatus" USING "status"::"PaymentStatus";
ALTER TABLE "ownership_captures" ALTER COLUMN "status" TYPE "OwnershipCaptureStatus" USING "status"::"OwnershipCaptureStatus";

-- Ensure webhook payload is NOT NULL
ALTER TABLE "payment_webhook_events" ALTER COLUMN "payload" SET NOT NULL;
