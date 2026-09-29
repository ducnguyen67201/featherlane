# Architecture: foundation ADR

## Comments for future maintainers

Use `/** ... */` above important APIs/classes to explain their responsibility and contract; editors also display these comments on hover. Use `/* ... */` inside workflows to explain decisions that are not obvious from the statements alone.

Document the facts a future change must preserve: who authenticates the caller, which role owns a capability, transaction/expiry behavior, time units, credential handling, and what a scaffold does not implement. Keep comments concise and next to the relevant code. Use parameter/return tags or examples only when they add information beyond the types and names.

Simple getters and self-explanatory statements do not need narration. Comments are maintained with the code, not a substitute for clear names, small functions, tests, or architecture documentation. Never describe an intended future protection as an existing guarantee.

## Helper ownership and discoverability

Shared access vocabulary lives in `packages/contracts/src/AccessValues.ts`: `AccessDecision`, `AccessStatus`, and `ConnectionPolicy` are named `as const` objects with derived union types. The contract schemas build their enums from these objects; business logic and the UI use the named members rather than repeated string literals. Their lowercase values remain the existing wire/database values. Domain code imports them through the framework-free `@featherlane/contracts/access-values` export. Prisma keeps its own schema enum, with a test checking that its generated type and values match the public statuses.

Broker error codes and audit actions stay with their owning domain/application modules. The console's local `OwnerAction` adds revocation for its separate endpoint; it does not broaden the approve/deny HTTP schema. Independently versioned private consumers retain their own wire contract until they adopt a published package.

Helpers live with the code that owns their meaning, not in a global utils directory.

| Concern                             | Home                               | Example                                   |
| ----------------------------------- | ---------------------------------- | ----------------------------------------- |
| SDK endpoint validation             | packages/client/src/validation/    | BrokerUrl.ts → validateAndFormatBrokerUrl |
| Access-policy rules                 | apps/broker/src/domain/            | Access.ts → expire, decide                |
| Process environment validation      | Each process's src/Env.ts          | loadCliEnv, loadBrokerEnv                 |
| External JSON configuration loading | Owning application's src/Config.ts | loadAgentConfig                           |
| Shared wire schemas                 | packages/contracts/src/            | RequestInputSchema                        |

The client constructor delegates URL checking and consistent address formatting to validateAndFormatBrokerUrl. The module has no I/O or environment reads; private predicates describe the component and protocol checks. It is an internal SDK module, not a new public package export.

Start with a function in its feature file; split it into a descriptive module when the responsibility deserves independent tests or obscures the caller. Add a category such as validation only when it clarifies ownership. Promote to a focused package when multiple actual packages need the same behavior. Avoid generic common/utils packages, giant re-export barrels, and names like validateUrl that hide which URL policy is enforced.

The private consumer maintains its own adapter validation because it is an independent HTTP consumer, not an SDK consumer. It currently permits loopback HTTP only for localhost/127.0.0.1, while the SDK also permits [::1]. This refactor preserves both policies; unification requires an explicit compatibility decision and a published SDK dependency. Neither helper is a general SSRF defense or DNS validator.

## Readable formatting

Deprecated APIs are rejected by typed ESLint through `@typescript-eslint/no-deprecated`. The dedicated `tsconfig.eslint.json` includes TypeScript source/tests and JavaScript tooling without changing application build output. Use supported library APIs instead of hiding deprecation diagnostics. The existing `pnpm lint` CI step enforces this rule.

Run `pnpm format` to apply the repository's readability rules. Prettier handles indentation, wrapping and punctuation; ESLint Stylistic adds blank lines between functions, methods, declarations and logical blocks. Conditionals and loops always use braces. Related short declarations may stay grouped; a blank line is not required after every statement.

The formatter first normalizes wrapping, applies ESLint fixes, then formats inserted braces. CI checks both `pnpm lint` and `pnpm format:check`. The 100-column print width is unchanged.

VS Code/Cursor users can install the two recommended extensions (ESLint and Prettier). Repository-local settings enable Prettier format-on-save and ESLint fixes on explicit save. Without editor extensions, `pnpm format` still works. No global editor settings are changed.

Status: accepted for the synthetic foundation; production security is not established.

## Decisions

Use Node 24, strict TypeScript, pnpm, Fastify, Zod, Prisma ORM with SQLite, React/Vite, and the MCP TypeScript SDK. Keep a modular monolith rather than deploy microservices before usage demands them.

The dependency direction is adapters → application → domain. Domain imports only contract types, framework-free contract values and sibling domain modules. The application depends on an asynchronous AccessStore port; PrismaAccessStore implements it over SQLite. The callback receives an AccessTransaction port, so application/domain code never imports Prisma or the generated client. Fastify handles transport authentication/validation. CLI/MCP consume the public client, never broker internals. Shared contracts contain no secrets or server framework code.

State transitions and audit inserts commit in one Prisma interactive transaction using only its transaction-scoped client. Every database operation is awaited. The SQLite adapter serializes transactions on its connection; this replaces the old synchronous immediate-transaction API, not a promise wrapper around it. Callbacks contain database work only and may retry rolled-back unique/write conflicts up to twice. A unique actor/idempotency-key index prevents duplicate requests. Approvals are addressed to immutable request IDs, checked against pending state and deadline, and cannot be reused. Approval does not extend TTL. Agent identity comes from a server-side token mapping, not a request field.

## Console UI

`apps/console` uses React/Vite with `@mantine/core` and `@mantine/hooks`, pinned together. Import Mantine controls directly; do not copy component source or add generic wrapper components. Use its default styles and responsive layout props. There is no custom global stylesheet, Tailwind setup, or PostCSS customization to maintain. Introduce CSS modules or PostCSS only when actual custom styles need them.

- `src/Main.tsx`: mount React, import Mantine CSS, and install the provider. The color scheme is fixed to light; the console does not save a theme preference.
- `src/Theme.ts`: small shared branding configuration (color, radius and typography).
- `src/features/access-requests/AccessRequestsPage.tsx`: page composition, owner input, loading/error/empty states.
- `src/features/access-requests/AccessRequestCard.tsx`: request details and available decision buttons. Agent-supplied text remains plain text.
- `src/features/access-requests/UseAccessRequests.ts`: in-memory owner token, request snapshot, manual refresh and mutation state. Token changes and locking cancel pending work and discard stale results. Cancellation cannot undo an action already received by the broker.
- `src/features/access-requests/OwnerApi.ts`: same-origin owner HTTP calls, timeout/cancellation, response validation and local action vocabulary. Revocation stays separate from approve/deny. Tokens never enter browser storage, URLs or logs.

Mantine owns generic UI implementation; Featherlane still owns application behavior, accessibility integration and dependency upgrades. Do not introduce a router, global state library, form framework or shared UI package until a real requirement needs one. The public console has no private-repository dependency. Tests cover owner HTTP contracts and browser approval/revocation/denial, error handling, mobile wrapping, reload and in-flight locking/token changes.

## Runtime flow

Agent CLI/MCP → thin HTTP client → authenticated broker → deterministic rule → grant / owner approval / denial.

Owner UI → separate owner-authenticated endpoint → exact pending request decision.

All these grants are synthetic. The browser worker reports protectedExecution=false and throws on execute. The broker browser endpoint returns 501. There is no secret provider, session material, proxy, credential injection, or privileged execution path yet.

The [deferred runtime-trust problem](DeferredRuntimeTrust.md) records the unresolved bridge from an approved request to a trustworthy browser/device/sandbox. It covers forged targets, integration identity, destination changes and same-user isolation limits. Proposed tool/target examples are not accepted contracts; no real credential delivery is authorized by that note.

## Persistence and events

The local `pnpm dev` command generates the Prisma client and applies existing migrations/data import before starting either server. Failures stop the command. This preparation happens once, outside the broker and its hot-reload loop; it never creates migrations or resets/baselines databases. Direct broker startup and production deployment retain explicit database preparation. See the database guide for selecting the same database as the broker and safely upgrading legacy data.

Prisma models live in apps/broker/prisma/schema.prisma. Access records have typed columns, not a JSON body; millisecond timestamps use BigInt in the database and numbers at the HTTP boundary. Schema changes use committed Prisma migrations, applied explicitly outside broker startup. A separate validated data import preserves legacy JSON rows and audit IDs; the broker refuses an incomplete import or an unsupported database-state version. See [database setup and upgrade](Database.md). Do not edit applied migrations, use raw application SQL, or reset existing data. Audit entries are transactional records, not a tamper-proof distributed event log. Do not add a message broker now.

When asynchronous protected execution is implemented, introduce an outbox committed with the domain state, idempotent worker handlers, and reconciliation. Never rely on event delivery alone to enforce revocation. A worker must verify authoritative grant state immediately before use. TOCTOU resistance is future research/implementation, not a property of this demo.

Expiry is enforced on reads and transitions. Startup invalidates all active/pending records because there are no restorable protected sessions. This schema/list implementation is intentionally single-process and small-data; it is not a scale benchmark.

## Public/private boundary

Public owns the self-hostable broker, contracts, SDK, CLI/MCP, future execution adapters, and basic owner approvals. Private owns future managed hosting, organization administration, billing and enterprise operations. These private features are NOT implemented by the local consumer example.

Private is a standalone Git/pnpm repo using public HTTP. Do not deep-import sibling source, automatically synchronize private files into public, or make public CI require private credentials. Pin public SDK releases when available; until then use a small independently tested HTTP adapter. Do not implement core access enforcement exclusively in proprietary code.

Each repository has its own branches, reviews and CI. A parent editor workspace does not merge history, dependency resolution or permissions. Separate editor/agent sessions are needed if you do not want an agent to see both directories.

## Scaling triggers

1. Ship one safe local protected-runtime vertical slice, not every browser/mobile backend.
2. Replace SQLite through the store port only when shared control-plane state or measured load requires it.
3. Add queue/outbox delivery only for real background work.
4. Keep session workers separately isolated when they hold credentials; do not confuse a TypeScript module boundary with process isolation.
5. Add tenant-aware identities, durable approval delivery and operational controls before cloud multi-tenancy.

## Developer conventions

- Validate wire input with contracts; route caller identity is never client supplied.
- Keep clocks and IDs injected in application code for deterministic tests.
- Do not log payloads, bearer tokens, cookies, or browser profiles.
- Use explicit errors; clients receive stable safe errors, not upstream bodies.
- Avoid a generic policy language until the actual account-access use cases need one.
- One independently usable public repository, one private consumer repository. No parent package workspace.
- CI executes static checks, unit tests, build, and local integration. No publishing workflow is installed.
