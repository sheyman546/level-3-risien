# Testing

Run everything from the repo root:

```bash
pnpm test             # all JS/TS tests (SDK, web, indexer) via turbo
pnpm contracts:test   # Rust contract tests (cargo test --workspace)
pnpm lint             # ESLint (web)
pnpm typecheck        # TypeScript across all packages
```

## Contracts (Rust)

`contracts/*/src/test.rs` — unit tests on the Soroban `Env` with
`env.mock_all_auths()` and a minted SAC token. Coverage:

- **payment**: create/approve/execute/cancel lifecycle, unauthorized callers,
  invalid amount, expired deadline, execute-before-approval,
  registry-missing-escrow, escrow failure propagation, **full cross-contract
  flow** (funds actually move into the escrow contract), events emitted.
- **escrow**: lock/release/refund/dispute/resolve, insufficient balance,
  invalid amount, double-release prevention, unauthorized callers, events.
- **registry**: initialize-once, register/get/remove cycle, duplicate
  registration, unauthorized registration, not-found.

Run: `cd contracts && cargo test --workspace`

## SDK (TypeScript)

`packages/sdk/tests/` — `@stellar/stellar-sdk` is mocked, so tests are fast
and deterministic:

- arg conversion (`toScValArgs`: G/C strings → Address, u64 as bigint)
- `unwrapResult` for both `{ok}`/`{err}` and `["Ok"]`/`["Err"]` shapes
- payment client: correct method/args, status mapping, error mapping
  (contract codes → typed errors), wallet rejection, signer required.

## Web app (Vitest + Testing Library)

`apps/web/tests/`:

- `WalletButton.test.tsx` — connect flow with a mocked Freighter module,
  disconnect, missing-wallet handling
- `PaymentForm.test.tsx` — validation errors, successful submit with
  stroop conversion, wallet-rejection message, disabled submit while pending
- `schemas.test.ts` — zod rules (recipient, amount, decimals, asset)
- `useContractCall.test.tsx` — the transaction status machine incl. phases
- `ActivityFeed.test.tsx` — fake `EventSource`: live badge, SSE messages
  render, reconnecting state, empty state

## Event indexer (Vitest)

`services/event-indexer/tests/`:

- `normalize.test.ts` — decoding real XDR fixtures built with the SDK,
  filtering foreign topics, payload normalization for each event type
- `processors.test.ts` — per-topic payload mapping (payment + escrow)

## CI

GitHub Actions (`.github/workflows/`):

- `ci.yml` — lint, typecheck, tests, build for the whole JS monorepo
- `contracts.yml` — fmt, clippy, cargo tests, WASM build
- `frontend.yml` — web typecheck, lint, tests, `next build`
- `deploy.yml` — manual/on-push deploy of contracts + web (uses secrets)

The project targets meaningful coverage of the risky paths (auth, balances,
state transitions, error mapping) rather than a meaningless 100%.
