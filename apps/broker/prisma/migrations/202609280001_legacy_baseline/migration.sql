-- Baseline of the original synthetic demo. Existing databases explicitly mark
-- this migration as applied; fresh databases create the same legacy tables.
CREATE TABLE "access_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "body" TEXT NOT NULL
);

CREATE UNIQUE INDEX "access_requests_actor_id_idempotency_key_key"
ON "access_requests"("actor_id", "idempotency_key");

CREATE TABLE "audit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "at" BIGINT NOT NULL
);
