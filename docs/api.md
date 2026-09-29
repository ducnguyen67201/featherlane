# Synthetic API v1

Broker binds only 127.0.0.1, default port 4318. All JSON errors omit request bodies and credentials.

| Endpoint                           | Credential        | Purpose                                            |
| ---------------------------------- | ----------------- | -------------------------------------------------- |
| GET /health                        | none              | Synthetic-mode and unsupported browser capability  |
| GET /v1/connections                | agent             | List fixture destinations and allow/ask/deny rules |
| POST /v1/access                    | agent             | Create or replay an identical scoped request       |
| GET /v1/access/:id                 | originating agent | Read authoritative current state                   |
| POST /v1/access/:id/release        | originating agent | Revoke pending/granted record                      |
| POST /v1/browser/execute           | agent             | Always 501: runtime unimplemented                  |
| GET /v1/owner/access               | owner             | Up to 200 recent records                           |
| GET /v1/owner/audit                | owner             | Up to 200 audit entries                            |
| POST /v1/owner/access/:id/decision | owner             | Approve/deny a pending request once                |
| POST /v1/owner/access/:id/revoke   | owner             | Revoke a request/grant                             |

Use `Authorization: Bearer TOKEN`; owner and agent credentials are distinct and not interchangeable.

Request body:

```json
{
  "connectionId": "production",
  "purpose": "Run synthetic test",
  "ttlSeconds": 300,
  "idempotencyKey": "ac994391-bf37-44ad-bd57-09a97622a62c"
}
```

Extra fields are rejected. TTL is 30–900 seconds; purpose is 1–300 trimmed characters. The server chooses origin, actor, policy version and record ID. Purpose is untrusted agent-supplied text, not evidence of intent.

Decision body: `{"decision":"approve"}` or `{"decision":"deny"}`. Request ID binds the exact immutable scope. A second decision, late approval or changed idempotency scope returns 409. Unknown records and other agents' records both return 404. Invalid bodies return 400; missing/wrong role credentials return 401.

Possible states: pending, granted, denied, expired, revoked. None represents a logged-in browser or permission to access a real site.
