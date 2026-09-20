CREATE TABLE competition_seasons (
 id UUID PRIMARY KEY, number INTEGER NOT NULL UNIQUE CHECK(number > 0),
 starts_at TIMESTAMPTZ(3) NOT NULL UNIQUE, ends_at TIMESTAMPTZ(3) NOT NULL UNIQUE,
 finalized_at TIMESTAMPTZ(3), standings JSONB, scoring_version TEXT NOT NULL DEFAULT 'v1', created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 CHECK(ends_at > starts_at), CHECK ((finalized_at IS NULL) = (standings IS NULL))
);
CREATE UNIQUE INDEX one_current_competition_season ON competition_seasons ((true)) WHERE finalized_at IS NULL;
CREATE TABLE capture_activity (
 id BIGSERIAL PRIMARY KEY, ownership_id UUID NOT NULL UNIQUE,
 company_name TEXT NOT NULL, company_slug TEXT, territory_name TEXT NOT NULL,
 territory_slug TEXT NOT NULL, captured_at TIMESTAMPTZ(3) NOT NULL
);
-- Serialize allocation until commit: unlike a bare sequence, a visible high cursor
-- cannot skip an uncommitted lower event. Rolled-back allocations leave harmless gaps.
CREATE FUNCTION record_capture_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source = 'PAID_CAPTURE' THEN
  PERFORM pg_advisory_xact_lock(724260920);
  INSERT INTO capture_activity(ownership_id, company_name, company_slug, territory_name, territory_slug, captured_at)
  SELECT NEW.id, c.name, c.slug, t.name, t.slug, NEW.captured_at
  FROM companies c, territories t WHERE c.id = NEW.company_id AND t.id = NEW.territory_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_activity_insert AFTER INSERT ON territory_ownerships
 FOR EACH ROW EXECUTE FUNCTION record_capture_activity();
INSERT INTO capture_activity(ownership_id, company_name, company_slug, territory_name, territory_slug, captured_at)
SELECT o.id, c.name, c.slug, t.name, t.slug, o.captured_at FROM territory_ownerships o
JOIN companies c ON c.id=o.company_id JOIN territories t ON t.id=o.territory_id
WHERE o.source='PAID_CAPTURE' ORDER BY o.captured_at,o.id;
CREATE FUNCTION protect_frozen_season() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'Frozen competition seasons are immutable'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER frozen_season_guard BEFORE UPDATE OR DELETE ON competition_seasons
 FOR EACH ROW EXECUTE FUNCTION protect_frozen_season();
CREATE FUNCTION protect_capture_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Capture activity is append-only'; END $$;
CREATE TRIGGER capture_activity_guard BEFORE UPDATE OR DELETE ON capture_activity
 FOR EACH ROW EXECUTE FUNCTION protect_capture_activity();
