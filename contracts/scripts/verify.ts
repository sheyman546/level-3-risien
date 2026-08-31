/**
 * Sanity-checks the deployed contract suite with read-only invocations:
 *   - registry: admin + get_contract("escrow")
 *   - escrow:   admin + escrows()
 *   - payment:  admin + registry + payments()
 *
 * Usage:
 *   pnpm tsx contracts/scripts/verify.ts --network testnet
 */

import { invokeContract, NETWORK_CONFIG, readDeployedIds, resolveNetwork } from "./common";

async function main(): Promise<void> {
  const network = resolveNetwork(process.argv.slice(2));
  const ids = readDeployedIds();
  const cfg = NETWORK_CONFIG[network];
  console.log(`Verifying StellarFlow contracts on ${network} (${cfg.rpcUrl})\n`);

  const checks: Array<[string, string, string, string[]]> = [
    ["registry", ids.registry, "admin", []],
    ["registry", ids.registry, "get_contract", ["--key", "escrow"]],
    ["registry", ids.registry, "is_registered", ["--key", "escrow"]],
    ["escrow", ids.escrow, "admin", []],
    ["escrow", ids.escrow, "escrows", []],
    ["payment", ids.payment, "admin", []],
    ["payment", ids.payment, "registry", []],
    ["payment", ids.payment, "payments", []],
  ];

  let failed = 0;
  for (const [name, id, method, args] of checks) {
    try {
      const out = invokeContract(network, id, method, args, "stellarflow-deployer");
      console.log(`  ✓ ${name}.${method} -> ${out || "(ok)"}`);
    } catch (e) {
      failed += 1;
      console.error(`  ✗ ${name}.${method}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed ✓");
}

main().catch((e) => {
  console.error(`\nVerify failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
