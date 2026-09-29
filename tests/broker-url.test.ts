import { expect, it, vi } from 'vitest';
import { validateAndFormatBrokerUrl } from '../packages/client/src/validation/broker-url.js';
import { FeatherlaneClient } from '@featherlane/client';

it.each([
  ['https://broker.example.test', 'https://broker.example.test'],
  ['https://BROKER.example.test:443/', 'https://broker.example.test'],
  ['https://broker.example.test:8443/', 'https://broker.example.test:8443'],
  ['http://localhost:4318/', 'http://localhost:4318'],
  ['http://127.0.0.1:4318', 'http://127.0.0.1:4318'],
  ['http://[::1]:4318/', 'http://[::1]:4318'],
])('validates and formats the allowed broker URL %s', (input, expected) => {
  expect(validateAndFormatBrokerUrl(input)).toBe(expected);
});

it.each([
  'https://user@example.test',
  'https://:password@example.test',
  'https://user:password@example.test',
  'https://example.test/api',
  'https://example.test/?token=private-value',
  'https://example.test/#private-value',
])('rejects disallowed URL components in %s', (input) => {
  expect(() => validateAndFormatBrokerUrl(input)).toThrow('Invalid broker URL');
});

it.each([
  'http://remote.example.test',
  'http://localhost.example.test',
  'http://127.0.0.1.example.test',
  'ftp://localhost/',
  'ws://localhost/',
])('rejects unsupported broker transport %s', (input) => {
  expect(() => validateAndFormatBrokerUrl(input)).toThrow(
    'Broker URL must use HTTPS or loopback HTTP',
  );
});

it.each(['', 'not-a-url', '/relative', 'https://'])('rejects malformed URL %j', (input) => {
  expect(() => validateAndFormatBrokerUrl(input)).toThrow();
});

it('uses the normalized origin in SDK requests', async () => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response('[]'));

  const client = new FeatherlaneClient({
    baseUrl: 'https://BROKER.example.test:443/',
    token: 'synthetic-token',
    fetch: transport,
  });

  await client.connections();

  expect(transport.mock.calls[0]?.[0]).toBe('https://broker.example.test/v1/connections');
});
