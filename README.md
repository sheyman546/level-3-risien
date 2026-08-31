# StellarFlow Hub

**Smart Payment & Escrow Platform on Stellar/Soroban**

A production-oriented monorepo demonstrating the full Web3 engineering stack:
advanced Soroban smart contracts, cross-contract communication, event-driven
indexing with real-time updates, responsive frontend, automated testing,
CI/CD, and testnet deployment.

> **Project definition**: StellarFlow Hub is a payment and escrow dApp where
> users create payments, lock funds in escrow, release/refund them, and see
> real-time updates when contract actions happen — built as a serious
> portfolio/capstone project rather than a basic CRUD dApp.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository structure](#repository-structure)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Contract deployment](#contract-deployment)
- [Frontend setup](#frontend-setup)
- [Testing](#testing)
- [CI/CD](#cicd)
- [Security considerations](#security-considerations)
- [Known limitations](#known-limitations)
- [Demo](#demo)

---

## Features

**Smart contracts (3 Soroban contracts, Rust)**

- `payment` — create / approve / execute / cancel payments with status tracking
- `escrow` — lock funds, release, refund, open & resolve disputes
- `registry` — service registry that lets the payment contract discover the
  escrow contract by key

**Inter-contract communication**

```
Payment Contract ──► Registry Contract ──► Escrow Contract
        │                  │                    │
        │          get_contract("escrow")       │
        └────────── try_create_escrow(...) ──────┘
```

The payment contract resolves the escrow contract through the registry and
invokes it cross-contract (`try_` variants with error mapping).

**Event streaming & real-time updates**

- Contracts emit typed events: `payment_created`, `payment_approved`,
  `payment_completed`, `payment_cancelled`, `escrow_created`,
  `escrow_released`, `escrow_refunded`, `escrow_disputed`, `escrow_resolved`
- `services/event-indexer` listens to Soroban RPC events, normalizes them into
  a database, and pushes updates to the frontend over **SSE**
- The activity page updates without a refresh

**CI/CD pipeline**

- GitHub Actions: `ci.yml`, `contracts.yml`, `frontend.yml`, `deploy.yml`
- Lint → typecheck → frontend tests → contract tests → build → deploy

**Smart contract deployment workflow**

- `pnpm contracts:deploy:local | :testnet | :mainnet` (via `stellar` CLI)
- `pnpm contracts:verify` — verifies deployments by invoking read functions
- Secrets live in the environment / GitHub secrets — never hard-coded

**Mobile responsive frontend**

- Next.js + Tailwind; dashboard, payments, escrow, and activity pages
- Mobile navigation, wallet connect, responsive grids and forms

**Error handling & loading states**

- Explicit states: connecting wallet, waiting for approval, submitting,
  transaction pending, confirmed, failed
- Handles wallet rejection, insufficient balance, invalid input, contract
  failure, network failure, timeouts, API failure, and indexer delay
- Typed error hierarchy (`packages/sdk/src/errors.ts`, `apps/web/lib/errors.ts`)

**Testing**

- Rust contract tests (28): full flows, cross-contract calls, unauthorized
  callers, invalid amounts, insufficient balance, events, disputes
- SDK tests (9): client read/write, error mapping, payment client
- Frontend tests (20): wallet connect, form validation, loading/error states,
  transaction flow, activity feed
- Indexer tests (18): event normalization + processors

**Production-ready architecture**

- Clear boundaries: UI → hooks → SDK → contract client → Soroban
- TypeScript + Zod validation + centralized config + typed error types
- Structured logging, health checks, rate-limited APIs, DB migrations

**Documentation & demo**

- `docs/architecture.md`, `docs/contracts.md`, `docs/frontend.md`,
  `docs/deployment.md`, `docs/testing.md`, `docs/demo.md`
- A full walkthrough demo in `docs/demo.md`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        apps/web (Next.js)                   │
│  pages ── hooks ── lib/contracts ── packages/sdk ── Soroban │
└──────────────┬──────────────────────────────────────────────┘
               │ SSE / REST
┌──────────────▼──────────────────────────────────────────────┐
│                services/event-indexer                       │
│   RPC listener ──► processors ──► Postgres ──► SSE server   │
└──────────────┬──────────────────────────────────────────────┘
               │ events
┌──────────────▼──────────────────────────────────────────────┐
│          contracts/ (Soroban, Rust)                         │
│   registry ◄── payment ──► escrow  (cross-contract calls)   │
└─────────────────────────────────────────────────────────────┘
```

See [docs/architecture.md](docs/architecture.md) for the full write-up.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Smart contracts | Soroban SDK 21 / Rust |
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS |
| Validation | Zod |
| Frontend tests | Vitest + React Testing Library |
| Contract tests | Rust `#[test]` + soroban testutils |
| Package manager | pnpm (workspaces + Turborepo) |
| Database | PostgreSQL (via docker-compose) |
| Realtime | SSE (Server-Sent Events) |
| SDK | `@stellar/stellar-sdk` v12 (spec-driven `contract.Client`) |
| Wallet | Freighter |
| CI/CD | GitHub Actions |
| Deployment | Vercel + Stellar testnet |
| Containerization | Docker |

---

## Repository structure

```
stellarflow-hub/
├── apps/
│   └── web/                      # Next.js frontend
│       ├── app/                  # pages: dashboard, payments, escrow, activity
│       ├── components/           # ui, payments, escrow, wallet, notifications
│       ├── hooks/                # useWallet, useContractCall, usePayments, ...
│       ├── lib/                  # stellar, contracts, api, validation
│       └── tests/                # Vitest suites
├── contracts/
│   ├── payment/  escrow/  registry/   # Soroban contracts (+ test.rs)
│   ├── scripts/                      # deploy.ts, upgrade.ts, verify.ts, common.ts
│   └── Cargo.toml                    # workspace
├── packages/
│   ├── sdk/                      # typed contract clients + errors
│   ├── types/                    # shared domain types
│   ├── config/                   # centralized env config
│   └── test-utils/               # shared test fixtures
├── services/
│   └── event-indexer/            # RPC listener, processors, DB, SSE server
├── scripts/                      # setup, deploy, seed
├── docs/                         # architecture, contracts, frontend, ...
├── .github/workflows/            # ci, contracts, frontend, deploy
├── .env.example
├── docker-compose.yml
└── package.json
```

---

## Local setup

Prerequisites: Node.js 20+, pnpm 10+, Docker, and (for contracts) Rust with
the `wasm32v1-none` target and the `stellar` CLI (≥ 21.5).

```bash
# 1. install dependencies
pnpm install

# 2. copy environment
cp .env.example .env

# 3. start Postgres for the indexer
docker compose up -d db

# 4. run the indexer (needs a funded Stellar account + RPC URL in .env)
pnpm --filter @stellarflow/event-indexer dev

# 5. run the web app
pnpm --filter @stellarflow/web dev
```

Point your browser at http://localhost:3000.

---

## Environment variables

See `.env.example` for the full list with comments. Key variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_STELLARFLOW_NETWORK` | `testnet` / `local` / `mainnet` |
| `NEXT_PUBLIC_STELLARFLOW_PAYMENT_CONTRACT` | Payment contract address (C...) |
| `NEXT_PUBLIC_STELLARFLOW_ESCROW_CONTRACT` | Escrow contract address (C...) |
| `NEXT_PUBLIC_STELLARFLOW_REGISTRY_CONTRACT` | Registry contract address (C...) |
| `NEXT_PUBLIC_STELLARFLOW_RPC_URL` | Soroban RPC endpoint |
| `STELLARFLOW_RPC_URL` | Indexer RPC endpoint (server-side) |
| `STELLARFLOW_DATABASE_URL` | Postgres connection string |
| `STELLARFLOW_SECRET_KEY` | Deployer/seed secret key (never commit!) |

After `pnpm contracts:deploy:*`, contract addresses are written to
`.env.contracts` — copy the `NEXT_PUBLIC_*` values into `.env`.

---

## Contract deployment

```bash
# build all contracts to WASM
pnpm contracts:build

# deploy + initialize + register on each network (requires STELLARFLOW_SECRET_KEY)
pnpm contracts:deploy:local
pnpm contracts:deploy:testnet
pnpm contracts:deploy:mainnet

# verify the deployments by invoking read functions
pnpm contracts:verify -- --network testnet
```

The deploy script:

1. builds all contracts (`stellar contract build`)
2. deploys registry, escrow, payment
3. initializes each contract (deployer = admin)
4. registers the escrow contract in the registry
5. writes addresses to `.env.contracts`

Private keys are read from the environment (`STELLARFLOW_SECRET_KEY`) and the
stellar CLI keychain — never hard-coded. See
[docs/deployment.md](docs/deployment.md) for details.

---

## Frontend setup

The web app reads contract addresses and the RPC URL from `NEXT_PUBLIC_*` env
vars, connects via Freighter, and uses the SDK for typed contract calls.

- Pages: `/` (landing), `/dashboard`, `/payments`, `/payments/new`, `/escrow`,
  `/activity`
- Real-time activity via `useActivity` hook subscribing to the indexer's SSE
  endpoint (`/api/activity` proxy in the app)
- See [docs/frontend.md](docs/frontend.md) for the component/hook map.

---

## Testing

```bash
# everything
pnpm test

# contract tests (Rust)
cd contracts && cargo test --workspace

# frontend tests
pnpm --filter @stellarflow/web test

# SDK tests
pnpm --filter @stellarflow/sdk test

# indexer tests
pnpm --filter @stellarflow/event-indexer test
```

Coverage highlights (meaningful, not vanity 100%):

- **Contracts**: full payment flow ends with funds locked in escrow, admin
  approval, unauthorized caller rejection, invalid amounts, expired deadlines,
  registry-missing errors, escrow transfer failure surfacing, release/refund/
  dispute resolution, event counts, list queries
- **Frontend**: wallet connection, payment form validation, loading/error
  states, successful transaction flow, activity feed rendering
- **Indexer**: raw RPC event → normalized activity mapping for every contract
  event type

See [docs/testing.md](docs/testing.md) for the full matrix.

---

## CI/CD

Four GitHub Actions workflows:

| Workflow | Runs on | What it does |
| --- | --- | --- |
| `ci.yml` | PRs | install, lint, typecheck, unit tests, build |
| `contracts.yml` | PRs touching `contracts/` | `cargo fmt --check`, `cargo test --workspace`, WASM build |
| `frontend.yml` | PRs touching `apps/web` | typecheck, lint, vitest, `next build` |
| `deploy.yml` | push to `main` | builds contracts, runs `deploy:testnet`, deploys web |

Deployment credentials (secret keys, RPC URLs) come from GitHub Secrets, e.g.
`STELLARFLOW_SECRET_KEY`. See [docs/deployment.md](docs/deployment.md).

---

## Security considerations

- **Auth**: every state-changing function requires `require_auth()` on the
  acting address; roles (admin/creator/depositor/beneficiary) are enforced in
  contract code.
- **Cross-contract calls**: use `try_` variants and map failures to typed
  errors instead of panicking.
- **Keys**: private keys only in env/GitHub Secrets; `.env*` and
  `*.wasm` artifacts are gitignored.
- **Registry**: only the admin (or the contract itself) may register entries;
  duplicate registration is rejected.
- **Input validation**: amounts > 0, deadlines in the future, status
  transitions validated before any state change or transfer.
- **Indexer**: reads are normalized and validated before being persisted.
- Rate limiting on APIs and health checks are part of the service layer.

---

## Known limitations

- The event indexer polls Soroban RPC for event logs (no WebSocket push yet);
  SSE is the realtime transport to the browser.
- The web app requires Freighter; other wallets need a small adapter.
- Token transfers use the Stellar Asset Contract — native XLM payments would
  use a different transfer path.
- Contracts target Soroban SDK 21 / Protocol 22; older networks are
  unsupported.
- No mainnet deployment has been executed; the flow is verified against
  testnet tooling.

---

## Demo

The canonical end-to-end flow:

```
Connect wallet
      │
      ▼
Create payment            → payment_created event
      │
      ▼
Approve payment           → payment_approved event
      │
      ▼
Execute payment           → cross-contract call creates escrow
                            (escrow_created event, funds locked)
      │
      ▼
Indexer detects events    → normalized into Postgres
      │
      ▼
Frontend updates          → activity feed + status badges update live (SSE)
      │
      ▼
Recipient releases escrow → escrow_released event → recipient paid
```

Follow the step-by-step script in [docs/demo.md](docs/demo.md), or run
`pnpm seed` (after deploying + configuring env) to populate demo data.

---

## License

MIT — use it as a reference for your own portfolio or capstone project.
