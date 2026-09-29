import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';
import { createDatabaseClient } from '../apps/broker/src/infrastructure/database-client.js';
import { importLegacyAccessRequests } from '../apps/broker/src/infrastructure/import-legacy-access.js';
import { PrismaAccessStore } from '../apps/broker/src/infrastructure/prisma-access-store.js';

const require = createRequire(import.meta.url);
let templateDirectory: string | undefined;

/** Run real migrations once per test file, then copy the closed database for isolation. */
export async function createMigratedDatabase() {
  if (!templateDirectory) {
    templateDirectory = mkdtempSync(join(tmpdir(), 'featherlane-prisma-template-'));
    const template = createDatabaseClient(join(templateDirectory, 'template.sqlite'));

    try {
      await template.$connect();
    } finally {
      await template.$disconnect();
    }

    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: {
          ...process.env,
          FEATHERLANE_DATABASE_PATH: join(templateDirectory, 'template.sqlite'),
        },
        stdio: 'pipe',
      },
    );
  }

  const directory = mkdtempSync(join(tmpdir(), 'featherlane-prisma-test-'));
  const databasePath = join(directory, 'test.sqlite');

  copyFileSync(join(templateDirectory, 'template.sqlite'), databasePath);
  const database = createDatabaseClient(databasePath);
  const store = new PrismaAccessStore(database);

  return {
    database,
    databasePath,
    store,
    async close() {
      await store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export async function createReadyDatabase() {
  const fixture = await createMigratedDatabase();

  try {
    await importLegacyAccessRequests(fixture.database);
    await fixture.store.verifyDatabaseIsReady();

    return fixture;
  } catch (error) {
    await fixture.close();

    throw error;
  }
}

afterAll(() => {
  if (templateDirectory) {
    rmSync(templateDirectory, { recursive: true, force: true });
  }
});
