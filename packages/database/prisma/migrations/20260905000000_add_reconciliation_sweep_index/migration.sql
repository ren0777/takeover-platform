CREATE INDEX "payment_reconciliation_actions_action_status_created_at_idx"
  ON "payment_reconciliation_actions" ("action", "status", "created_at");
