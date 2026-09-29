import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { FeatherlaneClient, BrokerError } from '@featherlane/client';
import { createCli } from '../apps/cli/src/Commands.js';
import { capabilities, execute } from '../apps/browser-worker/src/Index.js';
import { createAccess } from '../apps/broker/src/domain/Access.js';

const input = {
  connectionId: 'staging',
  purpose: 'fixture',
  ttlSeconds: 30,
  idempotencyKey: randomUUID(),
};

const access = createAccess(input, 'a', randomUUID(), 1);

it('client validates endpoint and rejects cleartext remote or credential URLs', () => {
  for (const baseUrl of [
    'http://remote.test',
    'https://user:pass@example.test',
    'https://example.test/path',
    'https://example.test?token=x',
  ]) {
    expect(() => new FeatherlaneClient({ baseUrl, token: 'x' })).toThrow();
  }

  expect(() => new FeatherlaneClient({ baseUrl: 'http://127.0.0.1:4318', token: '' })).toThrow();
});

it('client serializes authorization and validates response contracts', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(access)));

  const client = new FeatherlaneClient({
    baseUrl: 'http://localhost:4318',
    token: 'secret',
    fetch: transport,
  });

  expect(await client.requestAccess(input)).toEqual(access);
  const init = transport.mock.calls[0]?.[1];

  expect(init?.headers).toEqual({
    authorization: 'Bearer secret',
    'content-type': 'application/json',
  });

  expect(init?.redirect).toBe('error');
  expect(await client.getAccess(access.id)).toEqual(access);
  transport.mockImplementation(async () => new Response(JSON.stringify(access)));
  expect(await client.releaseAccess(access.id)).toEqual(access);
});

it('client does not echo untrusted upstream error bodies', async () => {
  const client = new FeatherlaneClient({
    baseUrl: 'http://localhost',
    token: 'secret',
    fetch: async () => new Response('secret leaked', { status: 403 }),
  });

  await expect(client.connections()).rejects.toThrow('Broker request failed (403)');
  await expect(client.health()).rejects.toBeInstanceOf(BrokerError);
});

it('CLI maps request options, status, list, release and validates TTL', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (url) =>
        new Response(JSON.stringify(String(url).endsWith('/connections') ? [] : access)),
    );

  const client = new FeatherlaneClient({
    baseUrl: 'http://localhost',
    token: 'secret',
    fetch: transport,
  });

  const write = vi.fn<Parameters<typeof createCli>[1]>();

  for (const args of [
    ['connections'],
    [
      'request',
      '--connection',
      'staging',
      '--purpose',
      'fixture',
      '--ttl',
      '30',
      '--key',
      input.idempotencyKey,
    ],
    ['status', access.id],
    ['release', access.id],
  ]) {
    await createCli(client, write).parseAsync(args, { from: 'user' });
  }

  expect(write).toHaveBeenCalledTimes(4);

  await expect(
    createCli(client, write).parseAsync(
      ['request', '--connection', 'staging', '--purpose', 'fixture', '--ttl', 'NaN'],
      { from: 'user' },
    ),
  ).rejects.toThrow();
});

it('browser worker makes no false execution claims', () => {
  expect(capabilities()).toEqual({
    mode: 'scaffold',
    protectedExecution: false,
    realCredentials: false,
  });

  expect(() => execute()).toThrow('not implemented');
});
