import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AccessDecision,
  AccessStatus,
  AccessListSchema,
  type Access,
} from '@featherlane/contracts';
import './style.css';

/* Revocation has its own endpoint; it must not become a valid approval decision. */
const OwnerAction = {
  ...AccessDecision,
  REVOKE: 'revoke',
} as const;

type OwnerAction = (typeof OwnerAction)[keyof typeof OwnerAction];

/**
 * Owner-only demo console. The token stays in React state, not browser storage;
 * this reduces persistence but does not protect against compromised page scripts.
 * Loaded requests are a snapshot, not a live subscription. The broker rechecks
 * state and expiry when an owner submits a decision, regardless of displayed status.
 */
function App() {
  const [token, setToken] = useState('');
  const [items, setItems] = useState<Access[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function request(path: string, decision?: OwnerAction) {
    const response = await fetch('/v1/owner' + path, {
      method: decision ? 'POST' : 'GET',
      headers: {
        authorization: 'Bearer ' + token,
        ...(decision ? { 'content-type': 'application/json' } : {}),
      },
      ...(decision
        ? { body: JSON.stringify(decision === OwnerAction.REVOKE ? {} : { decision }) }
        : {}),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(
        'Request failed (' +
          response.status +
          '). Check the owner token or refresh expired requests.',
      );
    }

    return response.json() as Promise<unknown>;
  }

  async function refresh() {
    setItems(AccessListSchema.parse(await request('/access')));
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');

    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <span className="brand">Featherlane</span>
        <span className="tag">LOCAL · SYNTHETIC DEMO</span>
      </header>
      <h1>Access, with your say.</h1>
      <p>Approve exact account requests. This foundation does not log agents into real websites.</p>
      <section className="credentials">
        <label htmlFor="token">Owner token</label>
        <input
          id="token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
            setItems([]);
          }}
          placeholder="From your local owner-token.txt"
        />
        <button disabled={busy || !token} onClick={() => void run(refresh)}>
          Load requests
        </button>
        <button
          className="secondary"
          onClick={() => {
            setToken('');
            setItems([]);
            setError('');
          }}
        >
          Lock console
        </button>
        <small>Stored only in this page’s memory. Never share this token with an agent.</small>
      </section>
      {error && <p role="alert">{error}</p>}
      <h2>Requests</h2>
      {!items.length && (
        <p>
          No requests loaded. Use the CLI to request staging or production access, then load
          requests.
        </p>
      )}
      {items.map((item) => (
        <article key={item.id}>
          <div className="row">
            <h3>{item.connectionId}</h3>
            <span className="tag">{item.status}</span>
          </div>
          <dl>
            <dt>Agent</dt>
            <dd>{item.actorId}</dd>
            <dt>Destination</dt>
            <dd>{item.origin}</dd>
            <dt>Purpose (agent supplied)</dt>
            <dd>{item.purpose}</dd>
            <dt>Expires</dt>
            <dd>{new Date(item.expiresAt).toLocaleString()}</dd>
            <dt>Request ID</dt>
            <dd>{item.id}</dd>
          </dl>
          {item.status === AccessStatus.PENDING && (
            <div className="actions">
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await request('/access/' + item.id + '/decision', OwnerAction.APPROVE);
                    await refresh();
                  })
                }
              >
                Approve once
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await request('/access/' + item.id + '/decision', OwnerAction.DENY);
                    await refresh();
                  })
                }
              >
                Deny
              </button>
            </div>
          )}
          {item.status === AccessStatus.GRANTED && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await request('/access/' + item.id + '/revoke', OwnerAction.REVOKE);
                  await refresh();
                })
              }
            >
              Revoke grant
            </button>
          )}
        </article>
      ))}
      <footer>
        All accounts are fixtures. Approval authorizes this request only; it does not create a
        reusable policy.
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
