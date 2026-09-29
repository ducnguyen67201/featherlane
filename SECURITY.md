# Security status

This is a synthetic development scaffold. Do not use real passwords, API keys, browser profiles, customer data, production accounts, or Internet-facing deployments.

Implemented guardrails:

- Distinct randomly generated owner/agent tokens and authoritative caller mapping.
- Strict request schemas, exact owner decisions, finite grants and idempotency conflicts.
- Transactional audit, expiry, revocation and restart invalidation.
- Loopback binding, Host/Origin checks, body limits and request throttling.
- No owner methods or raw-secret methods exposed to MCP.
- No request-body logging; sanitized errors; owner token kept in page memory only.

Not implemented:

- OS/user/container isolation between an agent and broker.
- Secret vault/provider integration, credential injection or protected browsing.
- Destination/DOM attestation, TOCTOU protection, session-cookie isolation or post-login action enforcement.
- Cryptographic agent identity, secure remote enrollment, tenant isolation or production key rotation.
- Signed/tamper-resistant audit, real-time approval delivery, HA or recovery of live sessions.
- A production browser-console CSP or hardened hosting configuration.

Important: an agent running as your OS user with filesystem access may read broker configuration and owner-token files. Mode 0600 is not protection against that agent. Likewise, opening both repositories in one editor gives an editor agent access to both. Do not claim the demo provides zero-trust isolation.

The [deferred runtime-trust problem](docs/deferred-runtime-trust.md) tracks the work required to authenticate execution targets, bind credential use to the actual destination and isolate session material. It is an open research/implementation record, not a claim that browser attestation or protected execution exists.

The bearer tokens are local fixture credentials, not production secrets. Do not share them or check them into Git. Setup defaults outside this repo; .gitignore covers accidental .env/database artifacts but is not a substitute for secret scanning.

Until a public repository and disclosure channel are established, privately contact the repository owner about security issues; do not publish exploit details or real credentials in issues.
