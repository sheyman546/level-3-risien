/**
 * Upgrades a deployed contract's WASM (works for all StellarFlow contracts).
 *
 * Usage:
 *   pnpm tsx contracts/scripts/upgrade.ts --contract escrow --network testnet
 *
 * Requires stellar-cli >= 21.4 (the `stellar contract upgrade` command).
 * After upgrading, contract state (storage) is preserved.
 */

import {
  CONTRACTS_DIR,
  ensureKey,
  parseArgs,
  readDeployedIds,
  requireSecretKey,
  resolveNetwork,
  run,
  WASM_DIR,
} from "./common";

const DEPLOYER_ALIAS = "stellarflow-deployer";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const network = resolveNetwork(process.argv.slice(2));
  const contract = args.contract ?? "payment";
  if (!["registry", "escrow", "payment"].includes(contract)) {
    throw new Error(`Unknown contract "${contract}". Expected registry | escrow | payment.`);
  }

  const secret = requireSecretKey();
  const ids = readDeployedIds();
  const contractId = ids[contract];
  const wasm = `${WASM_DIR}/stellarflow_${contract}.wasm`;

  ensureKey(DEPLOYER_ALIAS, secret);

  console.log(`Upgrading ${contract} (${contractId}) on ${network}`);

  // Rebuild first so the WASM is fresh
  console.log("▶ Building contracts...");
  run("stellar", ["contract", "build"], { cwd: CONTRACTS_DIR });

  console.log(`▶ Upgrading ${contract}...`);
  run("stellar", [
    "contract",
    "upgrade",
    "--id", contractId,
    "--wasm", wasm,
    "--source-account", DEPLOYER_ALIAS,
    "--network", network,
  ]);
  console.log(`  ✓ ${contract} upgraded`);

  console.log(`\nVerify with: pnpm tsx contracts/scripts/verify.ts --network ${network}`);
}

main().catch((e) => {
  console.error(`\nUpgrade failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
