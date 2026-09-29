import { z } from 'zod';
import { AccessDecision, AccessStatus, ConnectionPolicy } from './AccessValues.js';

export { AccessDecision, AccessStatus, ConnectionPolicy } from './AccessValues.js';

export const ConnectionSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  origin: z.url(),
  policy: z.enum(ConnectionPolicy),
  synthetic: z.literal(true),
});

export type Connection = z.infer<typeof ConnectionSchema>;

/**
 * Agent-controlled input only. Identity, destination and policy come from the
 * broker, not this payload. Purpose is an agent's explanation, not verified intent.
 */
export const RequestInputSchema = z.strictObject({
  connectionId: z.string().min(1).max(80),
  purpose: z.string().trim().min(1).max(300),
  ttlSeconds: z.number().int().min(30).max(900).default(300),
  idempotencyKey: z.uuid(),
});

export type RequestInput = z.infer<typeof RequestInputSchema>;

/**
 * Public synthetic authorization record, never a credential or browser session.
 * Timestamps are Unix milliseconds; ttlSeconds starts when the request is created,
 * not when an owner approves it. The synthetic marker prevents claiming real access.
 */
export const AccessSchema = z.strictObject({
  id: z.uuid(),
  actorId: z.string(),
  connectionId: z.string(),
  origin: z.url(),
  purpose: z.string(),
  ttlSeconds: z.number(),
  idempotencyKey: z.uuid(),
  policyVersion: z.literal('demo-v1'),
  status: z.enum(AccessStatus),
  createdAt: z.number(),
  expiresAt: z.number(),
  synthetic: z.literal(true),
});

export type Access = z.infer<typeof AccessSchema>;

export const DecisionSchema = z.strictObject({ decision: z.enum(AccessDecision) });

export const HealthSchema = z.strictObject({
  service: z.literal('featherlane-broker'),
  protocol: z.literal('v1'),
  mode: z.literal('synthetic'),
  browserExecution: z.literal(false),
});

export const AuditSchema = z.strictObject({
  id: z.number(),
  requestId: z.string(),
  actorId: z.string(),
  action: z.string(),
  at: z.number(),
});

export const ConnectionsSchema = z.array(ConnectionSchema);

export const AccessListSchema = z.array(AccessSchema);

export const AuditListSchema = z.array(AuditSchema);
