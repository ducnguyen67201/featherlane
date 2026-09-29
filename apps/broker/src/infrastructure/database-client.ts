import { resolve } from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

/** One client per broker process; schema changes belong to the migration command. */
export function createDatabaseClient(databasePath: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: databasePath === ':memory:' ? ':memory:' : 'file:' + resolve(databasePath),
    timeout: 5000,
  });

  return new PrismaClient({
    adapter,
    log: [],
    transactionOptions: { maxWait: 5000, timeout: 10000 },
  });
}
