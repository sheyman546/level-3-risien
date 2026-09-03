# 5. Smart Contract Deployment Workflow

Getting code to a chain safely, verifiably, and with the right people
holding the keys afterward.

## 5.1 Scripts: Foundry vs Hardhat

Both do the job; the split that emerged by 2025: **Foundry scripts**
(`forge script`) for deterministic, testable deploys; **Hardhat tasks** when
you want TypeScript and plugin integration (hardhat-upgrades, TypeChain,
Etherscan plugins).

Foundry deploy script:

```solidity
// script/Deploy.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Payments} from "../src/Payments.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        Payments payments = new Payments(msg.sender); // owner set from env
        console2.log("Payments deployed at", address(payments));

        vm.stopBroadcast();
    }
}
```

```bash
forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY"
```

Hardhat equivalent (TypeScript, `hardhat.config.ts` with per-network keys):

```ts
// hardhat.config.ts
const networks = {
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL!,
    accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
  },
  mainnet: {
    url: process.env.MAINNET_RPC_URL!,
    accounts: [], // NEVER put a mainnet key in an env file
  },
};
```

| | Foundry (`forge script`) | Hardhat (tasks) |
| --- | --- | --- |
| Language | Solidity | TypeScript |
| Determinism | Yes — same script, same result, easy fork testing | Via plugins (hardhat-deploy) |
| Verification | `forge verify-contract` / `--verify` | `hardhat verify` (mature) |
| Upgrade plugin | Manual / third-party | `@openzeppelin/hardhat-upgrades` (first-class) |
| Multisig ops | `cast` + Safe APIs | Same, plus plugin ecosystem |
| Best for | Test-heavy, pure deploys, fork rehearsal | TS pipelines, upgrades, complex post-steps |

## 5.2 Deterministic deployment (CREATE2)

A deterministic address — computed before deployment, identical on every
chain — lets you: reference the contract before it exists (counterfactual),
deploy the same address to many networks, and give users stable addresses.
Use a factory that deploys via CREATE2 with a canonical salt (chain-agnostic
factories exist so the resulting address matches across EVM chains, e.g.
Safe's singleton factory pattern). Note: CREATE2 computes with
`keccak256(0xff ++ deployingAddress ++ salt ++ keccak256(initcode))` — a
different factory or a changed bytecode (compiler version!) changes the
address. Pin solc and freeze bytecode before publishing an address.

## 5.3 Secrets and RPC hygiene

- **Never** commit keys: `.env*` in `.gitignore`; in CI, GitHub Secrets per
  environment (§4.3). For teams: Doppler / 1Password CLI / Vault, with
  keys fetched at runtime, never baked into images or Next.js `NEXT_PUBLIC_*`.
- Use **dedicated, paid RPC endpoints** for deploys (Alchemy/QuickNode/
  Infura) — public RPCs throttle mid-transaction and expose your traffic.
- **Mainnet keys live in hardware wallets** (Ledger/Trezor via
  `cast send --ledger` or `--trezor`), or in a secure signer service
  (e.g., OZ Defender relayer / Safe). No mainnet private key in any file,
  including CI.
- Rotate testnet keys regularly; use a fresh deployer EOA per environment.

## 5.4 Verification

Verification proves your source matches the deployed bytecode — required
for users, explorers, and auditors:

```bash
# Foundry
forge verify-contract <address> src/Payments.sol:Payments \
  --chain <chainid> --etherscan-api-key "$KEY" --constructor-args "$ARGS"

# Hardhat
npx hardhat verify --network sepolia <address> <constructor-args...>
```

- Etherscan API keys are per-network family; Blockscout for many L2s
  (`--verifier blockscout`), Sourcify for license-friendly chains.
- **Verify the proxy AND the implementation** for upgradeable contracts
  (verify the implementation at its own address).
- Flattened sources get verified when the compiler can't fetch deps;
  prefer verifying against the real build with `--compiler-version` pinned.

## 5.5 Post-deployment sanity checks

Deploying is not done until you've *probed the deployed contract*. Script
it (or wire it as the CI step from §4.3):

```ts
// script/sanity.ts — run AFTER every deploy, fail loudly
const owner = await publicClient.readContract({
  address, abi, functionName: "owner",
});
assert.equal(owner, expectedOwner, "owner mismatch");

// bytecode match: deployed code == local artifact bytecode (ignore metadata)
const deployed = await publicClient.getCode({ address });
assert(deployed!.startsWith(localBytecode.slice(0, 16)), "code mismatch");

// state probe: initialize and call a view fn end-to-end
const total = await publicClient.readContract({ address, abi, functionName: "totalSupply" });
assert.equal(total, 0n, "expected fresh state");
```

Checklist: owner/admin set correctly; proxy implementation matches the
audited artifact; constructor args correct (emit them in deploy logs);
nonce/address recorded in a deployments registry; upgrade paths tested on a
fork first; a smoke transaction (e.g., a tiny deposit) executed and verified
on the explorer.

## 5.6 Admin key handoff (the part most projects skip)

The deployer key should be **ephemeral**. Immediately after deployment:

1. **Create a multisig** — Gnosis Safe (Safe{Wallet}) with 2-of-3 or
   3-of-5 signers, held by distinct humans/hardware wallets.
2. **Transfer ownership** — `transferOwnership(safeAddress)` (or
   `AccessControlDefaultAdminRules` two-step, §1.3). For upgradeable
   contracts, also move the **proxy admin** to the Safe.
3. **Verify the transfer** — confirm `owner() == safeAddress` on-chain,
   then destroy/rotate the deployer key.
4. **Add a timelock** for funds/governance contracts
   (`TimelockController` between Safe and contract) so even a compromised
   multisig can't move funds instantly.
5. **Document the recovery path** — key shares, signer roster, quorum,
   and what happens if a signer is lost. This is an ops document, keep it
   updated.

Propose the transfer via the **Safe Transaction Builder** (paste the
`transferOwnership` calldata), or orchestrate through OZ Defender /
Tenderly, which can also monitor the resulting ownership change (§9).

## Mapping to StellarFlow

- `contracts/scripts/deploy.ts` already implements the good baseline:
  build → deploy registry/escrow/payment → initialize → register → write
  `.env.contracts`. The EVM additions to steal: **deterministic CREATE2
  addresses**, **verification wired into the deploy script** (Soroban
  equivalent: `stellar contract` metadata + your `contracts:verify`), and a
  **sanity-check step that asserts admin/state**, not just that calls
  return.
- `STELLARFLOW_SECRET_KEY` in env/GitHub Secrets is the right pattern; the
  missing piece for production is **multisig custody of the admin role**
  (Stellar: XDR-signed multisig transactions) and rotating the deployer key
  after handoff.
- Multi-network config maps to `--network local|testnet|mainnet`; keep
  per-environment secrets and addresses in per-environment stores, as §5.3.

**Next:** [06-frontend-mobile.md](06-frontend-mobile.md)