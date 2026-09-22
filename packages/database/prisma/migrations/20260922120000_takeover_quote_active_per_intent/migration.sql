-- One active quote per takeover intent, not per company.
--
-- Preparation is per contact, so two managers of one company may each hold a
-- live quote for the same territory without cancelling each other's. Public
-- quotes carry no intent; NULLS NOT DISTINCT keeps them unique per
-- (territory, company, version) exactly as before.
DROP INDEX IF EXISTS "uq_takeover_quote_active";

CREATE UNIQUE INDEX "uq_takeover_quote_active"
  ON "takeover_quotes" ("territory_id", "company_id", "territory_version", "takeover_intent_id")
  NULLS NOT DISTINCT
  WHERE "status" = 'ACTIVE'::"QuoteStatus";
