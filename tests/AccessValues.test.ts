import { expect, expectTypeOf, it } from 'vitest';
import {
  AccessDecision,
  AccessStatus,
  ConnectionPolicy,
  AccessSchema,
  ConnectionSchema,
  DecisionSchema,
} from '@featherlane/contracts';
import { AccessStatus as DatabaseAccessStatus } from '../apps/broker/src/generated/prisma/enums.js';

/* Literal expectations intentionally pin the wire contract independently of the constants. */
it('keeps named constants mapped to the existing public strings', () => {
  expect(AccessDecision).toEqual({ APPROVE: 'approve', DENY: 'deny' });

  expect(AccessStatus).toEqual({
    PENDING: 'pending',
    GRANTED: 'granted',
    DENIED: 'denied',
    EXPIRED: 'expired',
    REVOKED: 'revoked',
  });

  expect(ConnectionPolicy).toEqual({ ALLOW: 'allow', ASK: 'ask', DENY: 'deny' });
});

it('derives schema options from the same constants used by business logic', () => {
  expect(DecisionSchema.shape.decision.options).toEqual(Object.values(AccessDecision));
  expect(AccessSchema.shape.status.options).toEqual(Object.values(AccessStatus));
  expect(ConnectionSchema.shape.policy.options).toEqual(Object.values(ConnectionPolicy));

  for (const decision of Object.values(AccessDecision)) {
    expect(DecisionSchema.parse({ decision })).toEqual({ decision });
  }
});

it('keeps the public status type and values aligned with Prisma without importing Prisma into domain code', () => {
  expectTypeOf<AccessStatus>().toEqualTypeOf<DatabaseAccessStatus>();
  expectTypeOf<AccessDecision>().toEqualTypeOf<'approve' | 'deny'>();
  expectTypeOf<ConnectionPolicy>().toEqualTypeOf<'allow' | 'ask' | 'deny'>();
  expect(Object.values(AccessStatus).sort()).toEqual(Object.values(DatabaseAccessStatus).sort());
});

it.each(['revoke', 'allow', 'approved', 'APPROVE', '', null])(
  'rejects %j as an owner approval decision',
  (decision) => {
    expect(DecisionSchema.safeParse({ decision }).success).toBe(false);
  },
);
