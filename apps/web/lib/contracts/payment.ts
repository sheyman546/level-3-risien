import { PaymentsClient } from "@stellarflow/sdk";
import { getWebContractAddresses, getWebNetworkConfig } from "@/lib/stellar/client";
import type { Signer } from "@stellarflow/sdk";

let cached: PaymentsClient | null = null;

/** Build (and memoize) a PaymentsClient for the current network config. */
export function paymentsClient(signer?: Signer): PaymentsClient {
  const config = getWebNetworkConfig();
  const addresses = getWebContractAddresses();
  if (!addresses.payment) {
    throw new Error(
      "Payment contract is not configured. Set NEXT_PUBLIC_STELLARFLOW_PAYMENT_CONTRACT in .env",
    );
  }
  if (signer) {
    cached = new PaymentsClient({
      contractId: addresses.payment,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      signer,
    });
    return cached;
  }
  if (!cached) {
    cached = new PaymentsClient({
      contractId: addresses.payment,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
    });
  }
  return cached;
}
