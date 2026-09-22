-- Bind preparation quotes to the takeover intent they were generated for.
--
-- Nullable: quotes issued from the public territory page carry no intent and
-- remain valid. RESTRICT keeps quote history intact if an intent were ever
-- deleted; intents are never deleted in practice, only cancelled.
ALTER TABLE "takeover_quotes"
  ADD COLUMN "takeover_intent_id" UUID NULL;

ALTER TABLE "takeover_quotes"
  ADD CONSTRAINT "takeover_quotes_takeover_intent_id_fkey"
  FOREIGN KEY ("takeover_intent_id") REFERENCES "takeover_intents"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "takeover_quotes_takeover_intent_id_created_at_idx"
  ON "takeover_quotes" ("takeover_intent_id", "created_at");
