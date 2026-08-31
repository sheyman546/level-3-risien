"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Escrow } from "@stellarflow/types";
import { CreateEscrowInput } from "@stellarflow/sdk";
import { escrowClient } from "@/lib/contracts/escrow";
import { StellarFlowError, toStellarFlowError } from "@/lib/errors";
import { useContractCall } from "@/hooks/useContractCall";
import { useWallet } from "@/hooks/useWallet";

export function useEscrow() {
  const { signer, isConnected, publicKey } = useWallet();
  const [escrows, setEscrows] = useState<Escrow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<StellarFlowError | null>(null);

  const client = useMemo(() => {
    try {
      return escrowClient(signer ?? undefined);
    } catch (e) {
      setError(toStellarFlowError(e));
      return null;
    }
  }, [signer]);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      setEscrows(await client.listEscrows());
    } catch (e) {
      setError(toStellarFlowError(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createEscrow = useContractCall(
    useCallback(
      (onPhase, input: CreateEscrowInput) => {
        if (!client) throw new Error("Escrow client is not available");
        return client.createEscrow(input, onPhase);
      },
      [client],
    ),
  );

  const release = useContractCall(
    useCallback(
      (onPhase, id: number) => {
        if (!client || !publicKey) throw new Error("Escrow client is not available");
        return client.release(publicKey, id, onPhase);
      },
      [client, publicKey],
    ),
  );

  const refund = useContractCall(
    useCallback(
      (onPhase, id: number) => {
        if (!client || !publicKey) throw new Error("Escrow client is not available");
        return client.refund(publicKey, id, onPhase);
      },
      [client, publicKey],
    ),
  );

  const dispute = useContractCall(
    useCallback(
      (onPhase, id: number) => {
        if (!client || !publicKey) throw new Error("Escrow client is not available");
        return client.dispute(publicKey, id, onPhase);
      },
      [client, publicKey],
    ),
  );

  return {
    escrows,
    loading,
    error,
    refresh,
    createEscrow,
    release,
    refund,
    dispute,
    isConnected,
    publicKey,
  };
}
