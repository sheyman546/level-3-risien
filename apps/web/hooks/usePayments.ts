"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Payment } from "@stellarflow/types";
import { CreatePaymentInput } from "@stellarflow/sdk";
import { paymentsClient } from "@/lib/contracts/payment";
import { StellarFlowError, toStellarFlowError } from "@/lib/errors";
import { useContractCall } from "@/hooks/useContractCall";
import { useWallet } from "@/hooks/useWallet";

export function usePayments() {
  const { signer, isConnected, publicKey } = useWallet();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<StellarFlowError | null>(null);

  const client = useMemo(() => {
    try {
      return paymentsClient(signer ?? undefined);
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
      setPayments(await client.listPayments());
    } catch (e) {
      setError(toStellarFlowError(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createPayment = useContractCall(
    useCallback(
      (onPhase, input: CreatePaymentInput) => {
        if (!client) throw new Error("Payment client is not available");
        return client.createPayment(input, onPhase);
      },
      [client],
    ),
  );

  const approvePayment = useContractCall(
    useCallback(
      (onPhase, id: number) => {
        if (!client || !publicKey) throw new Error("Payment client is not available");
        return client.approvePayment(publicKey, id, onPhase);
      },
      [client, publicKey],
    ),
  );

  const executePayment = useContractCall(
    useCallback(
      (onPhase, id: number) => {
        if (!client || !publicKey) throw new Error("Payment client is not available");
        return client.executePayment(publicKey, id, onPhase);
      },
      [client, publicKey],
    ),
  );

  const cancelPayment = useContractCall(
    useCallback(
      (onPhase, id: number) => {
        if (!client || !publicKey) throw new Error("Payment client is not available");
        return client.cancelPayment(publicKey, id, onPhase);
      },
      [client, publicKey],
    ),
  );

  return {
    payments,
    loading,
    error,
    refresh,
    createPayment,
    approvePayment,
    executePayment,
    cancelPayment,
    isConnected,
    publicKey,
  };
}
