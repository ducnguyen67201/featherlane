import { AccessSchema, type Access } from '@featherlane/contracts';
import type { AccessRequest, Prisma } from '../generated/prisma/client.js';

/** Keep millisecond timestamps lossless in SQLite, while the HTTP contract uses numbers. */
export function convertAccessToDatabaseRecord(access: Access): Prisma.AccessRequestCreateInput {
  return {
    ...access,
    createdAt: BigInt(access.createdAt),
    expiresAt: BigInt(access.expiresAt),
  };
}

/** Generated types check query shape; Zod still checks stored data at the boundary. */
export function parseAccessFromDatabase(record: AccessRequest): Access {
  const { sequence: _sequence, createdAt, expiresAt, ...access } = record;

  if (!Number.isSafeInteger(Number(createdAt)) || !Number.isSafeInteger(Number(expiresAt))) {
    throw new Error('Invalid stored access timestamp');
  }

  return AccessSchema.parse({
    ...access,
    createdAt: Number(createdAt),
    expiresAt: Number(expiresAt),
  });
}
