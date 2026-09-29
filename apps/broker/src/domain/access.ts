import type { Access, Connection, RequestInput } from '@featherlane/contracts';
import {
  AccessDecision,
  AccessStatus,
  ConnectionPolicy,
} from '@featherlane/contracts/access-values';

/** Stable domain error codes; HTTP adapters decide which response status to send. */
export const AccessErrorCode = {
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
} as const;

export type AccessErrorCode = (typeof AccessErrorCode)[keyof typeof AccessErrorCode];

export class DomainError extends Error {
  constructor(public readonly code: AccessErrorCode) {
    super(code);
  }
}

/*
 * Fixed synthetic accounts exercise allow/ask/deny without real credentials.
 * This is a demo policy catalog, not a configurable production policy engine.
 */
export const connections: readonly Connection[] = [
  {
    id: 'staging',
    label: 'Synthetic staging account',
    origin: 'https://staging.example.test',
    policy: ConnectionPolicy.ALLOW,
    synthetic: true,
  },
  {
    id: 'production',
    label: 'Synthetic production account',
    origin: 'https://production.example.test',
    policy: ConnectionPolicy.ASK,
    synthetic: true,
  },
  {
    id: 'personal',
    label: 'Synthetic personal account',
    origin: 'https://personal.example.test',
    policy: ConnectionPolicy.DENY,
    synthetic: true,
  },
];

/**
 * Creates an authorization record using the configured destination, never an
 * agent-supplied URL. Time is supplied by the caller to keep these rules testable.
 * A granted record does not create a login or an authenticated browser session.
 */
export function createAccess(
  input: RequestInput,
  actorId: string,
  id: string,
  now: number,
): Access {
  const connection = connections.find((item) => item.id === input.connectionId);

  if (!connection) {
    throw new DomainError(AccessErrorCode.NOT_FOUND);
  }

  return {
    ...input,
    actorId,
    id,
    origin: connection.origin,
    policyVersion: 'demo-v1',
    status:
      connection.policy === ConnectionPolicy.ALLOW
        ? AccessStatus.GRANTED
        : connection.policy === ConnectionPolicy.ASK
          ? AccessStatus.PENDING
          : AccessStatus.DENIED,
    createdAt: now,
    expiresAt: now + input.ttlSeconds * 1000,
    synthetic: true,
  };
}

export function expire(access: Access, now: number): Access {
  return (access.status === AccessStatus.PENDING || access.status === AccessStatus.GRANTED) &&
    now >= access.expiresAt
    ? { ...access, status: AccessStatus.EXPIRED }
    : access;
}

/**
 * Only an unexpired pending request may be decided. Approval preserves the
 * original deadline: time spent waiting for the owner consumes the request TTL.
 */
export function decide(access: Access, decision: AccessDecision, now: number): Access {
  if (expire(access, now).status !== AccessStatus.PENDING) {
    throw new DomainError(AccessErrorCode.CONFLICT);
  }

  return {
    ...access,
    status: decision === AccessDecision.APPROVE ? AccessStatus.GRANTED : AccessStatus.DENIED,
  };
}

export function revoke(access: Access): Access {
  return access.status === AccessStatus.PENDING || access.status === AccessStatus.GRANTED
    ? { ...access, status: AccessStatus.REVOKED }
    : access;
}

export function sameRequest(access: Access, input: RequestInput): boolean {
  return (
    access.connectionId === input.connectionId &&
    access.purpose === input.purpose &&
    access.ttlSeconds === input.ttlSeconds
  );
}
