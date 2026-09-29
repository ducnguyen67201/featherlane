-- Expand only: preserve both legacy tables. Import JSON through validated Prisma
-- queries in a separate data step after these schema changes have been applied.
PRAGMA journal_mode = WAL;

CREATE TABLE "access_records" (
    "sequence" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "ttlSeconds" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "synthetic" BOOLEAN NOT NULL
);

CREATE UNIQUE INDEX "access_records_id_key" ON "access_records"("id");
CREATE UNIQUE INDEX "access_records_actorId_idempotencyKey_key"
ON "access_records"("actorId", "idempotencyKey");

CREATE TABLE "database_state" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemaVersion" INTEGER NOT NULL,
    "legacyImported" BOOLEAN NOT NULL
);
