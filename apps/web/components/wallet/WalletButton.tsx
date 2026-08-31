"use client";

import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { useWallet } from "@/hooks/useWallet";
import { truncateAddress } from "@/lib/utils";
import { useNotifications } from "@/components/notifications/NotificationProvider";

export function WalletButton() {
  const { publicKey, network, isInstalled, isConnecting, connect, disconnect, error } = useWallet();
  const { notify } = useNotifications();

  const handleConnect = useCallback(async () => {
    try {
      await connect();
      notify("success", "Wallet connected");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not connect wallet";
      notify("error", message);
    }
  }, [connect, notify]);

  useEffect(() => {
    if (error) notify("error", error.message);
  }, [error, notify]);

  if (publicKey) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-full border border-ink-100 bg-white px-2.5 py-1 text-xs text-ink-800 sm:inline-flex">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
          {network === "mainnet" ? "Mainnet" : network === "local" ? "Local" : "Testnet"}
        </span>
        <Button variant="secondary" size="sm" onClick={disconnect} title={publicKey}>
          {truncateAddress(publicKey)}
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" onClick={handleConnect} loading={isConnecting}>
      {isConnecting
        ? "Connecting…"
        : isInstalled
          ? "Connect wallet"
          : "Install Freighter"}
    </Button>
  );
}
