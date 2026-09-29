import { useEffect, useRef, useState } from 'react';
import type { Access } from '@featherlane/contracts';
import { fetchAccessRequests, sendOwnerAction, type OwnerAction } from './OwnerApi.js';

/** The page receives validated access records, never raw HTTP response values. */
export interface AccessRequestsState {
  ownerToken: string;
  accessRequests: Access[];
  error: string;
  isBusy: boolean;
  hasLoadedRequests: boolean;
  changeOwnerToken: (nextToken: string) => void;
  lockConsole: () => void;
  loadAccessRequests: () => Promise<void>;
  applyOwnerAction: (requestId: string, action: OwnerAction) => Promise<void>;
}

/**
 * Owns this page's in-memory credentials and manually refreshed snapshot.
 * Cancelling an operation prevents stale UI updates, not a server-side decision
 * already received by the broker. Page memory is not isolation from page scripts.
 */
export function useAccessRequests(): AccessRequestsState {
  const [ownerToken, setOwnerToken] = useState('');
  const [accessRequests, setAccessRequests] = useState<Access[]>([]);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [hasLoadedRequests, setHasLoadedRequests] = useState(false);
  const activeOperation = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      activeOperation.current?.abort();
      activeOperation.current = null;
    },
    [],
  );

  function changeOwnerToken(nextToken: string) {
    activeOperation.current?.abort();
    activeOperation.current = null;
    setOwnerToken(nextToken);
    setAccessRequests([]);
    setError('');
    setIsBusy(false);
    setHasLoadedRequests(false);
  }

  function lockConsole() {
    changeOwnerToken('');
  }

  async function refreshAfterOwnerAction(requestId?: string, action?: OwnerAction) {
    if (!ownerToken || activeOperation.current) {
      return;
    }

    const operation = new AbortController();

    activeOperation.current = operation;
    setIsBusy(true);
    setError('');

    try {
      if (requestId && action) {
        await sendOwnerAction(ownerToken, requestId, action, operation.signal);
      }

      const snapshot = await fetchAccessRequests(ownerToken, operation.signal);

      /* A locked console or changed token must never receive an older snapshot. */
      if (activeOperation.current === operation) {
        setAccessRequests(snapshot);
        setHasLoadedRequests(true);
      }
    } catch {
      if (activeOperation.current === operation) {
        setAccessRequests([]);
        setHasLoadedRequests(false);

        setError(
          'Unable to load or update requests. Check the owner token and broker, then load requests again.',
        );
      }
    } finally {
      if (activeOperation.current === operation) {
        activeOperation.current = null;
        setIsBusy(false);
      }
    }
  }

  function loadAccessRequests() {
    return refreshAfterOwnerAction();
  }

  function applyOwnerAction(requestId: string, action: OwnerAction) {
    return refreshAfterOwnerAction(requestId, action);
  }

  return {
    ownerToken,
    accessRequests,
    error,
    isBusy,
    hasLoadedRequests,
    changeOwnerToken,
    lockConsole,
    loadAccessRequests,
    applyOwnerAction,
  };
}
