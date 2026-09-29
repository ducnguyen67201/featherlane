import { describe, it, expect } from 'vitest';
import {
  createAccess,
  connections,
  decide,
  expire,
  revoke,
  sameRequest,
} from '../apps/broker/src/domain/access.js';
import { RequestInputSchema } from '@featherlane/contracts';

const input = {
  connectionId: 'production',
  purpose: 'Deploy fixture',
  ttlSeconds: 30,
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
};

const id = '00000000-0000-4000-8000-000000000002';

describe('domain', () => {
  it.each(connections)('maps $policy deterministically', (connection) => {
    const access = createAccess({ ...input, connectionId: connection.id }, 'agent', id, 1000);

    expect(access.status).toBe(
      ({ allow: 'granted', ask: 'pending', deny: 'denied' } as const)[connection.policy],
    );

    expect(access.origin).toBe(connection.origin);
  });

  it('rejects unknown accounts and malformed or extra request fields', () => {
    expect(() => createAccess({ ...input, connectionId: 'unknown' }, 'a', id, 0)).toThrow(
      'not_found',
    );

    expect(RequestInputSchema.safeParse({ ...input, actorId: 'owner' }).success).toBe(false);
    expect(RequestInputSchema.safeParse({ ...input, ttlSeconds: 9000 }).success).toBe(false);
    expect(RequestInputSchema.safeParse({ ...input, purpose: ' ' }).success).toBe(false);
  });

  it('approves only once and denies only pending requests', () => {
    const pending = createAccess(input, 'a', id, 1000);
    const approved = decide(pending, 'approve', 1001);

    expect(approved.status).toBe('granted');
    expect(() => decide(approved, 'approve', 1002)).toThrow('conflict');
    expect(decide(pending, 'deny', 1001).status).toBe('denied');
  });

  it('expires at the exact deadline; approval does not extend lifetime', () => {
    const access = createAccess(input, 'a', id, 1000);

    expect(expire(access, 30999).status).toBe('pending');
    expect(expire(access, 31000).status).toBe('expired');
    expect(() => decide(access, 'approve', 31000)).toThrow('conflict');
    expect(decide(access, 'approve', 2000).expiresAt).toBe(31000);
  });

  it('revocation is terminal and idempotent', () => {
    const access = revoke(createAccess(input, 'a', id, 1000));

    expect(access.status).toBe('revoked');
    expect(revoke(access)).toEqual(access);
    expect(expire(access, 90000)).toEqual(access);
  });

  it('matches immutable request scope', () => {
    const access = createAccess(input, 'a', id, 1000);

    expect(sameRequest(access, input)).toBe(true);

    for (const other of [
      { ...input, purpose: 'different' },
      { ...input, ttlSeconds: 60 },
      { ...input, connectionId: 'staging' },
    ]) {
      expect(sameRequest(access, other)).toBe(false);
    }
  });
});
