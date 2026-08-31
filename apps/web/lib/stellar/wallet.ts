import * as freighter from "@stellar/freighter-api";
import type { Signer } from "@stellarflow/sdk";
import { Network } from "@stellarflow/types";
import { WalletNotInstalledError } from "@/lib/errors";

export interface WalletInfo {
  publicKey: string;
  network: Network;
  networkPassphrase: string;
}

export function isFreighterInstalled(): boolean {
  try {
    return typeof freighter.getPublicKey === "function";
  } catch {
    return false;
  }
}

/** Map Freighter's network strings to our network names. */
function networkFromFreighter(freighterNetwork: string): Network {
  switch (freighterNetwork) {
    case "PUBLIC":
      return "mainnet";
    case "STANDALONE":
      return "local";
    default:
      return "testnet";
  }
}

/** Map our network names to Freighter's network strings. */
function freighterNetwork(network: Network): string {
  switch (network) {
    case "mainnet":
      return "PUBLIC";
    case "local":
      return "STANDALONE";
    default:
      return "TESTNET";
  }
}

/**
 * Ask Freighter for the connected account and network.
 * Throws WalletNotInstalledError if Freighter is unavailable.
 */
export async function getWalletInfo(expectedPassphrase: string): Promise<WalletInfo | null> {
  if (!isFreighterInstalled()) {
    throw new WalletNotInstalledError();
  }
  const connected = await freighter.isConnected();
  if (!connected) return null;

  const publicKey = await freighter.getPublicKey();
  const details = await freighter.getNetworkDetails();

  return {
    publicKey,
    network: networkFromFreighter(details.network),
    networkPassphrase: details.networkPassphrase || expectedPassphrase,
  };
}

/** Request access (first-time connect prompt) and return the wallet info. */
export async function connectWallet(expectedPassphrase: string): Promise<WalletInfo> {
  if (!isFreighterInstalled()) {
    throw new WalletNotInstalledError();
  }
  await freighter.requestAccess();
  const info = await getWalletInfo(expectedPassphrase);
  if (!info) {
    throw new WalletNotInstalledError();
  }
  return info;
}

/** Build an SDK signer that routes signing through Freighter. */
export function createFreighterSigner(info: WalletInfo): Signer {
  const network = freighterNetwork(info.network);
  return {
    publicKey: info.publicKey,
    signTransaction: async (txXdr, opts) =>
      freighter.signTransaction(txXdr, {
        ...opts,
        network,
        networkPassphrase: info.networkPassphrase,
      }),
  };
}
