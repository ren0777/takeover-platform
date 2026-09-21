-- One active takeover preparation per (company, contact).
--
-- A contact who claims again supersedes their earlier preparation, so any
-- older IDENTITY_READY intents for the same company and contact are cancelled
-- before the invariant is enforced. This is a status change only; no row is
-- deleted and no other status is touched.
UPDATE "takeover_intents" AS stale
SET "status" = 'CANCELLED', "updated_at" = now()
WHERE stale."status" = 'IDENTITY_READY'
  AND EXISTS (
    SELECT 1 FROM "takeover_intents" AS newer
    WHERE newer."company_id" = stale."company_id"
      AND newer."contact_id" = stale."contact_id"
      AND newer."status" = 'IDENTITY_READY'
      AND (newer."created_at", newer."id") > (stale."created_at", stale."id")
  );

CREATE UNIQUE INDEX "takeover_intents_one_ready_per_contact_company_idx"
  ON "takeover_intents" ("company_id", "contact_id")
  WHERE "status" = 'IDENTITY_READY';
