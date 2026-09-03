# Production dApp Curriculum (EVM/Solidity)

A 10-part, senior-engineer-level walkthrough of building a production-grade
decentralized application on the EVM: advanced contracts, composability,
real-time indexing, CI/CD, deployment, mobile frontends, error handling,
testing, architecture, and documentation.

It assumes **intermediate Solidity knowledge** but limited exposure to
production workflows, and it prioritizes current (2025-2026) tooling:
Solidity 0.8.x, OpenZeppelin v5, Foundry, viem + wagmi v2 + RainbowKit,
and TanStack Query v5.

> **About this repo:** StellarFlow Hub is built on **Stellar/Soroban**
> (Rust contracts, `@stellar/stellar-sdk`, Freighter). Each section below
> targets the EVM stack you asked about, then includes a *"Mapping to
> StellarFlow"* box that translates the concepts to this repo's Rust/TS
> code, so you can apply every lesson to the project you already have.

## Sections

| # | Topic | File |
| --- | --- | --- |
| 1 | Advanced smart contract development | [01-advanced-contracts.md](01-advanced-contracts.md) |
| 2 | Inter-contract communication | [02-inter-contract-communication.md](02-inter-contract-communication.md) |
| 3 | Event streaming & real-time updates | [03-events-realtime.md](03-events-realtime.md) |
| 4 | CI/CD pipeline | [04-cicd.md](04-cicd.md) |
| 5 | Deployment workflow | [05-deployment.md](05-deployment.md) |
| 6 | Mobile responsive frontend | [06-frontend-mobile.md](06-frontend-mobile.md) |
| 7 | Error handling & loading states | [07-errors-loading.md](07-errors-loading.md) |
| 8 | Testing contracts & frontend | [08-testing.md](08-testing.md) |
| 9 | Production architecture | [09-architecture.md](09-architecture.md) |
| 10 | Documentation & demo presentation | [10-docs-demo.md](10-docs-demo.md) |

## Suggested reading order

Read 1 → 2 → 3 as the core (contracts, composability, data flow), then
4 and 5 (delivery), then 6 and 7 (frontend UX), then 8 (confidence),
then 9 and 10 (operations and storytelling). Each file stands alone and
cross-references the others where relevant.

## EVM ↔ Soroban concept map

A quick translation table for readers coming from this repo:

| Concept (EVM) | Soroban equivalent in StellarFlow Hub |
| --- | --- |
| Solidity contract | Rust contract (Soroban SDK), compiled to WASM |
| `require` / custom errors | `Result<_, Error>` with typed error enums |
| `msg.sender` / `msg.value` | `env.current_contract_address()`, auth via `require_auth()` |
| Storage (`SSTORE`) | `env.storage()` persistent / temporary entries |
| Events (`emit`) | `env.events().publish()` with typed topics |
| Reentrancy guard (CEI) | Soroban's auth model + same CEI discipline in Rust |
| Upgradeable proxy (UUPS) | Soroban contract `upgrade` (authorized by admin) |
| `delegatecall` | Not available — Soroban uses cross-contract `invoke` |
| Factory / clone pattern | Contract deploy from contract (`deploy_from_contract`) |
| AccessControl roles | `require_auth()` + role checks in contract code |
| Registry pattern | `registry` contract: on-chain service discovery |
| `try/catch` on external calls | `try_<method>` client variants (`EnvClient::try_...`) |
| The Graph / custom indexer | `services/event-indexer` (poll RPC → Postgres → SSE) |
| viem / wagmi | `@stellar/stellar-sdk` + generated `contract.Client` |
| RainbowKit / WalletConnect | Freighter (Stellar wallet extension) |
| Etherscan verification | `stellar contract` deploy metadata + `contracts:verify` |
| Foundry tests | Rust `#[test]` + soroban testutils |
| Gnosis Safe multisig | Stellar multisig / XDR-signed transactions |

## Conventions used in the code

- Solidity pragma `^0.8.24`+; OpenZeppelin Contracts v5 imports.
- viem v2 for chain I/O; wagmi v2 + RainbowKit v2 + TanStack Query v5 in
  React examples; Next.js App Router.
- Foundry for most contract examples; Hardhat shown where its ecosystem
  (TypeChain, plugins) is the better fit.
- Solidity snippets are compact and illustrative — they compile against the
  libraries named in the imports, but error handling/edge cases are trimmed
  to keep the pattern visible.