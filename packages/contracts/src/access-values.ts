/** Owner choices for a pending request. Values are part of the public HTTP contract. */
export const AccessDecision = {
  APPROVE: 'approve',
  DENY: 'deny',
} as const;

export type AccessDecision = (typeof AccessDecision)[keyof typeof AccessDecision];

/** Request lifecycle states, shared by the broker, clients and approval UI. */
export const AccessStatus = {
  PENDING: 'pending',
  GRANTED: 'granted',
  DENIED: 'denied',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
} as const;

export type AccessStatus = (typeof AccessStatus)[keyof typeof AccessStatus];

/** Account policy outcomes are distinct from owner decisions and request states. */
export const ConnectionPolicy = {
  ALLOW: 'allow',
  ASK: 'ask',
  DENY: 'deny',
} as const;

export type ConnectionPolicy = (typeof ConnectionPolicy)[keyof typeof ConnectionPolicy];
