# 2. Inter-Contract Communication

How contracts compose: typed calls, low-level calls, error handling, and
cross-chain messaging.

## 2.1 Interfaces and abstract contracts

An `interface` is the contract's public ABI contract. Other contracts depend
on the interface, not the implementation — that's composability.

```solidity
// Escrow.sol (implementation)
contract Escrow is IEscrow {
    function release(uint256 id) external override { /* ... */ }
}

// IEscrow.sol (interface — this is what callers import)
interface IEscrow {
    error EscrowNotReleased(uint256 id);

    function release(uint256 id) external;
    function escrowBalance(uint256 id) external view returns (uint256);
}
```

Rules: interfaces can't have state or function bodies; all functions are
`external`. **Abstract contracts** are interfaces + shared implementation
(common storage, modifiers) that derived contracts complete. Use
**ERC-165** (`supportsInterface`) so others can discover what you implement.

## 2.2 Calling external contracts: the three opcodes

| Opcode | Context | `msg.sender` | `msg.value` | Risks |
| --- | --- | --- | --- | --- |
| `call` | Callee runs in **its own** storage | Callee sees the *caller* contract | Passed through if sent | Reentrancy; must check return `bool` |
| `delegatecall` | Callee code runs in **caller's** storage | **Preserved** (callee sees original `msg.sender`) | Preserved | Storage-layout collisions; the #1 proxy primitive |
| `staticcall` | Read-only | Preserved | Always 0 | None for state, but can't write |

The typed way (preferred):

```solidity
import {IEscrow} from "./IEscrow.sol";

contract Payment {
    function execute(uint256 escrowId) external {
        IEscrow(escrowContract).release(escrowId); // reverts on failure
    }
}
```

The low-level way — use only when you need raw control (proxy fallbacks,
meta-transactions). **Always check the return bool**; a silent `false` on a
failed call is a classic exploit:

```solidity
function forward(bytes calldata data, address target) external payable {
    (bool ok, bytes memory ret) = target.call{value: msg.value}(data);
    if (!ok) {
        // bubble up a revert reason if the target provided one
        assembly { revert(add(ret, 32), mload(ret)) }
    }
}
```

### delegatecall risks (why proxies are dangerous)

The implementation's code writes to the **proxy's** storage slots by
position. If layouts differ (e.g., the implementation was compiled against a
different contract), you get silent corruption — funds written to the wrong
slot. Mitigations: same storage layout everywhere (ERC-7201 namespaced
storage per contract, §1), no constructor state in implementations, and
audit every new implementation against the old layout. Also: a
`delegatecall` to an arbitrary user-supplied address is a full
contract-takeover primitive — never allow it.

## 2.3 try/catch on external calls

`try/catch` only works on **external calls** (not `delegatecall`, not
`new`). It lets you degrade gracefully when an integration fails, which
keeps your contract composable instead of reverting the whole tx:

```solidity
import {IEscrow} from "./IEscrow.sol";

contract Payment {
    error EscrowStepFailed(uint256 code);
    address public escrowContract;

    function execute(uint256 id) external returns (bool escrowOk) {
        try IEscrow(escrowContract).release(id) {
            escrowOk = true;
        } catch Error(string memory reason) {
            // require("...") style revert
            emit EscrowReverted(reason);
        } catch Panic(uint256 code) {
            // arithmetic overflow (0x11), div-by-zero (0x12), etc.
            revert EscrowStepFailed(code);
        } catch (bytes memory lowLevelData) {
            // custom errors + any raw revert bytes land here
            emit EscrowReverted(bytesToHex(lowLevelData));
        }
        return escrowOk;
    }
}
```

Pitfalls: a `catch (bytes memory)` is **required** if the callee can revert
with custom errors, or the whole try reverts anyway; gas is still consumed
on the failed call; don't use try/catch to swallow *your own* invariant
failures — only integration boundaries.

## 2.4 Cross-chain messaging (bridges)

Two families:

- **Message-passing bridges** (LayerZero v2, Axelar, Hyperlane, Wormhole):
  your contract emits an event/call on chain A; off-chain validators/relayers
  verify it and deliver a call to your contract on chain B.
- **Liquidity/swap bridges**: funds move on both sides against a liquidity
  pool — you can't extend these with arbitrary calls.

### LayerZero v2 (concepts)

Your contract extends `OApp` and declares its peer on the remote chain.
Sending: `_lzSend` (pay a fee for delivery + verification). Receiving:
`lzReceive` — **only the LayerZero endpoint may call it** (verified via
`Origin`), and you must implement `_lzReceive` with explicit reentrancy care
because it's an external call into your contract.

```solidity
import {OApp, Origin, MessagingFee, MessagingReceipt} from
    "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";

contract CrossChainPayment is OApp {
    mapping(uint32 => bytes32) public peers; // chainId => address

    function sendPayment(uint32 dstEid, bytes calldata payload)
        external payable returns (MessagingReceipt memory)
    {
        bytes memory options = bytes(""); // gas limit for destination
        MessagingFee memory fee = _quote(dstEid, payload, options, false);
        // fee.nativeFee paid in msg.value
        return _lzSend(dstEid, payload, options, fee, payable(msg.sender));
    }

    function _lzReceive(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata payload,
        address executor,
        bytes calldata extraData
    ) internal override {
        require(peers[origin.srcEid] == origin.sender, "untrusted peer");
        // decode payload, update state, emit event
    }
}
```

Security model (v2): messages are verified by a **Security Stack** of DVNs
(Decentralized Verifier Networks) before delivery — you configure how many
and which; more DVNs = more trust assumptions satisfied, higher latency/cost.
For tokens, use **OFT** (Omnichain Fungible Token) instead of hand-rolling
lock/burn logic.

### Axelar (concepts)

GMP (General Message Passing): `callContract(destChain, destAddress, payload)`
from a `AxelarExecutable` contract; destination implements `_execute` with
`srcChain`/`srcAddress` verification. Pay destination gas via
`GasService.payGasForContractCall`. Axelar's newer Amplifier framework is
moving toward permissionless chains with a validator security model.

### Choosing

| | LayerZero v2 | Axelar | Native/rollup bridge |
| --- | --- | --- | --- |
| Model | OApp + DVN security stack | Validator set + gas service | Trusted by construction |
| Custom payloads | Yes (OApp) | Yes (GMP) | Limited (assets) |
| Cost/latency | Configurable (1-N DVNs) | Pay-as-you-go | Cheap on same rollup |
| Best for | App-specific omnichain logic, OFT tokens | Chain-agnostic message fan-out | L1↔L2 canonical assets |

**Cross-chain rules that apply everywhere:** whitelist senders per chain
(never accept from anyone); single "router" contract per chain; pause
mechanism on the bridge endpoints (§9); monitor for message failures and
have a replay/fallback path; treat bridging as *eventual* — never assume
atomicity across chains.

## Mapping to StellarFlow

- `payment → registry → escrow` is your composability story: the EVM
  equivalent is `Payment` holding an `IRegistry` interface and resolving
  `IEscrow` at runtime — swap the implementation without touching callers.
- Your `try_<method>` client variants are exactly `try/catch` — the Rust
  SDK generates them so `payment` can map escrow/registry failures to its
  own `Error` enum instead of panicking. That's the production pattern:
  **typed error boundaries between contracts**, not bare reverts.
- Soroban has no `delegatecall`; upgrades and factories use different
  primitives (authorized `upgrade`, `deploy_from_contract`), but the
  *trust boundaries* you design (who may call whom, who verifies what) are
  identical.
- Cross-chain: Stellar has its own bridge/asset ecosystem (e.g.,
  Soroban-based asset wrapping); the LayerZero/Axelar concepts — whitelisted
  peers, verified delivery, eventual consistency, fee/gas management on the
  destination — transfer directly.

**Next:** [03-events-realtime.md](03-events-realtime.md)