-- CreateEnum
CREATE TYPE "TerritoryAvailabilityStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TerritoryOwnershipSource" AS ENUM ('INITIAL_SEED', 'PAID_CAPTURE');

-- Required by the territory ownership timeline exclusion constraint below.
-- A provider that cannot support this extension cannot safely run this migration.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- AlterTable
ALTER TABLE "takeover_intents" ADD COLUMN "territory_id" UUID;

-- CreateTable
CREATE TABLE "territory_categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "territory_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "category_id" UUID NOT NULL,
    "display_weight" INTEGER NOT NULL,
    "availability_status" "TerritoryAvailabilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "visual_metadata" JSONB NOT NULL DEFAULT '{}',
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "territories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territory_ownerships" (
    "id" UUID NOT NULL,
    "territory_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "source" "TerritoryOwnershipSource" NOT NULL,
    "reason" VARCHAR(500),
    "territory_version" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "territory_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "territory_categories_slug_key" ON "territory_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "territories_slug_key" ON "territories"("slug");

-- CreateIndex
CREATE INDEX "territories_category_id_display_weight_name_id_idx" ON "territories"("category_id", "display_weight", "name", "id");

-- CreateIndex
CREATE INDEX "territory_ownerships_company_id_ended_at_idx" ON "territory_ownerships"("company_id", "ended_at");

-- CreateIndex
CREATE INDEX "territory_ownerships_territory_id_captured_at_idx" ON "territory_ownerships"("territory_id", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "territory_ownerships_territory_id_territory_version_key" ON "territory_ownerships"("territory_id", "territory_version");

-- CreateIndex
CREATE INDEX "takeover_intents_territory_id_idx" ON "takeover_intents"("territory_id");

-- Reviewed PostgreSQL invariants Prisma cannot express.
CREATE UNIQUE INDEX "territory_ownerships_one_active_per_territory"
  ON "territory_ownerships" ("territory_id") WHERE "ended_at" IS NULL;

ALTER TABLE "territory_categories"
  ADD CONSTRAINT "territory_categories_slug_check"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "territory_categories_display_order_check"
  CHECK ("display_order" >= 0);

ALTER TABLE "territories"
  ADD CONSTRAINT "territories_slug_check"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "territories_display_weight_check"
  CHECK ("display_weight" BETWEEN 1 AND 100),
  ADD CONSTRAINT "territories_version_check"
  CHECK ("version" > 0),
  ADD CONSTRAINT "territories_visual_metadata_object_check"
  CHECK (jsonb_typeof("visual_metadata") = 'object');

ALTER TABLE "territory_ownerships"
  ADD CONSTRAINT "territory_ownerships_reign_check"
  CHECK ("ended_at" IS NULL OR "ended_at" > "captured_at"),
  ADD CONSTRAINT "territory_ownerships_version_check"
  CHECK ("territory_version" > 0),
  ADD CONSTRAINT "territory_ownerships_no_overlap"
  EXCLUDE USING gist (
    "territory_id" WITH =,
    tstzrange("captured_at", "ended_at", '[)') WITH &&
  );

CREATE FUNCTION "protect_territory_ownership_history"() RETURNS trigger AS $$
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."territory_id" <> OLD."territory_id"
    OR NEW."company_id" <> OLD."company_id"
    OR NEW."captured_at" <> OLD."captured_at"
    OR NEW."source" <> OLD."source"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."territory_version" <> OLD."territory_version"
    OR NEW."created_at" <> OLD."created_at" THEN
    RAISE EXCEPTION 'territory ownership history is immutable';
  END IF;
  IF OLD."ended_at" IS NOT NULL
    OR NEW."ended_at" IS NULL
    OR NEW."ended_at" <= OLD."captured_at" THEN
    RAISE EXCEPTION 'invalid territory ownership end transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "territory_ownership_history_immutable"
BEFORE UPDATE ON "territory_ownerships"
FOR EACH ROW EXECUTE FUNCTION "protect_territory_ownership_history"();

-- AddForeignKey
ALTER TABLE "takeover_intents" ADD CONSTRAINT "takeover_intents_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territories" ADD CONSTRAINT "territories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "territory_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_ownerships" ADD CONSTRAINT "territory_ownerships_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_ownerships" ADD CONSTRAINT "territory_ownerships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
