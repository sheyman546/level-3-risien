# 9. Production-Ready Architecture Practices

Structure, configuration, observability, and the plan for when things
break.

## 9.1 Monorepo layout that scales

The layout that survives contact with production (pnpm + Turborepo — the
same shape as this repo):

```text
my-protocol/
├── apps/
│   ├── web/                  # Next.js dApp
│   ├── indexer/              # event indexer (Ponder/DIY, §3)
│   └── api/                  # backend-for-frontend (if needed)
├── packages/
│   ├── contracts/            # Solidity sources + forge config + abis/
│   ├── sdk/                  # typed clients (wagmi generate / viem)
│   ├── ui/                   # shared React components (design system)
│   ├── config/               # centralized, validated env config
│   └── types/                # shared domain types (chain-agnostic)
├── services/                 # background workers, bots, alerters
├── e2e/                      # Playwright + anvil
├── subgraphs/                # The Graph deployments (if used)
├── scripts/                  # deploy, verify, seed, sanity
├── .github/workflows/
└── docs/
```

Rules that make it work:

- **Contracts are a package, not a folder.** The `contracts` package
  exports compiled ABIs/bytecode; `apps/web` and `packages/sdk` import the
  ABI — the frontend can never drift from the source (CI enforces this,
  §4.2).
- **The SDK is the only way to touch the chain.** UI → hooks → SDK →
  viem → RPC. The SDK owns error mapping (§7), bigint handling, and typed
  clients generated from the ABI (`wagmi generate` / viem `generateAbis`).
- **Shared types are chain-agnostic** (`PaymentStatus`, `Amount` as
  strings/bigint) — the SDK adapts chain types to domain types at its
  boundary.
- **One lockfile, one command** (`pnpm test`, `turbo run build`). Turborepo
  caches by input hash — CI skips untouched packages.
- Version contracts as artifacts: tag releases, pin `solc` in the config,
  and never deploy un-tagged bytecode (§5.2).

## 9.2 Environment & configuration management

| Layer | Dev | Staging | Production |
| --- | --- | --- | --- |
| Chain | anvil (31337) | Sepolia/Goerli† | Mainnet (+L2s) |
| RPC | local | paid key | paid key, multiple + fallback |
| Deployer | throwaway key | CI secret | hardware wallet / Defender relayer |
| Contracts | fresh deploys | pinned releases | immutable, upgrade via multisig |
| Secrets | `.env.local` | GitHub env secrets | GitHub env secrets / Doppler + Vault |
| Data | fixtures | testnet indexer | production indexer + replicas |

Practical rules:

- **One validated config module** (`packages/config`, Zod/Envalid): every
  process validates its env at boot and fails fast with a clear message —
  this repo's `@stellarflow/config` already does this.
- **Runtime vs build-time**: `NEXT_PUBLIC_*` is baked into the bundle at
  build time — changing a contract address means a rebuild. Keep
  *architecture-changing* config (RPCs, addresses) in runtime-configurable
  places (server env, API, deployed config file) and only truly public,
  stable values in `NEXT_PUBLIC_*`.
- **Per-network address registry** — a committed JSON
  (`deployments/<network>.json`) with block numbers, verified-links, and
  upgrade history. Git history *is* your deployment ledger.
- Never derive behavior from `chainId` alone: pin both network *and* chain
  family (L2s share EVM semantics but differ in fee/gas behavior).

## 9.3 Monitoring & alerting

Three monitoring planes, all required:

**1. Chain/contract health.** Ownership changes, pause toggles, unusual
transfer volume, upgrade execution, large withdrawals. Tools:
OpenZeppelin Defender (monitor + automations), Tenderly (alerts + tx
simulation), Forta (community detection bots), or a 30-line indexer
listener that emails/pings when a critical event fires. Alert on:

- `OwnershipTransferred` / admin-role grants on *any* contract
- `Paused`/`Unpaused` (unexpected pause = incident)
- Withdrawals above a threshold; failed cross-contract calls (§2)
- Upgrade execution (should only happen via timelock)

**2. Infrastructure.** RPC error/latency, indexer **lag** (the killer
metric — cursor behind head block by N minutes), SSE/WS connection drops,
queue depth, DB growth. Alert thresholds: indexer lag > 5 min = pager-worthy
for a real-time dApp. Grafana/Datadog + Sentry for app errors.

**3. Product/UX.** Failed tx rates by error type (is `InsufficientBalance`
spiking because the form is wrong?), wallet-connection failures, time-to-
confirm. Your SDK's typed error hierarchy (§7) should be the instrumentation
feed: every error has a code, so dashboards aggregate by code.

Health endpoints for everything (`/healthz` returns chain sync + indexer
lag), structured JSON logs with request ids, and a runbook link in every
alert.

## 9.4 Incident response for smart contract exploits

Plan *before* the exploit. The three tools:

1. **Pause (circuit breaker)** — `Pausable` on every fund-moving function;
   a `PAUSER_ROLE` held by the multisig (and ideally a keeper that pauses
   automatically on anomaly signals):

```solidity
contract Payments is Pausable {
    function createPayment(/* ... */) external whenNotPaused { /* ... */ }
    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }
}
```

2. **Emergency roles** — an `EMERGENCY_ROLE` (multisig) that can pause +
   freeze individual users' funds *without* being able to steal them.
3. **Upgrade path** — the UUPS route (§1) to redeploy logic; combined with
   timelock *for normal ops* but a **fast-track emergency upgrade** path the
   multisig can execute (with post-hoc review).

The runbook (write it in `docs/`):

```text
1. DETECT   — alert fires (unusual volume / ownership change / exploit tx)
2. CONTAIN  — multisig executes pause() within minutes; freeze affected funds
3. ANALYZE  — fork the chain at the attack block, replay the exploit
              (Foundry fork + foundry-test tooling / Tenderly replay)
4. FIX      — patch contract; test patch against the replayed exploit
5. RECOVER  — coordinate affected users; plan refunds via timelock
6. COMMUNICATE — public postmortem: timeline, root cause, funds affected,
              remediation, timeline of fixes (never bury it)
7. LEARN    — add regression test from the exploit calldata; adjust alerts
```

Pre-incident: **emergency drills** (pause + upgrade on testnet fork, with
timers — your multisig signers need to know the flow before they need it),
and decide now who has page duty and who speaks publicly. The cost of
"we'll figure it out when it happens" is the protocol's TVL.

## Mapping to StellarFlow

- The repo's monorepo (apps / packages / services / scripts) is already the
  §9.1 shape — the EVM additions: make `contracts/` export ABIs to the SDK
  (WASM + generated clients are your ABI artifacts), and add `e2e/`.
- `@stellarflow/config` = your §9.2 config module; keep `.env.contracts`
  outputs versioned alongside `deployments/<network>.json` equivalents.
- Missing pieces this repo should add: **indexer lag alerting** (the README
  admits polling-only — a lag metric is the honest fix), **Sentry-level
  error aggregation on the typed error hierarchy**, and a **runbook +
  emergency pause equivalent** (Soroban: an admin-authorized pause flag in
  the escrow contract, or at minimum a documented incident doc).

**Next:** [10-docs-demo.md](10-docs-demo.md)