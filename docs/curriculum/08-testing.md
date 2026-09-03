# 8. Writing Tests for Contracts and Frontend

Tests are how you sleep at night with money on-chain. Unit → fuzz →
invariant → fork → E2E, in that order of leverage.

## 8.1 Foundry: unit + fuzz + invariant

Foundry tests are plain Solidity with cheatcodes (`vm.*`), which is why it
won the tooling war. **Hardhat alternative:** `hardhat-toolbox` + Chai
matchers + solidity-coverage — same concepts, TypeScript, slower and more
plugin-y. The snippet below is Foundry, the standard for new projects.

### Unit tests

```solidity
// test/Payments.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Payments} from "../src/Payments.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract PaymentsTest is Test {
    Payments payments;
    MockERC20 usdc;
    address alice = makeAddr("alice");
    address admin = makeAddr("admin");

    function setUp() public {
        usdc = new MockERC20();
        payments = new Payments(address(usdc));
        payments.grantRole(payments.OPERATOR_ROLE(), admin);
        vm.prank(admin);
        usdc.mint(alice, 1_000e6);
        vm.prank(alice);
        usdc.approve(address(payments), type(uint256).max);
    }

    function test_CreatesPayment_LocksFunds() public {
        vm.prank(alice);
        payments.createPayment(bob, 100e6, block.timestamp + 1 days);

        assertEq(usdc.balanceOf(address(payments)), 100e6);
        assertEq(usdc.balanceOf(alice), 900e6);
        // event assertion
        vm.expectEmit(true, true, true, true);
        emit Payments.PaymentCreated(0, alice, bob, 100e6, block.timestamp + 1 days);
    }

    function test_RevertIf_AmountZero() public {
        vm.prank(alice);
        vm.expectRevert(Payments.InsufficientAmount.selector);
        payments.createPayment(bob, 0, block.timestamp + 1 days);
    }
}
```

### Fuzz tests

Fuzz throws random inputs at your functions to find the assumptions you
forgot to write down:

```solidity
function testFuzz_TotalLockedIsSum(uint256 a, uint256 b) public {
    vm.assume(a <= 1_000e6 && b <= 1_000e6); // prune unrealistic inputs
    vm.prank(alice);
    payments.createPayment(alice2, a, block.timestamp + 1 days);
    vm.prank(bob);
    payments.createPayment(alice3, b, block.timestamp + 1 days);
    assertEq(usdc.balanceOf(address(payments)), a + b); // overflow? packing? — fuzz finds it
}
```

Run more rounds in CI (`--fuzz-runs 5000`) than locally; on failure Foundry
prints the failing input so you can add it as a regression test.

### Invariant testing (the killer feature)

Invariants are properties that must hold **across arbitrary sequences of
user actions** — the closest thing to "can this contract be broken?".
Pattern: a **handler** wraps your contract's functions with realistic,
bounded randomness; `invariant_*` functions assert the property after every
action:

```solidity
// test/handlers/PaymentsHandler.sol — bound the state space
contract PaymentsHandler is Test {
    Payments payments;
    uint256 public totalCreated; // "ghost" variable tracking expected state
    address[] users;

    function create(uint256 userIdx, uint96 amount) external {
        vm.prank(users[userIdx % users.length]);
        payments.createPayment(bob, amount % 1_000e6, block.timestamp + 1 days);
        totalCreated++;
    }
    // ... approve, execute, cancel handlers
}

// test/PaymentsInvariant.t.sol
contract PaymentsInvariant is Test {
    function invariant_contractBalance_neverExceeds_creatorDeposits() public view {
        // booked accounting (ghosts) must equal on-chain reality
        assertGe(usdc.balanceOf(address(payments)), expectedLocked());
    }
    function invariant_noPayment_canDoubleSpend() public view { /* ... */ }
}
```

Fuzz proves "no input breaks this function"; invariants prove "no sequence
of inputs breaks this contract". For any escrow/payment system, invariants
like **total locked == sum of active escrows** are worth their weight in
gold.

## 8.2 Mocking external contracts and oracles

Never test against real mainnet dependencies. Three tools:

- **Deploy mocks** (`MockERC20`, `MockV3Aggregator` — Chainlink ships one)
  with fixed, controllable prices/behaviors.
- **Fork + impersonate** for testing against *real* deployed contracts
  (Uniswap pools, USDC) without owning them:

```solidity
function test_Swap_OnForkedMainnet() public {
    vm.createSelectFork(vm.envString("MAINNET_RPC_URL"), 19_000_000); // pinned block!
    address whale = 0x...; // known USDC holder
    vm.deal(whale, 100 ether);
    vm.prank(whale);
    usdc.transfer(alice, 1_000e6);
    // now test your swap logic against the real pool
}
```

- **`vm.mockCall`** for targeted stubbing of one function on an arbitrary
  address (oracle returns a manipulated price — the perfect test for
  §1.6's oracle-manipulation defenses):

```solidity
vm.mockCall(
    address(priceFeed),
    abi.encodeWithSelector(IAggregatorV3.latestRoundData.selector),
    abi.encode(uint80(1), int256(0.01e8), 0, block.timestamp, uint80(1))
); // feed returns $0.01 — does your stale/range check catch it?
```

Fuzz the oracle's *values*, the attacker's *timing* (`vm.warp`), and the
*sequence* (flash-loan-style deposit→manipulate→withdraw) — that's how the
real exploits look.

## 8.3 Frontend testing (Vitest + React Testing Library)

Mock the Web3 layer — never hit a real chain in unit tests. With wagmi,
mock the hooks:

```tsx
// hooks/usePayments.test.tsx
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("wagmi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wagmi")>();
  return {
    ...actual,
    useAccount: () => ({ address: "0xalice", isConnected: true }),
    useReadContract: () => ({
      data: 1_000_000n, isPending: false, error: null,
    }),
    useWriteContract: () => ({ writeContractAsync: vi.fn(), isPending: false }),
  };
});

it("renders the balance formatted", async () => {
  const { result } = renderHook(() => useBalance());
  await waitFor(() => expect(result.current.formatted).toBe("1.00"));
});
```

For components, test the **state machine** (§7.2), not the RPC: mock the
hook to return `pending`/`confirmed`/`failed` and assert the right UI in
each state; assert the error map turns `User rejected the request` into the
friendly copy; mock the explorer-link builder. wagmi also ships a
**`mock` connector** (account preloaded, no wallet) for integration-style
tests without a browser.

## 8.4 End-to-end with a local chain

E2E proves the whole stack (wallet → UI → SDK → chain) without testnet
flakiness. Standard recipe:

1. Spin up **Anvil** (or Hardhat node) on a fixed chain id:
   `anvil --chain-id 31337 --port 8545`
2. Deploy your contracts to it (deterministic deployer makes this trivial).
3. Point the frontend at it (`NEXT_PUBLIC_RPC_URL=http://localhost:8545`).
4. Playwright drives the UI **with a real injected wallet**: the wagmi
   `mock` connector, or MetaMask's flask extension via Playwright, or a
   headless injected provider (`window.ethereum` shim using viem
   `walletClient` with a prefunded test key).

```ts
// e2e/payment.spec.ts (Playwright)
test("create a payment end-to-end", async ({ page }) => {
  await page.goto("/payments/new");
  await page.getByLabel("Recipient").fill("0x9f..."); // funded test account
  await page.getByLabel("Amount").fill("100");
  await page.getByRole("button", { name: "Create payment" }).click();
  // wallet shim signs immediately; assert optimistic row + confirmed state
  await expect(page.getByText("Confirmed")).toBeVisible({ timeout: 15_000 });
  // and the on-chain state:
  const escrowBalance = await readContract({ /* ... */ });
  expect(escrowBalance).toBe(100n);
});
```

**Fork-based E2E** (Anvil with `--fork-url mainnet`) lets the E2E touch
real USDC/Uniswap behavior deterministically — pin `--fork-block-number` so
runs are reproducible. This is the same trick as `vm.createSelectFork` in
§8.2, one layer up.

## Mapping to StellarFlow

- Your `contracts/*/src/test.rs` unit tests (28 of them) map to §8.1's unit
  layer — the EVM additions to adopt: **property/fuzz tests** (Rust:
  `proptest`/`arbitrary` on your `Result`-returning functions) and
  **invariant-style tests** (a script that drives random *sequences* of
  `create → approve → execute` and checks "locked == sum of active escrows"
  holds at every step).
- Mocking: your test-utils package is the right place for a
  `MockTokenClient`/fake registry; on EVM that's `MockERC20` +
  `vm.mockCall` for the oracle.
- Frontend: your 20 Vitest tests already mock the SDK boundary — keep that
  boundary explicit (never import the real RPC client in tests). The gap is
  E2E: a localnet + Playwright suite that runs the README's canonical flow
  against a freshly deployed local chain.

**Next:** [09-architecture.md](09-architecture.md)