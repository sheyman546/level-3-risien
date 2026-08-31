/**
 * Seeds demo data on a network with deployed contracts:
 * creates a payment, approves it, executes it (which locks the funds in an
 * escrow), and optionally releases the escrow back to the recipient.
 *
 * Prerequisites:
 *   - contracts deployed (STELLARFLOW_PAYMENT_CONTRACT / _ESCROW_CONTRACT set)
 *   - STELLARFLOW_SECRET_KEY for a funded account
 *   - STELLARFLOW_ASSET_CONTRACT for a token the account holds
 *
 * Usage:
 *   pnpm seed                                        (recipient = seed account)
 *   pnpm seed -- --recipient G... --amount 5 --release
 */

import "dotenv/config";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { contractAddresses, networkConfig, parseEnv } from "@stellarflow/config";
import { EscrowClient, PaymentsClient } from "@stellarflow/sdk";

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

async function main(): Promise<void> {
  parseEnv();
  const net = networkConfig();
  const contracts = contractAddresses();
  const flags = parseFlags(process.argv.slice(2));

  const secret = process.env.STELLARFLOW_SECRET_KEY;
  const asset = (flags.asset as string) || process.env.STELLARFLOW_ASSET_CONTRACT;
  if (!secret) throw new Error("STELLARFLOW_SECRET_KEY is required (see .env.example)");
  if (!asset) throw new Error("STELLARFLOW_ASSET_CONTRACT is required (a token the account holds)");
  if (!contracts.payment || !contracts.escrow) {
    throw new Error("Contracts are not deployed. Run `pnpm deploy:testnet` first.");
  }

  const keypair = Keypair.fromSecret(secret);
  const signer = {
    publicKey: keypair.publicKey(),
    signTransaction: async (txXdr: string) => {
      const tx = TransactionBuilder.fromXDR(txXdr, net.networkPassphrase);
      tx.sign(keypair);
      return tx.toXDR();
    },
  };

  const recipient = (flags.recipient as string) || keypair.publicKey();
  const amount = BigInt((flags.amount as string) || "10000000"); // 1 XLM in stroops
  const deadline = Math.floor(Date.now() / 1000) + 7 * 86_400;

  const base = {
    networkPassphrase: net.networkPassphrase,
    rpcUrl: net.rpcUrl,
  };

  const payments = new PaymentsClient({ contractId: contracts.payment, ...base, signer });
  const escrows = new EscrowClient({ contractId: contracts.escrow, ...base, signer });

  const log = (label: string, result: { hash: string }) => {
    console.log(`  ✓ ${label} — tx ${result.hash || "(hash unavailable)"}`);
  };

  console.log(`Seeding demo data on ${net.network} for ${signer.publicKey}`);
  console.log(`  recipient: ${recipient}`);
  console.log(`  amount:    ${amount} stroops`);

  console.log("\n1/4 Creating payment…");
  const created = await payments.createPayment({
    creator: signer.publicKey,
    recipient,
    amount,
    asset,
    deadline,
  });
  log("create_payment", created);
  const paymentId = created.result;

  console.log("2/4 Approving payment…");
  const approved = await payments.approvePayment(signer.publicKey, paymentId);
  log("approve_payment", approved);

  console.log("3/4 Executing payment (locks funds in escrow)…");
  const executed = await payments.executePayment(signer.publicKey, paymentId);
  log("execute_payment", executed);
  const escrowId = executed.result;
  console.log(`  escrow created: #${escrowId}`);

  if (flags.release) {
    console.log("4/4 Releasing escrow…");
    const released = await escrows.release(signer.publicKey, escrowId);
    log("release", released);
  } else {
    console.log("4/4 Skipped release (pass --release to release the escrow)");
  }

  console.log("\nDone. Check the activity feed: pnpm dev:web → /activity");
}

main().catch((error) => {
  console.error(`\nSeed failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
