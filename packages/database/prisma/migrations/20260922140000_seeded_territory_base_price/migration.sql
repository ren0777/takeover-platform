-- MVP base price for the reviewed seeded territories: $10.00 USD.
--
-- Only rows still at zero are touched, so a price an operator configured, or
-- one a capture already raised, is never overwritten. The seeded ids are the
-- deterministic range the reviewed seed owns; territories created by anyone
-- else keep whatever they have. Re-running is a no-op.
UPDATE "territories"
SET "minimum_takeover_amount_minor" = 1000,
    "currency" = 'USD',
    "updated_at" = now()
WHERE "minimum_takeover_amount_minor" = 0
  AND "id" >= '21000000-0000-4000-8000-000000000001'::uuid
  AND "id" <= '21000000-0000-4000-8000-000000000027'::uuid;
