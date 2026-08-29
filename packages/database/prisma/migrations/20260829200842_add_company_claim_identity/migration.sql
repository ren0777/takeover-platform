-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CompanyVerificationLevel" AS ENUM ('CONTACT_VERIFIED', 'DOMAIN_VERIFIED', 'MANUALLY_VERIFIED');

-- CreateEnum
CREATE TYPE "CompanyVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EmailChallengePurpose" AS ENUM ('CONTACT_VERIFICATION', 'MANAGEMENT_LINK', 'ACCESS_REQUEST_REVIEW', 'ACCESS_DECISION', 'RECOVERY_CONTINUATION');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ManagementGrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ManagementGrantSource" AS ENUM ('INITIAL_CONTACT', 'ACCESS_REQUEST', 'MANUAL_RECOVERY');

-- CreateEnum
CREATE TYPE "CompanyAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecoveryRequestStatus" AS ENUM ('NONE', 'PENDING', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TakeoverIntentStatus" AS ENUM ('AWAITING_EMAIL_VERIFICATION', 'AWAITING_COMPANY_ACCESS', 'IDENTITY_READY', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('CONTACT', 'MANAGEMENT_GRANT', 'MANAGEMENT_SESSION', 'SYSTEM', 'OPERATOR');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "normalized_name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140),
    "website_url" VARCHAR(2048) NOT NULL,
    "normalized_website" VARCHAR(2048) NOT NULL,
    "logo_url" VARCHAR(2048),
    "status" "CompanyStatus" NOT NULL DEFAULT 'DRAFT',
    "expires_at" TIMESTAMPTZ(3),
    "activated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_contacts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "normalized_email" VARCHAR(320) NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_verifications" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contact_id" UUID,
    "level" "CompanyVerificationLevel" NOT NULL,
    "status" "CompanyVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "source" VARCHAR(64) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "failure_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_challenges" (
    "id" UUID NOT NULL,
    "selector" VARCHAR(64) NOT NULL,
    "token_digest" BYTEA NOT NULL,
    "purpose" "EmailChallengePurpose" NOT NULL,
    "contact_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "access_request_id" UUID,
    "delivery_status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_verification_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_management_grants" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "status" "ManagementGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "ManagementGrantSource" NOT NULL,
    "access_request_id" UUID,
    "granted_by_grant_id" UUID,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "company_management_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_management_sessions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "grant_id" UUID NOT NULL,
    "token_digest" BYTEA NOT NULL,
    "csrf_digest" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_management_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_access_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "takeover_intent_id" UUID,
    "status" "CompanyAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by_grant_id" UUID,
    "decision_reason" VARCHAR(500),
    "last_notified_at" TIMESTAMPTZ(3),
    "notification_count" INTEGER NOT NULL DEFAULT 0,
    "recovery_requested_at" TIMESTAMPTZ(3),
    "recovery_expires_at" TIMESTAMPTZ(3),
    "recovery_status" "RecoveryRequestStatus" NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "company_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "takeover_intents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "territory_external_ref" VARCHAR(128) NOT NULL,
    "intended_amount_minor" BIGINT,
    "currency" CHAR(3),
    "quoted_territory_version" VARCHAR(128),
    "quoted_owner_company_id" UUID,
    "quoted_winning_amount_minor" BIGINT,
    "quoted_minimum_amount_minor" BIGINT,
    "quote_observed_at" TIMESTAMPTZ(3),
    "status" "TakeoverIntentStatus" NOT NULL DEFAULT 'AWAITING_EMAIL_VERIFICATION',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "takeover_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" UUID,
    "company_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" UUID,
    "request_id" VARCHAR(128),
    "reason" VARCHAR(500),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_rate_limit_buckets" (
    "id" UUID NOT NULL,
    "key_digest" BYTEA NOT NULL,
    "window_started_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "security_rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE INDEX "companies_normalized_website_idx" ON "companies"("normalized_website");

-- CreateIndex
CREATE INDEX "companies_status_expires_at_idx" ON "companies"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "company_contacts_normalized_email_key" ON "company_contacts"("normalized_email");

-- CreateIndex
CREATE INDEX "company_verifications_company_id_level_status_idx" ON "company_verifications"("company_id", "level", "status");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_challenges_selector_key" ON "email_verification_challenges"("selector");

-- CreateIndex
CREATE INDEX "email_verification_challenges_contact_id_purpose_created_at_idx" ON "email_verification_challenges"("contact_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "email_verification_challenges_expires_at_idx" ON "email_verification_challenges"("expires_at");

-- CreateIndex
CREATE INDEX "company_management_grants_company_id_status_idx" ON "company_management_grants"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "company_management_grants_company_id_contact_id_key" ON "company_management_grants"("company_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_management_sessions_token_digest_key" ON "company_management_sessions"("token_digest");

-- CreateIndex
CREATE INDEX "company_management_sessions_company_id_expires_at_idx" ON "company_management_sessions"("company_id", "expires_at");

-- CreateIndex
CREATE INDEX "company_management_sessions_grant_id_revoked_at_idx" ON "company_management_sessions"("grant_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "company_access_requests_takeover_intent_id_key" ON "company_access_requests"("takeover_intent_id");

-- CreateIndex
CREATE INDEX "company_access_requests_company_id_status_idx" ON "company_access_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "company_access_requests_contact_id_requested_at_idx" ON "company_access_requests"("contact_id", "requested_at");

-- CreateIndex
CREATE INDEX "company_access_requests_expires_at_idx" ON "company_access_requests"("expires_at");

-- CreateIndex
CREATE INDEX "takeover_intents_company_id_status_idx" ON "takeover_intents"("company_id", "status");

-- CreateIndex
CREATE INDEX "takeover_intents_contact_id_created_at_idx" ON "takeover_intents"("contact_id", "created_at");

-- CreateIndex
CREATE INDEX "takeover_intents_expires_at_idx" ON "takeover_intents"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "security_rate_limit_buckets_expires_at_idx" ON "security_rate_limit_buckets"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "security_rate_limit_bucket_scope_key" ON "security_rate_limit_buckets"("key_digest", "window_started_at");

-- Phase 1 invariants that Prisma cannot express directly.
CREATE UNIQUE INDEX "companies_authoritative_website_key"
ON "companies" ("normalized_website")
WHERE "status" <> 'DRAFT';

CREATE UNIQUE INDEX "company_access_requests_pending_key"
ON "company_access_requests" ("company_id", "contact_id")
WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "company_verifications_active_key"
ON "company_verifications" ("company_id", "contact_id", "level")
WHERE "status" = 'VERIFIED';

ALTER TABLE "companies"
ADD CONSTRAINT "companies_draft_expiry_check"
CHECK ("status" <> 'DRAFT' OR "expires_at" IS NOT NULL);

ALTER TABLE "email_verification_challenges"
ADD CONSTRAINT "email_challenges_expiry_check" CHECK ("expires_at" > "created_at"),
ADD CONSTRAINT "email_challenges_failed_attempts_check" CHECK ("failed_attempts" >= 0);

ALTER TABLE "company_management_sessions"
ADD CONSTRAINT "management_sessions_expiry_check" CHECK ("expires_at" > "created_at");

ALTER TABLE "company_access_requests"
ADD CONSTRAINT "access_requests_expiry_check" CHECK ("expires_at" > "requested_at"),
ADD CONSTRAINT "access_requests_notification_count_check" CHECK ("notification_count" >= 0),
ADD CONSTRAINT "access_requests_decision_check" CHECK (
  ("status" = 'PENDING' AND "decided_at" IS NULL) OR
  ("status" <> 'PENDING' AND "decided_at" IS NOT NULL)
),
ADD CONSTRAINT "access_requests_recovery_check" CHECK (
  ("recovery_status" = 'NONE' AND "recovery_requested_at" IS NULL AND "recovery_expires_at" IS NULL) OR
  ("recovery_status" <> 'NONE' AND "recovery_requested_at" IS NOT NULL AND "recovery_expires_at" > "recovery_requested_at")
);

ALTER TABLE "takeover_intents"
ADD CONSTRAINT "takeover_intents_external_ref_check" CHECK (
  "territory_external_ref" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
),
ADD CONSTRAINT "takeover_intents_expiry_check" CHECK ("expires_at" > "created_at"),
ADD CONSTRAINT "takeover_intents_amounts_check" CHECK (
  ("intended_amount_minor" IS NULL OR "intended_amount_minor" >= 0) AND
  ("quoted_winning_amount_minor" IS NULL OR "quoted_winning_amount_minor" >= 0) AND
  ("quoted_minimum_amount_minor" IS NULL OR "quoted_minimum_amount_minor" >= 0)
),
ADD CONSTRAINT "takeover_intents_currency_check" CHECK (
  ("currency" IS NULL AND "intended_amount_minor" IS NULL AND "quoted_winning_amount_minor" IS NULL AND "quoted_minimum_amount_minor" IS NULL) OR
  ("currency" ~ '^[A-Z]{3}$')
);

ALTER TABLE "security_rate_limit_buckets"
ADD CONSTRAINT "rate_limit_buckets_count_check" CHECK ("count" >= 0),
ADD CONSTRAINT "rate_limit_buckets_expiry_check" CHECK ("expires_at" > "window_started_at");

-- AddForeignKey
ALTER TABLE "company_verifications" ADD CONSTRAINT "company_verifications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_verifications" ADD CONSTRAINT "company_verifications_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "company_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_challenges" ADD CONSTRAINT "email_verification_challenges_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "company_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_challenges" ADD CONSTRAINT "email_verification_challenges_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_challenges" ADD CONSTRAINT "email_verification_challenges_access_request_id_fkey" FOREIGN KEY ("access_request_id") REFERENCES "company_access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_management_grants" ADD CONSTRAINT "company_management_grants_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_management_grants" ADD CONSTRAINT "company_management_grants_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "company_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_management_grants" ADD CONSTRAINT "company_management_grants_access_request_id_fkey" FOREIGN KEY ("access_request_id") REFERENCES "company_access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_management_grants" ADD CONSTRAINT "company_management_grants_granted_by_grant_id_fkey" FOREIGN KEY ("granted_by_grant_id") REFERENCES "company_management_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_management_sessions" ADD CONSTRAINT "company_management_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_management_sessions" ADD CONSTRAINT "company_management_sessions_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "company_management_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_access_requests" ADD CONSTRAINT "company_access_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_access_requests" ADD CONSTRAINT "company_access_requests_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "company_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_access_requests" ADD CONSTRAINT "company_access_requests_takeover_intent_id_fkey" FOREIGN KEY ("takeover_intent_id") REFERENCES "takeover_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_access_requests" ADD CONSTRAINT "company_access_requests_decided_by_grant_id_fkey" FOREIGN KEY ("decided_by_grant_id") REFERENCES "company_management_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeover_intents" ADD CONSTRAINT "takeover_intents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeover_intents" ADD CONSTRAINT "takeover_intents_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "company_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
