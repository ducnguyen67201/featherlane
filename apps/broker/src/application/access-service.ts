import type { Access, AccessDecision, RequestInput } from '@featherlane/contracts';
import {
  createAccess,
  AccessErrorCode,
  decide,
  DomainError,
  expire,
  revoke,
  sameRequest,
} from '../domain/access.js';

/* Audit event names describe history; they are not request lifecycle states. */
const AccessAuditAction = {
  REQUESTED: 'requested',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  RESTART_INVALIDATED: 'restart_invalidated',
} as const;

export interface AuditEntry {
  id: number;
  requestId: string;
  actorId: string;
  action: string;
  at: number;
}

/** Transaction-scoped database operations; no Prisma types cross this application boundary. */
export interface AccessTransaction {
  findAccessById(id: string): Promise<Access | undefined>;
  findAccessByIdempotencyKey(actorId: string, key: string): Promise<Access | undefined>;
  listAccessRequests(): Promise<Access[]>;
  saveAccessRequest(access: Access): Promise<void>;
  recordAuditEvent(requestId: string, actorId: string, action: string, at: number): Promise<void>;
  listAuditEvents(): Promise<AuditEntry[]>;
}

/**
 * All work must use the supplied transaction and await its writes. An exception
 * rolls back both state and audit. Callbacks may be retried; keep network calls,
 * notifications and other external side effects outside this boundary.
 */
export interface AccessStore {
  runInTransaction<T>(work: (transaction: AccessTransaction) => Promise<T>): Promise<T>;
}

/**
 * Coordinates pure access rules with persistence, time and request IDs.
 * HTTP adapters authenticate callers first. Methods without an actor scope are
 * owner/system operations; never expose them to agent routes.
 */
export class AccessService {
  constructor(
    private readonly store: AccessStore,
    private readonly now: () => number,
    private readonly uuid: () => string,
  ) {}

  private async saveAccessAndAudit(
    transaction: AccessTransaction,
    access: Access,
    actorId: string,
    action: string,
  ): Promise<Access> {
    await transaction.saveAccessRequest(access);
    await transaction.recordAuditEvent(access.id, actorId, action, this.now());

    return access;
  }

  /**
   * Reads persist observed expiry inside the caller's transaction. Missing and
   * other-agent requests share one error to avoid revealing request ownership.
   */
  private async loadAccessAndExpireIfNeeded(
    transaction: AccessTransaction,
    id: string,
    actorId?: string,
  ): Promise<Access> {
    const stored = await transaction.findAccessById(id);

    if (!stored || (actorId !== undefined && stored.actorId !== actorId)) {
      throw new DomainError(AccessErrorCode.NOT_FOUND);
    }

    const current = expire(stored, this.now());

    return current.status === stored.status
      ? stored
      : this.saveAccessAndAudit(transaction, current, 'system', AccessAuditAction.EXPIRED);
  }

  /** A retry key belongs to one exact payload for one agent, even after the request expires. */
  request(input: RequestInput, actorId: string): Promise<Access> {
    return this.store.runInTransaction(async (transaction) => {
      const prior = await transaction.findAccessByIdempotencyKey(actorId, input.idempotencyKey);

      if (prior) {
        if (!sameRequest(prior, input)) {
          throw new DomainError(AccessErrorCode.CONFLICT);
        }

        return this.loadAccessAndExpireIfNeeded(transaction, prior.id, actorId);
      }

      return this.saveAccessAndAudit(
        transaction,
        createAccess(input, actorId, this.uuid(), this.now()),
        actorId,
        AccessAuditAction.REQUESTED,
      );
    });
  }

  get(id: string, actorId: string): Promise<Access> {
    return this.store.runInTransaction((transaction) =>
      this.loadAccessAndExpireIfNeeded(transaction, id, actorId),
    );
  }

  list(): Promise<Access[]> {
    return this.store.runInTransaction(async (transaction) => {
      const requests = await transaction.listAccessRequests();
      const current: Access[] = [];

      for (const request of requests) {
        current.push(await this.loadAccessAndExpireIfNeeded(transaction, request.id));
      }

      return current;
    });
  }

  async decision(id: string, decision: AccessDecision): Promise<Access> {
    /* Commit expiry separately so rejecting a stale decision cannot roll expiry back. */
    await this.store.runInTransaction((transaction) =>
      this.loadAccessAndExpireIfNeeded(transaction, id),
    );

    return this.store.runInTransaction(async (transaction) => {
      const access = await this.loadAccessAndExpireIfNeeded(transaction, id);

      return this.saveAccessAndAudit(
        transaction,
        decide(access, decision, this.now()),
        'owner',
        decision,
      );
    });
  }

  release(id: string, actorId?: string): Promise<Access> {
    return this.store.runInTransaction(async (transaction) => {
      const access = await this.loadAccessAndExpireIfNeeded(transaction, id, actorId);
      const next = revoke(access);

      return next.status === access.status
        ? access
        : this.saveAccessAndAudit(transaction, next, actorId ?? 'owner', AccessAuditAction.REVOKED);
    });
  }

  /** Fail closed after restart; preserve history but never revive an active authorization. */
  async invalidateOnStartup(): Promise<void> {
    await this.store.runInTransaction(async (transaction) => {
      for (const item of await transaction.listAccessRequests()) {
        const next = revoke(expire(item, this.now()));

        if (next.status !== item.status) {
          await this.saveAccessAndAudit(
            transaction,
            next,
            'system',
            AccessAuditAction.RESTART_INVALIDATED,
          );
        }
      }
    });
  }

  audit(): Promise<AuditEntry[]> {
    return this.store.runInTransaction((transaction) => transaction.listAuditEvents());
  }
}
