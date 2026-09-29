import { describe, expect, it } from 'vitest';
import {
  AccessSchema,
  ConnectionSchema,
  DecisionSchema,
  RequestInputSchema,
} from '@featherlane/contracts';
import { BrokerConfigSchema } from '../apps/broker/src/config.js';

const input = {
  connectionId: 'production',
  purpose: '  Test account access  ',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
};

describe('supported Zod APIs preserve wire validation', () => {
  it('accepts valid UUIDs, trims purpose and applies the default TTL', () => {
    expect(RequestInputSchema.parse(input)).toEqual({
      ...input,
      purpose: 'Test account access',
      ttlSeconds: 300,
    });
  });

  it.each(['not-a-uuid', '00000000-0000-4000-0000-000000000001', ''])(
    'rejects malformed request UUID %j',
    (idempotencyKey) => {
      expect(RequestInputSchema.safeParse({ ...input, idempotencyKey }).success).toBe(false);
    },
  );

  it('validates connection URLs and preserves strict object rejection', () => {
    const connection = {
      id: 'staging',
      label: 'Synthetic account',
      origin: 'https://staging.example.test',
      policy: 'allow',
      synthetic: true,
    };

    expect(ConnectionSchema.parse(connection)).toEqual(connection);
    expect(ConnectionSchema.safeParse({ ...connection, origin: 'not-a-url' }).success).toBe(false);

    expect(ConnectionSchema.safeParse({ ...connection, ownerToken: 'unexpected' }).success).toBe(
      false,
    );

    expect(RequestInputSchema.safeParse({ ...input, actorId: 'owner' }).success).toBe(false);
    expect(DecisionSchema.safeParse({ decision: 'approve', permanent: true }).success).toBe(false);
  });

  it('validates access record URLs and UUIDs', () => {
    const access = {
      ...RequestInputSchema.parse(input),
      id: '00000000-0000-4000-8000-000000000002',
      actorId: 'demo-agent',
      origin: 'https://production.example.test',
      policyVersion: 'demo-v1',
      status: 'pending',
      createdAt: 1000,
      expiresAt: 301000,
      synthetic: true,
    };

    expect(AccessSchema.parse(access)).toEqual(access);
    expect(AccessSchema.safeParse({ ...access, id: 'invalid' }).success).toBe(false);
    expect(AccessSchema.safeParse({ ...access, origin: '/relative' }).success).toBe(false);
  });

  it('keeps broker configuration strict at both root and nested agent boundaries', () => {
    const config = {
      databasePath: ':memory:',
      ownerToken: 'o'.repeat(40),
      agents: [{ id: 'demo-agent', token: 'a'.repeat(40) }],
    };

    expect(BrokerConfigSchema.parse(config).port).toBe(4318);
    expect(BrokerConfigSchema.safeParse({ ...config, unknown: true }).success).toBe(false);

    expect(
      BrokerConfigSchema.safeParse({
        ...config,
        agents: [{ ...config.agents[0], owner: true }],
      }).success,
    ).toBe(false);
  });
});
