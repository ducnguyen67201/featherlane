import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { Access } from '@featherlane/contracts';
import type { useAccessRequests } from '../apps/console/src/features/access-requests/UseAccessRequests.js';
import {
  fetchAccessRequests,
  OwnerAction,
  sendOwnerAction,
} from '../apps/console/src/features/access-requests/OwnerApi.js';

afterEach(() => vi.unstubAllGlobals());

describe('owner console HTTP boundary', () => {
  it('preserves validated record types from the API through the page state', () => {
    expectTypeOf<ReturnType<typeof fetchAccessRequests>>().toEqualTypeOf<Promise<Access[]>>();

    expectTypeOf<ReturnType<typeof useAccessRequests>['accessRequests']>().toEqualTypeOf<
      Access[]
    >();

    expectTypeOf<ReturnType<typeof useAccessRequests>['accessRequests'][number]>().not.toBeAny();
  });

  it('loads validated snapshots without caching or redirecting owner credentials', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));

    vi.stubGlobal('fetch', transport);

    expect(await fetchAccessRequests('synthetic-owner', new AbortController().signal)).toEqual([]);

    expect(transport).toHaveBeenCalledWith(
      '/v1/owner/access',
      expect.objectContaining({
        method: 'GET',
        headers: { authorization: 'Bearer synthetic-owner' },
        cache: 'no-store',
        redirect: 'error',
      }),
    );
  });

  it.each([
    [OwnerAction.APPROVE, 'decision', { decision: 'approve' }],
    [OwnerAction.DENY, 'decision', { decision: 'deny' }],
    [OwnerAction.REVOKE, 'revoke', {}],
  ])('sends %s to its exact endpoint', async (action, endpoint, body) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));

    vi.stubGlobal('fetch', transport);
    await sendOwnerAction('synthetic-owner', 'request-id', action, new AbortController().signal);

    expect(transport).toHaveBeenCalledWith(
      '/v1/owner/access/request-id/' + endpoint,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  });

  it('rejects malformed snapshots', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(Response.json([{ status: 'invented' }])),
    );

    await expect(
      fetchAccessRequests('synthetic-owner', new AbortController().signal),
    ).rejects.toThrow();
  });

  it('does not expose upstream error bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('private response', { status: 401 })),
    );

    await expect(
      fetchAccessRequests('synthetic-owner', new AbortController().signal),
    ).rejects.toThrow('Owner request failed');
  });

  it('forwards cancellation to the HTTP request', async () => {
    const controller = new AbortController();
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));

    vi.stubGlobal('fetch', transport);
    await fetchAccessRequests('synthetic-owner', controller.signal);
    controller.abort();

    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
