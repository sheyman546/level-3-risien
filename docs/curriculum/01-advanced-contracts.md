# 1. Advanced Smart Contract Development

Design patterns, gas optimization, upgradeability, and security for
contracts that hold real value.

## 1.1 Proxy patterns (upgradeable contracts)

A proxy is a contract that *delegates* all calls to an implementation
contract. The implementation holds the logic; the proxy holds the state and
the address users interact with. Upgrading = pointing the proxy at a new
implementation. All three standard patterns use **ERC-1967 storage slots**
for the implementation address (and admin), so tools and explorers can
recognize them.

### UUPS (EIP-1822) — the 2025 default

The upgrade function lives **in the implementation**, not the proxy. Every
user call goes straight through with zero admin overhead; only an upgrade
call pays the extra cost of the authorization check.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract Vault is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    mapping(address => uint256) public balances;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers(); // blocks logic contract being used directly
    }

    function initialize(address owner_) external initializer {
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    // Only the owner may upgrade. Keep owner a multisig in production.
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}
```

Key rules:

- **Storage layout is sacred.** The implementation's state variables must
  never be reordered, removed, or have their types changed. Append-only,
  and reserve a `__gap` for future fields:

```solidity
contract VaultV2 is Vault {
    uint256 public newFeeBps; // appended — safe
    uint256 private __gap;    // (Vault already had gaps if you used them)
}
```

- Use the **initializer pattern** (`initializer` modifier) — constructors
  run in the implementation's context and would never touch proxy state.
  Lock the implementation with `_disableInitializers()` in its constructor.
- Prefer **namespaced storage (ERC-7201)** in new code over appending to
  the inherited storage blob — it eliminates the collision/gap headache:

```solidity
// Storage namespace — no inherited storage layout to preserve.
bytes32 constant VAULT_STORAGE_POSITION =
    keccak256(abi.encode(uint256(keccak256("stellarflow.vault")) - 1))
    & ~bytes32(uint256(0xff));

struct VaultStorage {
    mapping(address => uint256) balances;
    uint256 feeBps;
}

function _vault() private pure returns (VaultStorage storage $) {
    assembly {
        $.slot := VAULT_STORAGE_POSITION
    }
}
```

### Transparent proxy vs UUPS vs Diamond

| | Transparent (EIP-1967) | UUPS (EIP-1822) | Diamond (EIP-2535) |
| --- | --- | --- | --- |
| Upgrade fn location | Proxy (admin only) | Implementation | Facet via `diamondCut` |
| Per-call gas overhead | Admin check on **every** call | None | Facet lookup (cheap) |
| Selector clash with admin | Guarded | N/A | Managed by facets |
| When to choose | Legacy; very few new projects | **Default choice** | >24KB logic (EIP-170) or per-facet upgrades |
| Main risk | Admin check cost | Upgrade fn in logic = one more attack surface if owner key leaks | `delegatecall` surface × N facets; complex tooling |

**Diamonds (EIP-2535)** split logic across *facets* sharing one storage via
`delegatecall` in the fallback, with a "loupe" to enumerate facets. They
exist because a contract is capped at 24KB (EIP-170). For almost every
payment/escrow-scale dApp, UUPS is the right answer; reach for a diamond
only when you genuinely outgrow the size limit or want independent facet
upgrade cadences.

## 1.2 Factory patterns

Factories deploy user-specific contracts. Use **minimal proxies (EIP-1167)**
for clones that share logic, or **CREATE2** for deterministic addresses
(counterfactual deployment: compute the address before deploying, so you can
reference it in other contracts or let users fund it later).

```solidity
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

contract EscrowFactory {
    address public immutable implementation; // set once, gas-cheap
    mapping(address => address) public userEscrow;

    event EscrowDeployed(address indexed user, address escrow);

    constructor(address implementation_) {
        implementation = implementation_;
    }

    // CREATE2: same user always gets the same escrow address.
    function deployFor(address user) external returns (address escrow) {
        bytes32 salt = keccak256(abi.encode(user, block.chainid));
        escrow = Clones.cloneDeterministic(implementation, salt);
        userEscrow[user] = escrow;
        emit EscrowDeployed(user, escrow);
    }
}
```

Pitfalls: clone constructors never run (use an `initialize()` guarded by
`initializer`); give each clone a unique storage namespace; beware
`tx.origin` checks inside clones.

## 1.3 Access control

`Ownable` is fine for a toy; for production use **`AccessControl`** with
named roles, or — strongly preferred for anything with admin powers —
**`AccessControlDefaultAdminRules`**, which adds a **delay** and a
**two-step transfer** for the admin role so a stolen key can't instantly
pivot the contract:

```solidity
import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/AccessControlDefaultAdminRules.sol";

contract Payments is AccessControlDefaultAdminRules {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");

    // 2-day delay on admin changes, two-step accept.
    constructor(address initialAdmin)
        AccessControlDefaultAdminRules(2 days, initialAdmin)
    {
        _grantRole(OPERATOR_ROLE, initialAdmin);
    }

    function pause() external onlyRole(PAUSER_ROLE) { /* ... */ }
}
```

Pitfalls: `renounceRole` on the default admin bricks the contract (vet it in
CI); roles granted to EOAs should be re-granted to a multisig; use a
`TimelockController` as admin for anything governing funds or upgrades.

## 1.4 Gas optimization

Order of impact: **fewer SSTORE/SLOAD > calldata vs memory > unchecked >
custom errors > tiny struct tweaks**.

- **Pack storage.** One slot = 32 bytes; pack `uint128 + uint128`,
  `uint64 × 4`, etc. in the same struct. A zero→non-zero SSTORE costs 20k
  gas; a warm SLOAD 100. Five slots of 6-byte values cost 5 SSTOREs; packed
  into one slot, one.
- **Custom errors beat `require("string")`.** No string storage, ~50-100 gas
  saved per revert, and they're machine-readable on the frontend:

```solidity
error InsufficientBalance(uint256 available, uint256 required);
error NotOperator(address caller);

function withdraw(uint256 amount) external {
    uint256 bal = balances[msg.sender];
    if (bal < amount) revert InsufficientBalance(bal, amount);
    unchecked { balances[msg.sender] = bal - amount; } // proven safe
    payable(msg.sender).transfer(amount);
}
```

- **`unchecked` blocks** skip the 0.8 overflow checks where you've *proven*
  the math can't overflow (e.g., `i < len` loop counters, `bal - amount`
  after the require above). Never wrap unchecked around user-controlled math.
- **`immutable`/`constant`** instead of storage for values fixed at deploy
  time (addresses, fee denominators) — they're inlined in bytecode.
- Cache repeated SLOADs in memory; emit **one** event per logical change;
  use `calldata` (not `memory`) for function params you only read.

## 1.5 Upgradeability trade-offs

| Consideration | What to do |
| --- | --- |
| Storage layout | Append-only; ERC-7201 namespaces; `__gap` in inherited contracts |
| Upgrade authority | Multisig + timelock (never a raw EOA) |
| Upgrade process | Two-phase: propose → wait (timelock) → execute; pause during cutover |
| Downgrades | Possible, but storage compatibility must hold both ways — treat as emergency-only |
| Immutable benefits | Deterministic address, no admin key, auditability. If you don't need upgrades, don't add them |
| Alternative | "Upgrade by redeploy" (new address + migration) — simplest, but breaks integrations |

A sane 2025 posture: **start upgradeable (UUPS) if you expect iteration,
start immutable if the protocol is simple and stable.** A proxy's admin key
is a permanent, high-value target — budget for its custody (see §5).

## 1.6 Security: the big five

1. **Reentrancy.** External calls give control back to the caller. Follow
   **CEI** (Checks-Effects-Interactions: validate → update state → then
   call out), add `nonReentrant` on anything touching tokens, and remember
   ERC-777/721/1155 tokens can callback *during* transfers. Watch
   cross-function reentrancy and read-only reentrancy (a call into a *view*
   that reads inconsistent state).

```solidity
// BAD: state updated after the external call
function withdraw(uint256 amt) external {
    if (balances[msg.sender] < amt) revert Insufficient();
    (bool ok,) = msg.sender.call{value: amt}("");
    balances[msg.sender] -= amt; // reentrant call re-enters here!
}

// GOOD: effects before interaction
function withdraw(uint256 amt) external nonReentrant {
    if (balances[msg.sender] < amt) revert Insufficient();
    balances[msg.sender] -= amt;
    (bool ok,) = msg.sender.call{value: amt}("");
    if (!ok) revert TransferFailed();
}
```

2. **Integer overflow.** Solidity 0.8 checks arithmetic by default — but
   casting truncates (`uint256(2**200) → uint64` silently), and
   `unchecked` disables checks. Lint for both. Use
   `type(uint64).max`-style bounds when packing.

3. **Front-running.** Anyone can watch the mempool and replay/outbid your
   transaction. For ordering-sensitive logic (auctions, claims, approvals
   of new token amounts) use commit-reveal, submarine sends, or
   FCFS-with-tiebreak rules; never rely on `tx.origin`; be deliberate about
   whether your protocol *allows* MEV (e.g., keep `transfer` style flows
   atomic).

4. **Oracle manipulation.** A spot price from one shallow pool can be
   skewed by a flash loan. Prefer Chainlink feeds **with staleness +
   deviation checks**, or **TWAP** (time-weighted average) from Uniswap V3
   `observe()`. Never trust `msg.value` as a price signal.

5. **The long tail** (checklist): `block.timestamp` is ±15s manipulable
   (use deadlines with tolerance, never randomness); `tx.origin` phishing;
   missing zero-address checks; gas griefing via EIP-150's 63/64 rule
   (forward only what you must, use `try/catch` where possible — §2);
   forced ETH (`selfdestruct`) landing in your contract breaks
   accounting-based invariants; EIP-3860 initcode limits in factories.

## Mapping to StellarFlow

- Your `registry` contract is the **service-discovery** pattern §2 covers —
  the EVM version is a registry of `address → interface` with
  `AccessControl` guarding registration, so callers never hard-code
  addresses (exactly what `payment → registry → escrow` does here).
- Soroban has no `delegatecall`; cross-contract calls use the typed
  `try_<method>` client variants — the EVM `try/catch` (§2) is the closest
  equivalent. Your `Result<_, Error>` enums map 1:1 to custom errors.
- Soroban contracts can be upgraded via authorized `upgrade`, but this repo
  deploys immutable contracts and hands admin to a deployer key — the
  custody/authority questions in §1.5 apply identically: a live protocol
  should not be upgradeable by a single EOA.
- Gas: Soroban charges per storage entry and per ledger entry, so the same
  discipline (pack small values, cache reads, minimal event payloads)
  applies in Rust.

**Next:** [02-inter-contract-communication.md](02-inter-contract-communication.md)