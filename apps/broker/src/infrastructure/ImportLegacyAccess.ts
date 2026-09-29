import { AccessSchema } from '@featherlane/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { convertAccessToDatabaseRecord } from './AccessRecord.js';

/**
 * Explicit, offline data upgrade after schema migrations. Keep legacy rows and
 * audit history intact. Mark completion in the same transaction as the import,
 * so a malformed record cannot leave a partly imported database ready to serve.
 */
export async function importLegacyAccessRequests(database: PrismaClient): Promise<void> {
  await database.$transaction(
    async (transaction) => {
      const state = await transaction.databaseState.findUnique({ where: { id: 'broker' } });

      if (state && state.schemaVersion !== 1) {
        throw new Error('Unsupported database schema');
      }

      if (state?.legacyImported) {
        return;
      }

      if ((await transaction.accessRequest.count()) !== 0) {
        throw new Error('Refusing to import into an unmarked nonempty destination');
      }

      const legacyRows = await transaction.legacyAccessRequest.findMany();

      const requests = legacyRows.map((row) => {
        const storedRecord: unknown = JSON.parse(row.body);
        const access = AccessSchema.parse(storedRecord);

        if (
          access.id !== row.id ||
          access.actorId !== row.actorId ||
          access.idempotencyKey !== row.idempotencyKey
        ) {
          throw new Error('Legacy access identity does not match its stored index');
        }

        return access;
      });

      // The old implicit rowid is not a public contract. Import in timestamp/ID order.
      requests.sort(
        (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
      );

      for (const request of requests) {
        await transaction.accessRequest.create({ data: convertAccessToDatabaseRecord(request) });
      }

      await transaction.databaseState.upsert({
        where: { id: 'broker' },
        create: { id: 'broker', schemaVersion: 1, legacyImported: true },
        update: { legacyImported: true },
      });
    },
    { timeout: 60000 },
  );
}
