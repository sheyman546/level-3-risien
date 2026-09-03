# 4. CI/CD Pipeline

Automate the boring, expensive parts so every PR is compile-checked,
linted, tested, and analyzed — and only *approved* code reaches a chain.

## 4.1 What a healthy contract pipeline gates on

Run these on **every PR** (fast, cheap, deterministic):

1. Format check — `forge fmt --check` (or `prettier-plugin-solidity`)
2. Compile — `forge build` (catches pragma/linker issues early)
3. Lint — `solhint` (style + common bugs) with a strict config
4. Unit + fuzz tests — `forge test`
5. **Coverage** — `forge coverage` (or solidity-coverage), fail below a
   floor on critical paths
6. **Static analysis** — Slither (runs on the compiled artifacts)
7. Contract size check — `forge build --sizes`; fail if any contract
   exceeds EIP-170's 24KB
8. (If upgradeable) upgrade-safety validation of the new implementation
   against the deployed one

Foundry is the 2025 default for contract CI because `forge test` is fast and
fuzz/invariant tests are first-class. Hardhat remains the right choice when
your pipeline depends on its plugin ecosystem (TypeChain, hardhat-upgrades,
solidity-coverage maturity, mainnet-fork tooling). Many teams use **both**:
Foundry for tests, Hardhat for deploy scripts. The workflow below uses
Foundry + a Hardhat note.

## 4.2 GitHub Actions reference

```yaml
# .github/workflows/contracts.yml
name: contracts
on:
  pull_request:
    paths: ["contracts/**", ".github/workflows/contracts.yml"]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: nightly   # pin a stable tag in production
      - name: Format
        run: forge fmt --check
      - name: Lint
        run: |
          npx solhint "src/**/*.sol" --config .solhint.json
      - name: Build
        run: forge build --sizes
      - name: Test
        run: forge test --fail-fast -vvv

  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: foundry-rs/foundry-toolchain@v1
      - run: forge coverage --report lcov
      - uses: codecov/codecov-action@v5
        with:
          files: lcov.info
          fail_ci_if_error: true

  slither:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: foundry-rs/foundry-toolchain@v1
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: |
          python -m pip install slither-analyzer
          forge build --skip test
          slither . --filter-paths "test|lib" --fail-high
```

Notes:

- **Cache** `~/.foundry/cache` and the package manager cache; contract CI
  should run in <2 minutes.
- **Slither's exit codes:** `--fail-high` fails the build on high/critical
  findings but tolerates informational noise — otherwise you'll be fixing
  style warnings forever.
- **Test against a fork** in CI when behavior depends on mainnet state
  (oracles, pools): `forge test --fork-url $RPC_URL` with the RPC URL from
  GitHub Secrets (free-tier RPCs rate-limit; consider a paid key).
- **ABI/artifact drift check:** commit generated ABIs (or regenerate in CI)
  and fail if the frontend's typed clients (`wagmi generate`) differ from
  the compiled artifacts — the #1 "works locally, breaks in prod" bug.

## 4.3 Environment-based deployment gating

Never deploy from a PR. Model the stages as separate protections:

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    tags: ["v*"]                    # testnet release train
  workflow_dispatch:
    inputs:
      environment: { type: choice, options: [testnet, mainnet] }

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment || 'testnet' }}
    steps:
      - uses: actions/checkout@v4
      - name: Build + test
        run: forge test && forge build
      - name: Deploy contracts
        run: forge script script/Deploy.s.sol --rpc-url ${{ secrets.RPC_URL }} --broadcast
        env:
          PRIVATE_KEY: ${{ secrets.DEPLOYER_KEY }}   # per-environment secret
      - name: Verify
        run: forge verify-contract ... --etherscan-api-key ${{ secrets.ETHERSCAN_API_KEY }}
      - name: Sanity check
        run: cast call ${{ vars.CONTRACT_ADDRESS }} "owner()" --rpc-url ${{ secrets.RPC_URL }}
```

**Environment protection rules** (GitHub → Settings → Environments):

- `testnet`: auto-deploy on tag push, anyone can trigger `workflow_dispatch`.
- `mainnet`: **required reviewers**, a **wait timer** (e.g., 24h), and
  secrets **only** in that environment's scope. Never reuse testnet secrets
  on mainnet — including RPC keys.
- Store **addresses/ids as environment variables** (`vars`), keys as
  **secrets**; keep deployments reproducible from a git tag, not `main` HEAD.

A clean release model: `v1.2.3` tag → CI verifies tests → deploy testnet →
human runs a smoke script (deposit/withdraw on testnet) → manual
`workflow_dispatch` for mainnet with reviewers → post-deploy verification
job (owner check, bytecode match, storage probe) → notify the ops channel.

## 4.4 Common CI pitfalls

- **`forge test` vs CI environment:** non-deterministic tests (time, block
  number, RNG) pass locally, fail on CI — fix by pinning
  `vm.warp`/`vm.roll`/seeds, or rerun with `--fuzz-seed`.
- **Secrets in logs:** never `echo` env vars; scrub artifacts (`--broadcast`
  writes `run-latest.json` containing the deployer address — fine, but keep
  it out of public repos if it contains tx data you consider sensitive).
- **Rate-limited RPCs:** fork tests hammer RPCs; use a dedicated CI key and
  `--fork-block-number` to pin a block so tests are deterministic and cheap.
- **Only CI-green contracts get deployed:** a deploy job that doesn't run
  the full test suite first is how broken code reaches testnet.
- **Dependency drift:** lock Foundry/Hardhat/Solc versions (pin in the
  workflow or use `foundry.toml`/`hardhat.config.ts` solc version).

## Mapping to StellarFlow

- This repo already has the right shape: `ci.yml`, `contracts.yml`,
  `frontend.yml`, `deploy.yml`, path-filtered triggers, and GitHub Secrets
  for keys. The EVM specifics to port over: add **coverage with a failing
  floor**, **static analysis** (for Rust, `cargo clippy -D warnings` is the
  Slither equivalent — it's in `contracts:clippy` but not wired into CI),
  and a **build-size/artifact-drift check** (`cargo` WASM size + SDK client
  regeneration diff).
- The deploy gate applies as-is: testnet on tag, mainnet via
  `workflow_dispatch` with required reviewers + wait timer, secrets scoped
  per environment.

**Next:** [05-deployment.md](05-deployment.md)