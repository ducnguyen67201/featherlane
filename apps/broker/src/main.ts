import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { PrismaAccessStore } from './infrastructure/prisma-access-store.js';
import { createDatabaseClient } from './infrastructure/database-client.js';
import { AccessService } from './application/access-service.js';
import { createServer } from './server.js';

let store: PrismaAccessStore | undefined;

try {
  const config = loadConfig();

  store = new PrismaAccessStore(createDatabaseClient(config.databasePath));
  await store.verifyDatabaseIsReady();
  const service = new AccessService(store, Date.now, randomUUID);

  await service.invalidateOnStartup();
  const consoleDir = fileURLToPath(new URL('../../console/dist/', import.meta.url));
  const app = await createServer(config, service, existsSync(consoleDir) ? consoleDir : undefined);

  app.addHook('onClose', async () => store?.close());

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen({ host: '127.0.0.1', port: config.port });
  console.error('Featherlane synthetic broker: http://127.0.0.1:' + config.port);
} catch {
  await store?.close();

  console.error(
    'Broker startup failed. Run pnpm setup and pnpm db:migrate; check configuration, port, and database permissions. No credentials were logged.',
  );

  process.exitCode = 1;
}
