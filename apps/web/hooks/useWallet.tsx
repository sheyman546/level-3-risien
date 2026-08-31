"use client";

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";
import type { Signer } from "@stellarflow/sdk";
import { Network } from "@stellarflow/types";
import { StellarFlowError, toStellarFlowError } from "@/lib/errors";
import {
  connectWallet,
  createFreighterSigner,
  isFreighterInstalled,
  WalletInfo,
} from "@/lib/stellar/wallet";
import { getWebNetworkConfig } from "@/lib/stellar/client";

interface WalletContextValue {
  publicKey: string | null;
  network: Network | null;
  isConnected: boolean;
  isInstalled: boolean;
  isConnecting: boolean;
  error: StellarFlowError | null;
  signer: Signer | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<StellarFlowError | null>(null);

  const networkConfig = useMemo(() => getWebNetworkConfig(), []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const wallet = await connectWallet(networkConfig.networkPassphrase);
      setInfo(wallet);
    } catch (e) {
      const err = toStellarFlowError(e);
      setError(err);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, [networkConfig.networkPassphrase]);

  const disconnect = useCallback(() => {
    setInfo(null);
    setError(null);
  }, []);

  const signer = useMemo<Signer | null>(() => (info ? createFreighterSigner(info) : null), [info]);

  const value = useMemo<WalletContextValue>(
    () => ({
      publicKey: info?.publicKey ?? null,
      network: info?.network ?? null,
      isConnected: Boolean(info),
      isInstalled: isFreighterInstalled(),
      isConnecting,
      error,
      signer,
      connect,
      disconnect,
    }),
    [info, isConnecting, error, signer, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a <WalletProvider>");
  }
  return ctx;
}
