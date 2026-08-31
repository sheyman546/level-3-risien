# Deployment

## Environments

| Environment | RPC | Notes |
| --- | --- | --- |
| local | `http://localhost:8000` | `docker compose --profile localnet up -d` (stellar/quickstart) |
| testnet | `https://soroban-testnet.stellar.org` | Free, fund accounts with the friendbot |
| mainnet | `https://soroban-mainnet.stellar.org` | Real assets — use a dedicated deployer key |

## Prerequisites

- Rust + `wasm32v1-none` target: `rustup target add wasm32v1-none`
- stellar-cli ≥ 21.5: `cargo install stellar-cli --locked`
- pnpm: `corepack enable`
- Docker (for local Postgres / localnet)

## Local setup

```bash
pnpm setup          # checks tooling, creates .env, installs deps, starts Postgres
pnpm localnet:up    # optional: local Stellar network with Soroban RPC
```

## Deploying contracts

```bash
# testnet
STELLARFLOW_SECRET_KEY=S… pnpm deploy:testnet

# local (with the localnet running)
STELLARFLOW_SECRET_KEY=S… pnpm deploy:local
```

`contracts/scripts/deploy.ts`:

1. `stellar contract build` — compiles all contracts to WASM
2. deploys **registry → escrow → payment**
3. initializes each contract (deployer = admin; payment gets the registry address)
4. registers `escrow` in the registry
5. writes contract ids to `.env.contracts`

Copy the values into `.env` (and the `NEXT_PUBLIC_*` variants for the web app).
Never commit the secret key. `STELLARFLOW_SECRET_KEY` must be a **funded**
account on the target network (friendbot on testnet: `curl -X POST
"https://friendbot.stellar.org?addr=G…"`).

## Verification

```bash
pnpm tsx contracts/scripts/verify.ts --network testnet
```

Runs read-only checks: registry admin + `get_contract("escrow")`, escrow
admin, payment admin/registry, and list functions.

## Upgrading a contract

```bash
pnpm tsx contracts/scripts/upgrade.ts --contract escrow --network testnet
```

Rebuilds the WASM and runs `stellar contract upgrade`. Contract storage is
preserved. Requires stellar-cli ≥ 21.4.

## Event indexer

```bash
docker compose up -d postgres      # or: pnpm db:up
cp .env.contracts .env             # ensure contract ids are set
pnpm dev:indexer                   # tsx watch src/index.ts
```

Endpoints: `GET /health`, `GET /events` (SSE), `GET /events/recent`.

In production, run the indexer as a systemd unit / container, point
`STELLARFLOW_INDEXER_URL` at it, and swap the in-memory `Broker` for Redis
pub/sub or Postgres `LISTEN/NOTIFY` if you scale to multiple instances.

## Web app

```bash
pnpm dev:web                       # local dev
pnpm --filter @stellarflow/web build && pnpm --filter @stellarflow/web start
```

For production deploys (e.g. Vercel), see `.github/workflows/deploy.yml`,
which uses `npx vercel --prod` with `VERCEL_TOKEN`, `VERCEL_ORG_ID` and
`VERCEL_PROJECT_ID` secrets, and passes the contract ids as env vars.

## Security checklist

- [ ] Secret keys only in secrets managers / CI secrets — never in the repo
- [ ] Deployer account separate from user accounts; consider a multisig for mainnet
- [ ] Contract admin keys rotated and stored securely
- [ ] `require_auth()` on every privileged function (already enforced in contracts)
- [ ] RPC endpoints pinned to your own node / provider in production
- [ ] Indexer DB backups enabled (events are re-indexable from ledger 0, but cheap to back up)
