/**
 * Deploys the full StellarFlow contract suite to a network:
 *
 *   1. builds all contracts to WASM (`stellar contract build`)
 *   2. deploys registry, escrow, payment
 *   3. initializes each contract (deployer = admin)
 *   4. registers the escrow contract in the registry
 *   5. writes contract ids to `.env.contracts`
 *
 * Usage:
 *   STELLARFLOW_SECRET_KEY=S... pnpm deploy:testnet
 *   STELLARFLOW_SECRET_KEY=S... pnpm deploy:local
 *
 * Requires the `stellar` CLI (>= 21.5) and the wasm32v1-none Rust target.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  CONTRACTS_DIR,
  WASM_DIR,
  deployContract,
  ensureKey,
  invokeContract,
  keyAddress,
  Network,
  REPO_ROOT,
  resolveNetwork,
  requireSecretKey,
  run,
} from "./common";

const DEPLOYER_ALIAS = "stellarflow-deployer";

function wasmPath(name: string): string {
  return path.join(WASM_DIR, `stellarflow_${name}.wasm`);
}

function writeContractEnv(network: Network, ids: Record<string, string>): void {
  const lines = [
    `# Written by contracts/scripts/deploy.ts on ${new Date().toISOString()} (network: ${network})`,
    `STELLARFLOW_NETWORK=${network}`,
    `STELLARFLOW_PAYMENT_CONTRACT=${ids.payment}`,
    `STELLARFLOW_ESCROW_CONTRACT=${ids.escrow}`,
    `STELLARFLOW_REGISTRY_CONTRACT=${ids.registry}`,
    "",
    "# Browser-visible variants for the Next.js app (copy into .env)",
    `NEXT_PUBLIC_STELLARFLOW_NETWORK=${network}`,
    `NEXT_PUBLIC_STELLARFLOW_PAYMENT_CONTRACT=${ids.payment}`,
    `NEXT_PUBLIC_STELLARFLOW_ESCROW_CONTRACT=${ids.escrow}`,
    `NEXT_PUBLIC_STELLARFLOW_REGISTRY_CONTRACT=${ids.registry}`,
    "",
  ];
  fs.writeFileSync(path.join(REPO_ROOT, ".env.contracts"), lines.join("\n"));
  console.log(`\nWrote contract addresses to .env.contracts (copy the NEXT_PUBLIC_* values into .env)`);
}

async function main(): Promise<void> {
  const network = resolveNetwork(process.argv.slice(2));
  const secret = requireSecretKey();

  console.log(`StellarFlow Hub deploy\n  network: ${network}\n`);

  // 1. build all contracts
  console.log("▶ Building contracts (stellar contract build)...");
  run("stellar", ["contract", "build"], { cwd: CONTRACTS_DIR });
  console.log("  ✓ build complete");

  // 2. ensure the deployer key is in the stellar-cli keychain
  ensureKey(DEPLOYER_ALIAS, secret);
  const admin = keyAddress(DEPLOYER_ALIAS);
  console.log(`  deployer: ${admin}`);

  // 3. deploy the contracts
  const registryId = deployContract("registry", wasmPath("registry"), network, DEPLOYER_ALIAS);
  const escrowId = deployContract("escrow", wasmPath("escrow"), network, DEPLOYER_ALIAS);
  const paymentId = deployContract("payment", wasmPath("payment"), network, DEPLOYER_ALIAS);

  // 4. initialize (deployer becomes admin everywhere)
  console.log("\n▶ Initializing contracts...");
  invokeContract(network, registryId, "initialize", ["--admin", admin], DEPLOYER_ALIAS);
  console.log("  ✓ registry.initialize");
  invokeContract(network, escrowId, "initialize", ["--admin", admin], DEPLOYER_ALIAS);
  console.log("  ✓ escrow.initialize");
  invokeContract(network, paymentId, "initialize", ["--admin", admin, "--registry", registryId], DEPLOYER_ALIAS);
  console.log("  ✓ payment.initialize");

  // 5. register escrow in the registry so the payment contract can find it
  console.log("\n▶ Registering escrow in registry...");
  invokeContract(
    network,
    registryId,
    "register",
    ["--caller", admin, "--key", "escrow", "--address", escrowId],
    DEPLOYER_ALIAS,
  );
  console.log("  ✓ registry.register(escrow)");

  // 6. persist addresses
  writeContractEnv(network, { registry: registryId, escrow: escrowId, payment: paymentId });

  console.log("\nDone! Next steps:");
  console.log(`  cp .env.contracts .env  (or add the STELLARFLOW_*_CONTRACT values to .env)`);
  console.log(`  pnpm verify -- --network ${network}`);
  console.log(`  pnpm seed`);
}

main().catch((e) => {
  console.error(`\nDeploy failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
