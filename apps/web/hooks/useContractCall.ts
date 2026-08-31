"use client";

import { useCallback, useState } from "react";
import { TxPhase, WriteResult } from "@stellarflow/sdk";
import { StellarFlowError, toStellarFlowError } from "@/lib/errors";

/**
 * Transaction status machine surfaced to the UI:
 *   idle -> connecting -> waiting_approval -> pending -> confirmed
 *                     \-> failed
 */
export type ContractCallStatus =
  | "idle"
  | "connecting"
  | "waiting_approval"
  | "submitting"
  | "pending"
  | "confirmed"
  | "failed";

export interface UseContractCallResult<TArgs extends unknown[], TResult> {
  status: ContractCallStatus;
  error: StellarFlowError | null;
  txHash: string | null;
  result: TResult | null;
  run: (...args: TArgs) => Promise<TResult | null>;
  reset: () => void;
}

/**
 * Runs a contract write with progress callbacks wired to the status machine.
 *
 *   const create = useContractCall((onPhase, input: CreatePaymentInput) =>
 *     client.createPayment(input, onPhase),
 *   );
 *   await create.run(input);
 */
export function useContractCall<TArgs extends unknown[], TResult>(
  fn: (onPhase: (phase: TxPhase) => void, ...args: TArgs) => Promise<WriteResult<TResult>>,
): UseContractCallResult<TArgs, TResult> {
  const [status, setStatus] = useState<ContractCallStatus>("idle");
  const [error, setError] = useState<StellarFlowError | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [result, setResult] = useState<TResult | null>(null);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setStatus("connecting");
      setError(null);
      setTxHash(null);
      setResult(null);
      try {
        const res = await fn(
          (phase) =>
            setStatus(phase === "waiting_approval" ? "waiting_approval" : phase),
          ...args,
        );
        setTxHash(res.hash || null);
        setResult(res.result);
        setStatus("confirmed");
        return res.result;
      } catch (e) {
        setError(toStellarFlowError(e));
        setStatus("failed");
        return null;
      }
    },
    [fn],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
    setResult(null);
  }, []);

  return { status, error, txHash, result, run, reset };
}
