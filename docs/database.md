# Prisma database workflow

The broker uses Prisma ORM 7.10 with a local SQLite database. Prisma is the query layer, not a replacement database server. The official SQLite adapter still uses better-sqlite3 internally, but application code does not import that driver or write SQL queries.

## Where things live

- `apps/broker/prisma/schema.prisma`: typed access, audit and migration-support models.
- `apps/broker/prisma/migrations/`: versioned SQL schema changes reviewed and committed to Git.
- `apps/broker/src/generated/prisma/`: generated client; ignored by Git, ESLint and Prettier. Do not edit it.
- `apps/broker/src/infrastructure/prisma-access-store.ts`: typed database queries and transaction adapter.
- `apps/broker/src/infrastructure/import-legacy-access.ts`: explicit, atomic legacy data import.
- `scripts/database/`: migration command and T3-validated environment configuration.

## Fresh local database

From this repository root:

```sh
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

If configuration already exists, do not rerun setup. Database commands read `databasePath` from the selected broker configuration. `FEATHERLANE_BROKER_CONFIG` selects that config as before. The optional `FEATHERLANE_DATABASE_PATH` overrides only migration tooling, not the running broker; use the same path or you will migrate a different database. In-memory database paths are not supported by this migration workflow.

`pnpm dev` runs `db:generate`, then `db:migrate`, then starts the broker and console. Generation comes first because the migration tooling imports the generated client. Preparation runs once per invocation, not on watcher reloads. Either preparation failure prevents both servers from starting. Stop an existing broker before invoking it; do not use this convenience command to upgrade a database while another process is writing to it.

`pnpm db:migrate` applies pending schema migrations, then imports any legacy requests and marks the database ready. It does not reset the database or generate new migration files. Repeated runs skip applied migrations and completed imports. Keep `FEATHERLANE_DATABASE_PATH` unset for normal `pnpm dev`, so migrations and the broker use the same configured database.

The broker process itself only checks readiness and invalidates old active/pending grants; it never migrates schemas. Direct `pnpm dev:broker` and compiled startup bypass the development preparation chain. For those entrypoints, run `pnpm db:generate` and `pnpm db:migrate` explicitly first. Production migrations remain a separate controlled deployment step. Legacy baselining and migration authoring remain explicit operations, never automatic startup actions.

## Upgrade an existing pre-Prisma demo

This path is for the original version-1 `access_requests` JSON table and `audit` table only, not an arbitrary SQLite file or a future schema.

1. Stop the broker and every other writer. Keep them stopped through the entire upgrade.
2. Make a verified offline backup of the database. Preserve any SQLite `-wal` and `-shm` sidecars alongside it. Test recovery on a copy before upgrading data that matters.
3. Confirm the database came from the original version-1 demo and has not had custom schema changes. Do not baseline an unknown database.
4. Run `pnpm db:generate`, then `pnpm db:baseline` to explicitly acknowledge the existing legacy schema.
5. Run `pnpm db:migrate` to add the new tables and import validated request records.
6. Start the broker. As before, startup revokes active/pending grants rather than reviving them.

Deploy refuses a nonempty database without migration history; it does not silently adopt it. Baselining is an operator acknowledgement, not automatic proof of schema compatibility. Never baseline a fresh database to skip table creation.

The upgrade preserves original JSON rows and existing audit IDs/events. It does not delete or rewrite the legacy tables. JSON identity fields must agree with the legacy index columns. Malformed records roll back the entire data import, and the missing readiness marker prevents startup. Fix the source on a backed-up copy and retry; do not force the readiness marker.

The schema migration and data import are separate steps. If import fails, new empty tables may already exist, but no partially imported records or ready marker are committed. Re-running the command resumes safely. After a successful import, rerunning it does not replay stale legacy values over newer records. Legacy records with equal creation timestamps are imported in ID order; the old implicit SQLite row order is not preserved for those ties.

Rollback means stopping the new broker and restoring the offline backup with its matching old application version. There is no automatic down migration. Do not resume the old broker against the upgraded database: its JSON records are no longer updated by the new application. Writes made after upgrade are not present in the old backup.

## Change the schema during development

Use a disposable development database, not your normal demo data:

```sh
FEATHERLANE_DATABASE_PATH=/absolute/path/to/disposable.sqlite pnpm db:dev
pnpm db:generate
```

Edit the Prisma schema before running `db:dev`. Review the generated migration and commit it with the schema and consuming code. Prisma development migrations may propose a reset on schema drift; do not accept a reset for a database containing data you need. Apply reviewed migrations with `db:migrate`; never use `db push` or a reset as an upgrade strategy.

SQL remains in migration artifacts because it describes the database change. Normal reads and writes use Prisma's `findUnique`, `findMany`, `create`, and `upsert` methods. A frozen legacy SQL fixture exists solely to test the old schema upgrade. ESLint rejects direct SQLite imports and raw Prisma query calls in application code.

## Transaction and type guarantees

The service passes one transaction-scoped store through each workflow. Request changes and audit writes either both commit or both roll back. Do not open a new transaction inside a transaction callback, use a root Prisma client inside it, or perform network/notification side effects that could repeat on retry.

Prisma provides generated query/result types; Zod continues validating external inputs and stored records at boundaries. Timestamps use BigInt database columns to avoid 32-bit overflow and are converted to safe JavaScript numbers before HTTP serialization. No raw BigInt values reach API JSON.

The local adapter serializes transactions on one connection. Concurrent-request tests do not establish multi-process or multi-tenant production guarantees. Audit history is transactional, not tamper-proof.

## Checks and CI

Broker builds remove only their generated `apps/broker/dist` output before compiling. This prevents deleted implementations and stale TypeScript declarations from surviving a rebuild. If your editor still reports `SqliteStore` errors after the Prisma migration, close the deleted source tab without saving it back and reopen `prisma-access-store.ts`; restart the editor's TypeScript server if needed. Do not add compatibility methods to the retired raw-SQL adapter.

The workspace pins patched transitive tooling dependencies for Prisma 7.10: deepmerge-ts 8.0.2 and mysql2 3.23.1. These scoped overrides address [recursive merge exhaustion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [MySQL auth downgrade](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), and [compressed-protocol exhaustion](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3). Featherlane does not use MySQL. Review and remove the overrides when upgrading Prisma to a version with patched dependencies.

Generate the client before TypeScript checks on a fresh install. Complete implementation first, then run the repository's final validation commands. Unit tests apply real migrations to temporary files and cover legacy upgrade, rollback, idempotency races, concurrent decisions, expiry and restart. Integration migrates a temporary database before launching the built broker, CLI, MCP and owner UI. No test uses the developer's configured database.

References: [Prisma SQLite adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/sqlite), [interactive transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions), [baselining existing databases](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining).
