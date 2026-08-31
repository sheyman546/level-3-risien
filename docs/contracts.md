# Contracts

Three Soroban contracts written in Rust with `soroban-sdk` 21.x.

| Contract | Crate | Purpose |
| --- | --- | --- |
| registry | `stellarflow-registry` | On-chain service registry |
| escrow | `stellarflow-escrow` | Locks and distributes token funds |
| payment | `stellarflow-payment` | Payment lifecycle orchestration |

## Registry

| Function | Auth | Notes |
| --- | --- | --- |
| `initialize(admin)` | caller | One-time; sets the admin |
| `register(key, address)` | admin or self | Store/overwrite a contract address |
| `remove(key)` | admin | Remove a registration |
| `get_contract(key) -> Address` | — | Read |
| `is_registered(key) -> bool` | — | Read |
| `admin() -> Address` | — | Read |

Events: `registry_initialized`, `contract_registered`, `contract_removed`.

## Escrow

| Function | Auth | Notes |
| --- | --- | --- |
| `initialize(admin)` | caller | Admin is also the dispute resolver |
| `create_escrow(depositor, beneficiary, amount, asset, timeout) -> u64` | depositor | Validates balance, transfers tokens into the contract |
| `release(caller, id)` | depositor or beneficiary | Pays the beneficiary |
| `refund(caller, id)` | depositor | Returns funds to the depositor |
| `dispute(caller, id)` | either party | Freezes funds until resolution |
| `resolve_dispute(caller, id, pay_beneficiary)` | admin | Settles a dispute |
| `get_escrow(id)` / `escrows()` | — | Reads |

States: `Locked → Released | Refunded | Disputed → (Resolved)`. Events:
`escrow_initialized`, `escrow_created`, `escrow_released`, `escrow_refunded`,
`escrow_disputed`, `escrow_resolved`.

## Payment

| Function | Auth | Notes |
| --- | --- | --- |
| `initialize(admin, registry)` | caller | Stores the registry address |
| `create_payment(creator, recipient, amount, asset, deadline) -> u32` | creator | No funds move yet |
| `approve_payment(caller, id)` | creator or admin | `Created → Approved` |
| `execute_payment(caller, id) -> u64` | creator | **Cross-contract**: resolves escrow via registry, calls `create_escrow`, returns the escrow id |
| `cancel_payment(caller, id)` | creator | Before execution |
| `get_payment(id)` / `payments()` | — | Reads |

States: `Created → Approved → Executed`, or `Created/Approved → Cancelled`.
Events: `payment_initialized`, `payment_created`, `payment_approved`,
`payment_completed`, `payment_cancelled`.

## Cross-contract call

`execute_payment` demonstrates contract-to-contract communication:

```rust
let registry_client = RegistryClient::new(&env, &registry_address);
let escrow_address: Address =
    match registry_client.try_get_contract(&String::from_str(&env, "escrow")) {
        Ok(Ok(addr)) => addr,
        _ => return Err(Error::RegistryNotFound),
    };

let escrow_client = EscrowClient::new(&env, &escrow_address);
let escrow_id: u64 =
    match escrow_client.try_create_escrow(
        &payment.creator, &payment.recipient, &payment.amount, &payment.asset, &payment.deadline,
    ) {
        Ok(Ok(id)) => id,
        _ => return Err(Error::EscrowCallFailed),
    };
```

The generated client from `#[contractimpl]` exposes both a plain method
(panics on error) and a `try_<method>` variant returning a nested
`Result<Result<T, …>, …>`, which lets the payment contract map failures onto
its own error enum.

## Error enums

Each contract defines a `#[contracterror]` enum with numeric codes that the
SDK maps to typed errors (`packages/sdk/src/errors.ts` mirrors them). Keep
both in sync when changing the contracts.

## Building & testing

```bash
cd contracts
cargo test --workspace          # unit tests (auth, balances, events, cross-contract)
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check
stellar contract build           # produces target/wasm32v1-none/release/*.wasm
```

Requires the `wasm32v1-none` Rust target: `rustup target add wasm32v1-none`.

## Deployment

See `scripts/deploy.ts` and [deployment.md](./deployment.md). Deploy order
matters: registry → escrow → payment, then register `escrow` in the registry
and initialize each contract with the deployer as admin.
