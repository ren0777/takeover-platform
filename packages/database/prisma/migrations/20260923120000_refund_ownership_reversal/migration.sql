-- Refund-driven ownership reversal.
--
-- A refund that undoes the capture behind the current reign now takes the
-- territory back off the refunded buyer instead of leaving it with them and
-- parking the problem in reconciliation. This migration adds the vocabulary
-- that reversal needs: a reign source for a restored predecessor, and public
-- activity rows that record removal and restoration as further history rather
-- than by editing what already happened.

-- A reign created by returning a territory to the holder before a refunded one.
ALTER TYPE "TerritoryOwnershipSource" ADD VALUE IF NOT EXISTS 'REFUND_RESTORATION';

-- What a public activity row records.
DO $$
BEGIN
  CREATE TYPE "CaptureActivityEventType" AS ENUM ('CAPTURE', 'REFUND_REMOVAL', 'REFUND_RESTORATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Added with a default so existing rows are labelled without an UPDATE, which
-- the append-only guard on this table would reject.
ALTER TABLE "capture_activity"
  ADD COLUMN IF NOT EXISTS "event_type" "CaptureActivityEventType" NOT NULL DEFAULT 'CAPTURE';

-- One row per ownership per event: a reign can be captured and later removed,
-- and both facts have to coexist.
ALTER TABLE "capture_activity" DROP CONSTRAINT IF EXISTS "capture_activity_ownership_id_key";
DROP INDEX IF EXISTS "capture_activity_ownership_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "capture_activity_ownership_id_event_type_key"
  ON "capture_activity" ("ownership_id", "event_type");

-- The insert trigger now also records a restored predecessor's reign. Removal
-- rows are written explicitly by the reversal, because ending a reign is an
-- UPDATE and this table must only ever gain rows.
CREATE OR REPLACE FUNCTION record_capture_activity() RETURNS trigger AS $$
BEGIN
  IF NEW.source IN ('PAID_CAPTURE', 'REFUND_RESTORATION') THEN
    PERFORM pg_advisory_xact_lock(724260920);
    INSERT INTO capture_activity(
      ownership_id, event_type, company_name, company_slug,
      territory_name, territory_slug, captured_at)
    SELECT
      NEW.id,
      CASE WHEN NEW.source = 'REFUND_RESTORATION'
        THEN 'REFUND_RESTORATION'::"CaptureActivityEventType"
        ELSE 'CAPTURE'::"CaptureActivityEventType" END,
      c.name, c.slug, t.name, t.slug, NEW.captured_at
    FROM companies c, territories t
    WHERE c.id = NEW.company_id AND t.id = NEW.territory_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Detects the inconsistency this phase exists to prevent: money that was given
-- back while the reign it bought is still open. Operators read this; nothing
-- writes through it.
CREATE OR REPLACE VIEW "refund_ownership_inconsistencies" AS
SELECT
  o."id"            AS ownership_id,
  o."territory_id"  AS territory_id,
  t."slug"          AS territory_slug,
  o."company_id"    AS company_id,
  o."territory_version" AS reign_version,
  c."id"            AS capture_id,
  c."status"        AS capture_status,
  p."id"            AS payment_id,
  p."status"        AS payment_status,
  p."amount_minor"  AS payment_amount_minor,
  p."currency"      AS payment_currency
FROM "territory_ownerships" o
JOIN "territories" t ON t."id" = o."territory_id"
JOIN "ownership_captures" c
  ON c."territory_id" = o."territory_id"
 AND c."new_owner_company_id" = o."company_id"
 AND c."expected_territory_version" = o."territory_version" - 1
JOIN "payments" p ON p."id" = c."payment_id"
WHERE o."ended_at" IS NULL
  AND (c."status" = 'REFUNDED' OR p."status" = 'REFUNDED');
