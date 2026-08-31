import {
  ContractAddresses,
  DEFAULT_HORIZON_URLS,
  DEFAULT_RPC_URLS,
  NETWORK_PASSPHRASES,
  Network,
  NetworkConfig,
} from "@stellarflow/types";

/**
 * Network configuration for the browser.
 *
 * Server-side tooling (SDK, indexer, deploy scripts) uses `@stellarflow/config`
 * with plain `STELLARFLOW_*` vars; the browser bundle can only see `NEXT_PUBLIC_*`
 * vars, so the web app reads those here.
 */

function pickNetwork(): Network {
  const value = process.env.NEXT_PUBLIC_STELLARFLOW_NETWORK;
  if (value === "mainnet" || value === "local" || value === "testnet") return value;
  return "testnet";
}

export function getWebNetworkConfig(): NetworkConfig {
  const network = pickNetwork();
  return {
    network,
    rpcUrl: process.env.NEXT_PUBLIC_STELLARFLOW_RPC_URL || DEFAULT_RPC_URLS[network],
    horizonUrl: process.env.NEXT_PUBLIC_STELLARFLOW_HORIZON_URL || DEFAULT_HORIZON_URLS[network],
    networkPassphrase:
      process.env.NEXT_PUBLIC_STELLARFLOW_NETWORK_PASSPHRASE || NETWORK_PASSPHRASES[network],
  };
}

export function getWebContractAddresses(): ContractAddresses {
  return {
    payment: process.env.NEXT_PUBLIC_STELLARFLOW_PAYMENT_CONTRACT || undefined,
    escrow: process.env.NEXT_PUBLIC_STELLARFLOW_ESCROW_CONTRACT || undefined,
    registry: process.env.NEXT_PUBLIC_STELLARFLOW_REGISTRY_CONTRACT || undefined,
  };
}

export function getIndexerUrl(): string {
  return process.env.NEXT_PUBLIC_STELLARFLOW_INDEXER_URL || "http://localhost:4000";
}
