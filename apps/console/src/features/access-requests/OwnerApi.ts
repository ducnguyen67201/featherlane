import { AccessDecision, AccessListSchema, type Access } from '@featherlane/contracts';

/* Revocation has a separate endpoint and is not a valid approval decision. */
export const OwnerAction = {
  ...AccessDecision,
  REVOKE: 'revoke',
} as const;

export type OwnerAction = (typeof OwnerAction)[keyof typeof OwnerAction];

/** Owner credentials are used only for same-origin requests, never saved or logged. */
async function sendOwnerRequest(
  path: string,
  ownerToken: string,
  signal: AbortSignal,
  action?: OwnerAction,
): Promise<unknown> {
  const response = await fetch('/v1/owner' + path, {
    method: action ? 'POST' : 'GET',
    headers: {
      authorization: 'Bearer ' + ownerToken,
      ...(action ? { 'content-type': 'application/json' } : {}),
    },
    ...(action
      ? { body: JSON.stringify(action === OwnerAction.REVOKE ? {} : { decision: action }) }
      : {}),
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    cache: 'no-store',
    redirect: 'error',
  });

  if (!response.ok) {
    throw new Error('Owner request failed');
  }

  const responseBody: unknown = await response.json();

  return responseBody;
}

/** Validate snapshots at the HTTP boundary before the UI displays them. */
export async function fetchAccessRequests(
  ownerToken: string,
  signal: AbortSignal,
): Promise<Access[]> {
  return AccessListSchema.parse(await sendOwnerRequest('/access', ownerToken, signal));
}

/** Submit the exact request ID; the broker remains authoritative for state and expiry. */
export async function sendOwnerAction(
  ownerToken: string,
  requestId: string,
  action: OwnerAction,
  signal: AbortSignal,
): Promise<void> {
  const endpoint = action === OwnerAction.REVOKE ? 'revoke' : 'decision';

  await sendOwnerRequest(
    '/access/' + encodeURIComponent(requestId) + '/' + endpoint,
    ownerToken,
    signal,
    action,
  );
}
