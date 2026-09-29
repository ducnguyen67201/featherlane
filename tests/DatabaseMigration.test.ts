import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAccess } from '../apps/broker/src/domain/Access.js';
import { importLegacyAccessRequests } from '../apps/broker/src/infrastructure/ImportLegacyAccess.js';
import { createDatabaseClient } from '../apps/broker/src/infrastructure/DatabaseClient.js';
import { PrismaAccessStore } from '../apps/broker/src/infrastructure/PrismaAccessStore.js';
import { createMigratedDatabase } from './DatabaseFixture.js';
import { loadDatabaseEnv } from '../scripts/database/Env.js';

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of cleanups.splice(0)) {
    await close();
  }
});

async function fixture() {
  const database = await createMigratedDatabase();

  cleanups.push(() => database.close());

  return database;
}

function createLegacyRequest() {
  return createAccess(
    {
      connectionId: 'production',
      purpose: 'preserved request',
      ttlSeconds: 300,
      idempotencyKey: randomUUID(),
    },
    'alice',
    randomUUID(),
    Date.now(),
  );
}

it('refuses an incomplete import and unsupported schema version', async () => {
  const { database, store } = await fixture();

  await expect(store.verifyDatabaseIsReady()).rejects.toThrow('Database is not ready');
  await importLegacyAccessRequests(database);
  await expect(store.verifyDatabaseIsReady()).resolves.toBeUndefined();
  await database.databaseState.update({ where: { id: 'broker' }, data: { schemaVersion: 99 } });
  await expect(store.verifyDatabaseIsReady()).rejects.toThrow('unsupported');
  await expect(importLegacyAccessRequests(database)).rejects.toThrow('Unsupported database schema');
});

it('imports legacy JSON without deleting history or duplicating requests on rerun', async () => {
  const { database, store } = await fixture();
  const request = createLegacyRequest();

  await database.legacyAccessRequest.create({
    data: {
      id: request.id,
      actorId: request.actorId,
      idempotencyKey: request.idempotencyKey,
      body: JSON.stringify(request),
    },
  });

  await database.auditEvent.create({
    data: {
      id: 42,
      requestId: request.id,
      actorId: 'alice',
      action: 'requested',
      at: BigInt(request.createdAt),
    },
  });

  await importLegacyAccessRequests(database);
  await importLegacyAccessRequests(database);

  expect(
    await store.runInTransaction((transaction) => transaction.findAccessById(request.id)),
  ).toEqual(request);

  expect(await database.legacyAccessRequest.count()).toBe(1);
  expect(await database.accessRequest.count()).toBe(1);
  expect(await database.auditEvent.count()).toBe(1);

  expect(
    (await store.runInTransaction((transaction) => transaction.listAuditEvents()))[0]?.id,
  ).toBe(42);
});

it('rolls back the import and readiness marker when legacy data is invalid', async () => {
  const { database } = await fixture();
  const request = createLegacyRequest();

  await database.legacyAccessRequest.create({
    data: {
      id: request.id,
      actorId: 'different-agent',
      idempotencyKey: request.idempotencyKey,
      body: JSON.stringify(request),
    },
  });

  await expect(importLegacyAccessRequests(database)).rejects.toThrow('identity');
  expect(await database.accessRequest.count()).toBe(0);
  expect(await database.databaseState.count()).toBe(0);
  expect(await database.legacyAccessRequest.count()).toBe(1);
});

it('upgrades the real pre-Prisma schema with explicit baselining and preserves audit IDs', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'featherlane-legacy-upgrade-'));
  const databasePath = join(directory, 'legacy.sqlite');
  const request = createLegacyRequest();
  const legacy = new DatabaseSync(databasePath);

  // Raw SQL is confined to this frozen legacy fixture; product queries use Prisma.
  legacy.exec(readFileSync(new URL('./fixtures/legacy-v1.sql', import.meta.url), 'utf8'));

  legacy
    .prepare('INSERT INTO access_requests VALUES (?, ?, ?, ?)')
    .run(request.id, request.actorId, request.idempotencyKey, JSON.stringify(request));

  legacy
    .prepare('INSERT INTO audit(requestId, actorId, action, at) VALUES (?, ?, ?, ?)')
    .run(request.id, request.actorId, 'requested', request.createdAt);

  legacy.close();

  const run = (command: string) =>
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/database/Migrate.ts', command], {
      env: { ...process.env, FEATHERLANE_DATABASE_PATH: databasePath },
      stdio: 'pipe',
    });

  const database = createDatabaseClient(databasePath);

  try {
    // Nonempty databases must never be silently adopted or reset by deploy.
    expect(() => run('deploy')).toThrow();
    run('baseline');
    run('deploy');
    run('deploy');
    const store = new PrismaAccessStore(database);

    await store.verifyDatabaseIsReady();

    expect(
      await store.runInTransaction((transaction) => transaction.findAccessById(request.id)),
    ).toEqual(request);

    expect(
      (await store.runInTransaction((transaction) => transaction.listAuditEvents()))[0],
    ).toMatchObject({
      id: 1,
      requestId: request.id,
      at: request.createdAt,
    });
  } finally {
    await database.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);

it('validates database tooling paths without loading broker credentials', () => {
  expect(loadDatabaseEnv({}).FEATHERLANE_DATABASE_PATH).toBeUndefined();

  expect(
    loadDatabaseEnv({ FEATHERLANE_DATABASE_PATH: '/tmp/demo database.sqlite' })
      .FEATHERLANE_DATABASE_PATH,
  ).toBe('/tmp/demo database.sqlite');

  for (const path of [' ', ':memory:', 'bad\0path']) {
    expect(() => loadDatabaseEnv({ FEATHERLANE_DATABASE_PATH: path })).toThrow(
      'Invalid database tooling',
    );
  }
});
