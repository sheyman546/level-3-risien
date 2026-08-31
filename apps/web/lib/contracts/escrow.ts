import { EscrowClient } from "@stellarflow/sdk";
import type { Signer } from "@stellarflow/sdk";
import { getWebContractAddresses, getWebNetworkConfig } from "@/lib/stellar/client";

let cached: EscrowClient | null = null;

/** Build (and memoize) an EscrowClient for the current network config. */
export function escrowClient(signer?: Signer): EscrowClient {
  const config = getWebNetworkConfig();
  const addresses = getWebContractAddresses();
  if (!addresses.escrow) {
    throw new Error(
      "Escrow contract is not configured. Set NEXT_PUBLIC_STELLARFLOW_ESCROW_CONTRACT in .env",
    );
  }
  if (signer) {
    cached = new EscrowClient({
      contractId: addresses.escrow,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      signer,
    });
    return cached;
  }
  if (!cached) {
    cached = new EscrowClient({
      contractId: addresses.escrow,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
    });
  }
  return cached;
}
