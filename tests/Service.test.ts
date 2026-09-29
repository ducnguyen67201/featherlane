import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AccessService, type AccessStore } from '../apps/broker/src/application/AccessService.js';
import { createAccess } from '../apps/broker/src/domain/Access.js';
import { createDatabaseClient } from '../apps/broker/src/infrastructure/DatabaseClient.js';
import { PrismaAccessStore } from '../apps/broker/src/infrastructure/PrismaAccessStore.js';
import { createReadyDatabase } from './DatabaseFixture.js';

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of cleanups.splice(0)) {
    await close();
  }
});

async function fixture() {
  const database = await createReadyDatabase();

  cleanups.push(() => database.close());
  let time = 1000;

  return {
    ...database,
    service: new AccessService(database.store, () => time, randomUUID),
    setTime: (value: number) => {
      time = value;
    },
  };
}

const request = () => ({
  connectionId: 'production',
  purpose: 'fixture',
  ttlSeconds: 30,
  idempotencyKey: randomUUID(),
});

describe('transactional service', () => {
  it('deduplicates requests and rejects scope changes', async () => {
    const { service } = await fixture();
    const input = request();
    const first = await service.request(input, 'alice');

    expect(await service.request(input, 'alice')).toEqual(first);
    expect(await service.audit()).toHaveLength(1);

    await expect(service.request({ ...input, purpose: 'changed' }, 'alice')).rejects.toThrow(
      'conflict',
    );

    expect((await service.request(input, 'bob')).id).not.toBe(first.id);
  });

  it('hides other agents and denies cross-agent releases', async () => {
    const { service } = await fixture();
    const access = await service.request(request(), 'alice');

    await expect(service.get(access.id, 'bob')).rejects.toThrow('not_found');
    await expect(service.release(access.id, 'bob')).rejects.toThrow('not_found');
    expect((await service.release(access.id, 'alice')).status).toBe('revoked');
    expect((await service.release(access.id, 'alice')).status).toBe('revoked');
  });

  it('consumes approval once and audits decisions without extending expiry', async () => {
    const { service, setTime } = await fixture();
    const access = await service.request(request(), 'alice');

    setTime(2000);

    expect(await service.decision(access.id, 'approve')).toMatchObject({
      status: 'granted',
      expiresAt: access.expiresAt,
    });

    await expect(service.decision(access.id, 'deny')).rejects.toThrow('conflict');
    expect((await service.release(access.id)).status).toBe('revoked');

    expect((await service.audit()).map((item) => item.action)).toEqual([
      'revoked',
      'approve',
      'requested',
    ]);
  });

  it('persists expiry even if a late decision fails', async () => {
    const { service, setTime, store } = await fixture();
    const access = await service.request(request(), 'alice');

    setTime(31000);
    await expect(service.decision(access.id, 'approve')).rejects.toThrow('conflict');

    expect(
      (await store.runInTransaction((transaction) => transaction.findAccessById(access.id)))
        ?.status,
    ).toBe('expired');

    expect((await service.list())[0]?.status).toBe('expired');
    expect((await service.audit()).map((event) => event.action)).toEqual(['expired', 'requested']);
  });

  it('rolls back writes and audit together after awaited work', async () => {
    const { service, store } = await fixture();
    const access = createAccess(request(), 'alice', randomUUID(), 1000);

    await expect(
      store.runInTransaction(async (transaction) => {
        await transaction.saveAccessRequest(access);
        await transaction.recordAuditEvent(access.id, 'alice', 'requested', 1000);

        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await service.list()).toEqual([]);
    expect(await service.audit()).toEqual([]);
  });

  it('rolls back service state when its audit write fails', async () => {
    const { service, store } = await fixture();

    const failingStore: AccessStore = {
      runInTransaction: (work) =>
        store.runInTransaction((transaction) =>
          work({
            findAccessById: (id) => transaction.findAccessById(id),
            findAccessByIdempotencyKey: (actor, key) =>
              transaction.findAccessByIdempotencyKey(actor, key),
            listAccessRequests: () => transaction.listAccessRequests(),
            saveAccessRequest: (access) => transaction.saveAccessRequest(access),
            listAuditEvents: () => transaction.listAuditEvents(),
            recordAuditEvent: async () => {
              throw new Error('audit unavailable');
            },
          }),
        ),
    };

    const failingService = new AccessService(failingStore, Date.now, randomUUID);

    await expect(failingService.request(request(), 'alice')).rejects.toThrow('audit unavailable');
    expect(await service.list()).toEqual([]);
    expect(await service.audit()).toEqual([]);
  });

  it('deduplicates concurrent identical requests and creates one audit entry', async () => {
    const { service } = await fixture();
    const input = request();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => service.request(input, 'alice')),
    );

    expect(new Set(results.map((access) => access.id)).size).toBe(1);
    expect(await service.audit()).toHaveLength(1);
  });

  it('allows only one concurrent decision to commit', async () => {
    const { service } = await fixture();
    const access = await service.request(request(), 'alice');

    const results = await Promise.allSettled([
      service.decision(access.id, 'approve'),
      service.decision(access.id, 'deny'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await service.audit()).toHaveLength(2);
  });

  it('round-trips real millisecond timestamps without 32-bit integer overflow', async () => {
    const { service, setTime } = await fixture();
    const now = Date.now();

    setTime(now);
    const access = await service.request(request(), 'alice');

    expect((await service.get(access.id, 'alice')).createdAt).toBe(now);
    expect((await service.audit())[0]?.at).toBe(now);
  });

  it('persists across reopen and invalidates active grants on restart', async () => {
    const { service, store, databasePath } = await fixture();
    const granted = await service.request({ ...request(), connectionId: 'staging' }, 'alice');
    const pending = await service.request(request(), 'alice');

    await store.close();
    const reopened = new PrismaAccessStore(createDatabaseClient(databasePath));

    try {
      await reopened.verifyDatabaseIsReady();
      const restartedService = new AccessService(reopened, () => 2000, randomUUID);

      await restartedService.invalidateOnStartup();
      expect((await restartedService.get(granted.id, 'alice')).status).toBe('revoked');
      expect((await restartedService.get(pending.id, 'alice')).status).toBe('revoked');
    } finally {
      await reopened.close();
    }
  });
});
