# Architecture

StellarFlow Hub is a monorepo (pnpm workspaces + Turborepo) containing three
Soroban contracts, a typed SDK, a Next.js frontend, an event indexer and
deploy tooling.

## System overview

```text
                         ┌─────────────────────────────┐
                         │         Next.js web app     │
                         │  (apps/web)                 │
                         └──────┬──────────┬───────────┘
                                │          │
                        wallet txs (RPC)    │ SSE / REST (activity)
                                │          │
                                ▼          ▼
                    ┌─────────────────┐  ┌──────────────────────────┐
                    │  Soroban RPC    │  │  Event indexer           │
                    │  (testnet/RPC)  │◄─┤  (services/event-indexer)│
                    └────────┬────────┘  └──────┬───────────────────┘
                             │                  │
                    ┌────────▼────────┐         │
                    │  StellarFlow    │         ▼
                    │  contracts      │  ┌──────────────┐
                    │  (Rust/WASM)    │  │  PostgreSQL  │
                    └─────────────────┘  └──────────────┘
```

The SDK (`packages/sdk`) sits between the UI and the contracts: the UI never
talks to the RPC directly.

## Contract architecture

```text
Payment contract                Registry contract              Escrow contract
┌──────────────────┐  discover  ┌──────────────────┐  invoke  ┌──────────────────┐
│ create_payment   │ ─────────► │ register()       │          │ create_escrow()  │
│ approve_payment  │            │ get_contract()   │ ───────► │ release()        │
│ execute_payment  │ ─────────► │                  │          │ refund()         │
│ cancel_payment   │            └──────────────────┘          │ dispute()        │
└──────────────────┘                                           │ resolve_dispute()│
                                                              └──────────────────┘
```

- **registry** — an on-chain service directory. Contracts (or the admin)
  register their addresses under human-readable keys so other contracts can
  discover them at runtime instead of hard-coding addresses.
- **escrow** — holds token funds. Deposits lock funds in the contract;
  release/refund/dispute control who gets them.
- **payment** — orchestrates the payment lifecycle. Executing an approved
  payment asks the registry for the escrow contract, then invokes
  `create_escrow` (cross-contract call) which actually moves the tokens.

This demonstrates real inter-contract communication rather than three
independent contracts.

## Event flow

```text
Contract emits event
        │
        ▼
Stellar RPC (getEvents, polled by the indexer)
        │
        ▼
Event indexer: decode (XDR) → normalize → persist (Postgres) → publish (Broker)
        │
        ├──────────────► SSE subscribers (/events) ──► web app activity feed
        └──────────────► REST fallback (/events/recent)
```

The indexer keeps a cursor (last indexed ledger) in Postgres so it resumes
after restarts. `emittedAt` is approximated from the latest ledger close time
returned by RPC.

## Layer boundaries

UI (`components/`, `pages/`) → hooks (`hooks/`) → typed clients
(`packages/sdk`) → `@stellar/stellar-sdk` → Soroban RPC.

Business logic lives in the SDK, not in React components. The SDK is also
used by the seed script and tooling, so the contract interface is defined once.

## Repository layout

```text
apps/web                 Next.js frontend (App Router, Tailwind, Zod)
contracts/               Soroban contracts (Rust) + stellar-cli deploy scripts
packages/config          centralized, zod-validated environment config
packages/sdk             typed contract clients + error hierarchy
packages/types           shared domain types
packages/test-utils      shared test factories / mocks
services/event-indexer   RPC poller, processors, Postgres store, SSE server
scripts/                 setup / deploy / seed orchestration
docs/                    this documentation
.github/workflows        CI/CD pipelines
```

## Design decisions

- **Result-returning contract functions** — errors are typed and mapped to
  friendly messages in the SDK (`ContractCallError`, `WalletRejectedError`, …).
- **Try-variant clients** — cross-contract calls use the generated
  `try_<method>` client variants so payment can map escrow/registry failures
  to its own error enum.
- **BigInt everywhere for amounts** — stroops exceed `Number.MAX_SAFE_INTEGER`
  for large balances; the SDK and UI treat amounts as bigint.
- **Env config centralized** — `@stellarflow/config` validates env once;
  the browser reads `NEXT_PUBLIC_*` variants of the same variables.
