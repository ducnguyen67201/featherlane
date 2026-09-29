# Featherlane AI

## Environment configuration

Environment overrides are validated with **T3 Env** (`@t3-oss/env-core`) in each process's `Env.ts`. Application code uses typed values instead of reading `process.env` directly.

- CLI: `FEATHERLANE_AGENT_CONFIG` selects the agent JSON file.
- Broker: `FEATHERLANE_BROKER_CONFIG` selects the broker JSON file.
- Setup: `FEATHERLANE_DEMO_DIR` selects where new demo files are generated.

Defaults remain under `~/.local/share/featherlane-demo`. Missing/empty values use defaults; whitespace-only and NUL paths are rejected. A custom setup directory does not automatically change the CLI/broker paths: point both overrides at the generated files.

T3 Env validates environment values; it does not inject secrets or load dotenv files. JSON file contents are validated separately with Zod. Keep the owner configuration separate from the agent configuration.

To supply an optional local `.env`, create it from the blank `.env.example` and explicitly ask Node to load it, for example:

```sh
pnpm exec node --env-file=.env --import tsx apps/cli/src/Main.ts connections
```

Normal `pnpm dev` and `pnpm cli` use the environment inherited from your shell and do not automatically load `.env`. Never add server credentials to Vite's client-exposed environment.

Developer-first account access for agents, with explicit owner approval when needed.

**Status: runnable synthetic foundation, not a credential-injection product.** Accounts are fixtures under `example.test`. A grant is a database authorization record, not a browser session. No real passwords, sites, or secrets are used.

## Quick start

Prerequisites: pnpm 11.16.0 and a compatible host Node runtime (Node 24 recommended). The repo pins its script runtime to Node 24.14.1 through pnpm's `devEngines.runtime`.

```sh
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Run `pnpm setup` only once; skip it if configuration already exists. Each `pnpm dev` first generates the Prisma client, applies existing database migrations and completes the data-import/readiness step, then starts the broker and console. If preparation fails, neither server starts. Stop any existing broker before running this command. It does not create migration files, reset databases or automatically baseline legacy data.

Open http://127.0.0.1:5173. Enter the token from `~/.local/share/featherlane-demo/owner-token.txt` in the owner console; do not give that file or the broker configuration to an agent. Tokens are randomly generated, files use mode 0600, and setup refuses to overwrite existing configuration.

In another terminal in this repository:

```sh
pnpm cli connections
pnpm cli request --connection staging --purpose "Try automatic fixture access"
pnpm cli request --connection production --purpose "Try owner approval"
pnpm cli request --connection personal --purpose "Try a denied fixture"
pnpm cli status REQUEST_UUID
pnpm cli release REQUEST_UUID
```

- `staging`: automatic synthetic grant.
- `production`: owner approval required. Load requests, then approve or deny.
- `personal`: denied.
- Requests expire after 300 seconds by default; `--ttl` accepts 30–900 seconds.
- `--key UUID` safely retries an identical request. Changed scope with the same key is rejected.
- Broker restart invalidates pending requests and active grants.
- The owner console is manual-refresh and shows at most 200 recent requests.

## Console UI

The console uses Mantine's packaged components and a small theme, not a locally maintained UI library. See [console UI ownership](docs/Architecture.md#console-ui) for where to change the theme, page and approval behavior. Start it with the existing `pnpm dev` command; no separate UI setup is required.

## Database

The broker uses Prisma ORM with SQLite. Edit `apps/broker/prisma/schema.prisma` for models and use typed Prisma queries in the persistence adapter. SQL is confined to versioned migration files, not application queries.

`pnpm dev` runs `pnpm db:generate` followed by `pnpm db:migrate` automatically, once before the watchers start, not on each hot reload. Direct `pnpm dev:broker` and compiled broker startup still require these preparation steps separately. To create a migration after editing models, use `pnpm db:dev` on a disposable database and review its output first. Existing pre-Prisma demo databases need an explicit baseline; follow [database setup and upgrade](docs/Database.md), not a reset. Database commands use `databasePath` from the broker config unless `FEATHERLANE_DATABASE_PATH` is explicitly supplied for tooling. Leave that override unset during normal development: it does not change the database used by the running broker.

## Build and MCP

```sh
pnpm build
node apps/cli/dist/Main.js mcp
```

The last command starts an MCP **stdio** server; use it as a child process of your MCP client, not as an HTTP service. Configure the client with the absolute Node executable and `apps/cli/dist/Main.js` path, argument `mcp`, and environment `FEATHERLANE_AGENT_CONFIG=/absolute/path/to/agent.json`. Never configure it with the owner token.

Exposed tools: `list_connections`, `request_access`, `access_status`, `release_access`. There are no approval, raw-secret, shell, or browser-evaluation tools. Codex/Claude-specific configuration installers are not implemented.

After building, the broker also serves the built console at http://127.0.0.1:4318. Run `pnpm dev:broker` for that mode, or the compiled broker entrypoint with the pinned Node runtime.

## Validate

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:integration
pnpm audit --prod
```

Integration launches only local synthetic services and a headless browser. It exercises built CLI/MCP artifacts and owner-console approval/revocation. No third-party credentials are needed.

## Repository map

```text
apps/
  broker/          Fastify composition, domain rules, application ports, Prisma/SQLite adapter
  cli/             CLI and MCP clients; no owner privileges
  console/         React/Vite owner approval page
  browser-worker/  Fail-closed future runtime boundary; execution unsupported
packages/
  contracts/       Zod wire contracts and types
  client/          Thin authenticated HTTP client
tests/             Domain, store, HTTP, SDK and adapter tests
scripts/           Setup, boundary checking, integration
```

See [architecture](docs/Architecture.md), [API](docs/Api.md), [security boundaries](SECURITY.md), and [contributing](CONTRIBUTING.md).

## Public/private development

This is the intended public product root. It builds independently and never imports private code. The sibling private repository consumes the versioned HTTP API, with its own lockfile, Git history, CI and access permissions. Open the parent `Featherlane.code-workspace` to edit both; run Git/package-manager commands from the appropriate repository terminal.

The public source repository is [ducnguyen67201/featherlane](https://github.com/ducnguyen67201/featherlane). All packages remain `private: true` (preventing accidental npm publication) and `UNLICENSED` pending an explicit license/release decision. Public visibility alone does not make this code open source. No npm packages or deployments have been published.
