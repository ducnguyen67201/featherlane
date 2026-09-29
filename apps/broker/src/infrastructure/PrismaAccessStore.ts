import type { Access } from '@featherlane/contracts';
import type { AccessStore, AccessTransaction, AuditEntry } from '../application/AccessService.js';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { convertAccessToDatabaseRecord, parseAccessFromDatabase } from './AccessRecord.js';

/**
 * Every method uses the transaction client, never the root client. This keeps
 * access changes and audit writes inside the same commit/rollback boundary.
 */
class PrismaAccessTransaction implements AccessTransaction {
  constructor(private readonly database: Prisma.TransactionClient) {}

  async findAccessById(id: string): Promise<Access | undefined> {
    const record = await this.database.accessRequest.findUnique({ where: { id } });

    return record ? parseAccessFromDatabase(record) : undefined;
  }

  async findAccessByIdempotencyKey(
    actorId: string,
    idempotencyKey: string,
  ): Promise<Access | undefined> {
    const record = await this.database.accessRequest.findUnique({
      where: { actorId_idempotencyKey: { actorId, idempotencyKey } },
    });

    return record ? parseAccessFromDatabase(record) : undefined;
  }

  async listAccessRequests(): Promise<Access[]> {
    const records = await this.database.accessRequest.findMany({ orderBy: { sequence: 'desc' } });

    return records.map(parseAccessFromDatabase);
  }

  async saveAccessRequest(access: Access): Promise<void> {
    const record = convertAccessToDatabaseRecord(access);

    await this.database.accessRequest.upsert({
      where: { id: access.id },
      create: record,
      update: record,
    });
  }

  async recordAuditEvent(
    requestId: string,
    actorId: string,
    action: string,
    at: number,
  ): Promise<void> {
    await this.database.auditEvent.create({ data: { requestId, actorId, action, at: BigInt(at) } });
  }

  async listAuditEvents(): Promise<AuditEntry[]> {
    const records = await this.database.auditEvent.findMany({ orderBy: { id: 'desc' }, take: 200 });

    return records.map(({ at, ...entry }) => {
      if (!Number.isSafeInteger(Number(at))) {
        throw new Error('Invalid stored audit timestamp');
      }

      return { ...entry, at: Number(at) };
    });
  }
}

/** Prisma owns typed queries; SQLite remains the local database underneath it. */
export class PrismaAccessStore implements AccessStore {
  constructor(private readonly database: PrismaClient) {}

  /** Refuse startup until explicit migrations and the legacy import have completed. */
  async verifyDatabaseIsReady(): Promise<void> {
    const state = await this.database.databaseState.findUnique({ where: { id: 'broker' } });

    if (state?.schemaVersion !== 1 || !state.legacyImported) {
      throw new Error('Database is not ready or its schema is unsupported; run pnpm db:migrate');
    }
  }

  async runInTransaction<T>(work: (transaction: AccessTransaction) => Promise<T>): Promise<T> {
    /*
     * Retry only rolled-back write conflicts/unique races. Callbacks must contain
     * database work only: an external side effect could otherwise be repeated.
     * SQLite serializes writers; this does not make the demo a multi-process service.
     */
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.database.$transaction(
          (database) => work(new PrismaAccessTransaction(database)),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2034', 'P2002'].includes(error.code);

        if (!retryable || attempt >= 2) {
          throw error;
        }
      }
    }
  }

  async close(): Promise<void> {
    await this.database.$disconnect();
  }
}
