CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "system_metadata" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_metadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_metadata_key_key" ON "system_metadata"("key");
