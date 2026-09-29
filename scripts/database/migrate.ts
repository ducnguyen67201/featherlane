import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { loadConfig } from '../../apps/broker/src/config.js';
import { createDatabaseClient } from '../../apps/broker/src/infrastructure/database-client.js';
import { importLegacyAccessRequests } from '../../apps/broker/src/infrastructure/import-legacy-access.js';
import { loadDatabaseEnv } from './env.js';

/**
 * Changes only the selected local database, never resets it. Existing pre-Prisma
 * databases require a separate, explicit baseline step after an offline backup.
 */
try {
  const selectedPath = loadDatabaseEnv().FEATHERLANE_DATABASE_PATH ?? loadConfig().databasePath;

  if (selectedPath === ':memory:' || !selectedPath.trim() || selectedPath.includes('\0')) {
    throw new Error('Migrations require a SQLite file path');
  }

  const databasePath = resolve(selectedPath);

  const command = process.argv[2] ?? 'deploy';

  const commands: Record<string, string[]> = {
    deploy: ['migrate', 'deploy'],
    baseline: ['migrate', 'resolve', '--applied', '202609280001_legacy_baseline'],
    dev: ['migrate', 'dev'],
  };

  const args = commands[command];

  if (!args) {
    throw new Error('Unknown database command');
  }

  const require = createRequire(import.meta.url);

  /*
   * Initialize the SQLite file through the driver before invoking Migrate. No
   * tables are created here. A baseline must find the real legacy tables first.
   */
  const connection = createDatabaseClient(databasePath);

  try {
    await connection.$connect();

    if (command === 'baseline') {
      await connection.legacyAccessRequest.findFirst();
      await connection.auditEvent.findFirst();
    }
  } finally {
    await connection.$disconnect();
  }

  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], {
    // Pass only the selected database setting; no broker/agent credentials are needed.
    env: { FEATHERLANE_DATABASE_PATH: databasePath },
    stdio: 'inherit',
  });

  if (command === 'deploy') {
    const database = createDatabaseClient(databasePath);

    try {
      await importLegacyAccessRequests(database);
      console.log('Database migrations and legacy import completed.');
    } finally {
      await database.$disconnect();
    }
  }
} catch {
  console.error(
    'Database preparation failed. Stop the broker, check configuration and see docs/database.md. No credentials were logged.',
  );

  process.exitCode = 1;
}
