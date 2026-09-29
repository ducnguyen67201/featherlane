import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createReadyDatabase } from './database-fixture.js';
import { AccessService } from '../apps/broker/src/application/access-service.js';
import { createServer } from '../apps/broker/src/server.js';
import { BrokerConfigSchema } from '../apps/broker/src/config.js';

const owner = 'o'.repeat(40);
const agent = 'a'.repeat(40);
const bob = 'b'.repeat(40);

const config = {
  port: 4318,
  databasePath: ':memory:',
  ownerToken: owner,
  agents: [
    { id: 'alice', token: agent },
    { id: 'bob', token: bob },
  ],
};

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of cleanups.splice(0)) {
    await close();
  }
});

async function fixture() {
  const database = await createReadyDatabase();
  const app = await createServer(config, new AccessService(database.store, Date.now, randomUUID));

  cleanups.push(async () => {
    await app.close();
    await database.close();
  });

  return app;
}

const auth = (token: string) => ({ authorization: 'Bearer ' + token });

const input = () => ({
  connectionId: 'production',
  purpose: 'safe fixture',
  ttlSeconds: 30,
  idempotencyKey: randomUUID(),
});

it('validates distinct owner and agent credentials', () => {
  expect(BrokerConfigSchema.safeParse(config).success).toBe(true);
  expect(BrokerConfigSchema.safeParse({ ...config, ownerToken: agent }).success).toBe(false);

  expect(
    BrokerConfigSchema.safeParse({ ...config, agents: [config.agents[0], config.agents[0]] })
      .success,
  ).toBe(false);
});

it('reports synthetic health, blocks hostile origins/hosts, and requires exact bearer auth', async () => {
  const app = await fixture();

  expect((await app.inject('/health')).json().browserExecution).toBe(false);

  expect(
    (await app.inject({ url: '/health', headers: { host: 'attacker.test' } })).statusCode,
  ).toBe(403);

  expect(
    (await app.inject({ url: '/health', headers: { origin: 'https://attacker.test' } })).statusCode,
  ).toBe(403);

  expect((await app.inject('/v1/connections')).statusCode).toBe(401);

  expect(
    (await app.inject({ url: '/v1/connections', headers: { authorization: agent } })).statusCode,
  ).toBe(401);

  expect((await app.inject({ url: '/v1/connections', headers: auth(agent) })).json()).toHaveLength(
    3,
  );
});

it('separates agent and owner routes and binds approvals to exact IDs', async () => {
  const app = await fixture();

  const created = await app.inject({
    method: 'POST',
    url: '/v1/access',
    headers: auth(agent),
    payload: input(),
  });

  expect(created.statusCode).toBe(201);
  const { id } = created.json();

  expect(created.json().status).toBe('pending');
  expect((await app.inject({ url: '/v1/access/' + id, headers: auth(bob) })).statusCode).toBe(404);

  const decision = {
    method: 'POST' as const,
    url: '/v1/owner/access/' + id + '/decision',
    payload: { decision: 'approve' },
  };

  expect((await app.inject({ ...decision, headers: auth(agent) })).statusCode).toBe(401);
  expect((await app.inject({ ...decision, headers: auth(owner) })).json().status).toBe('granted');
  expect((await app.inject({ ...decision, headers: auth(owner) })).statusCode).toBe(409);

  expect((await app.inject({ url: '/v1/owner/access', headers: auth(owner) })).json()).toHaveLength(
    1,
  );

  expect((await app.inject({ url: '/v1/owner/audit', headers: auth(owner) })).json()).toHaveLength(
    2,
  );

  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/owner/access/' + id + '/revoke',
        headers: auth(owner),
        payload: {},
      })
    ).json().status,
  ).toBe('revoked');

  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/access/' + id + '/release',
        headers: auth(agent),
        payload: {},
      })
    ).json().status,
  ).toBe('revoked');
});

it('rejects injected identities, malformed requests, unknown accounts, and real execution', async () => {
  const app = await fixture();

  for (const payload of [
    { ...input(), actorId: 'owner' },
    { ...input(), ttlSeconds: -1 },
    { ...input(), destination: 'https://evil.test' },
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/access',
      headers: auth(agent),
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(agent);
  }

  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/access',
        headers: auth(agent),
        payload: { ...input(), connectionId: 'missing' },
      })
    ).statusCode,
  ).toBe(404);

  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/browser/execute',
        headers: auth(agent),
        payload: {},
      })
    ).statusCode,
  ).toBe(501);

  expect((await app.inject({ url: '/v1/connections', headers: auth(owner) })).statusCode).toBe(401);
});
