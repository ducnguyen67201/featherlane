-- Frozen pre-Prisma schema. Used only to test upgrading the original demo.
CREATE TABLE access_requests (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  body TEXT NOT NULL, UNIQUE(actor_id, idempotency_key)
);
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, requestId TEXT NOT NULL,
  actorId TEXT NOT NULL, action TEXT NOT NULL, at INTEGER NOT NULL
);
PRAGMA user_version = 1;
