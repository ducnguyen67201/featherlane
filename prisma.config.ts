import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';
import { loadDatabaseEnv } from './scripts/database/Env.js';

const databasePath = loadDatabaseEnv().FEATHERLANE_DATABASE_PATH;

export default defineConfig({
  schema: 'apps/broker/prisma/schema.prisma',
  migrations: { path: 'apps/broker/prisma/migrations' },
  // Generation needs no live database. Migration commands must provide a real path.
  datasource: { url: 'file:' + resolve(databasePath ?? 'prisma-generation-only.sqlite') },
});
