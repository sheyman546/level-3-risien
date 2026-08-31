"use client";

import { useState } from "react";
import { Payment } from "@stellarflow/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PaymentStatusBadge } from "@/components/ui/StatusBadge";
import { formatAmount, formatDateTime, truncateAddress } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { usePayments } from "@/hooks/usePayments";
import { useWallet } from "@/hooks/useWallet";

export function PaymentCard({ payment }: { payment: Payment }) {
  const { publicKey } = useWallet();
  const { approvePayment, executePayment, cancelPayment, refresh } = usePayments();
  const [confirming, setConfirming] = useState<string | null>(null);

  const isCreator = publicKey === payment.creator;
  const isRecipient = publicKey === payment.recipient;
  const canApprove = isCreator && payment.status === "Created";
  const canExecute = isCreator && payment.status === "Approved";
  const canCancel = isCreator && (payment.status === "Created" || payment.status === "Approved");

  const runAction = async (action: () => Promise<unknown>) => {
    const ok = await action();
    if (ok !== null) await refresh();
    setConfirming(null);
  };

  const confirmButton = (key: string, label: string, fn: () => Promise<unknown>, danger = false) => {
    if (confirming === key) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <Button size="sm" variant={danger ? "danger" : "primary"} onClick={() => runAction(fn)}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
        </span>
      );
    }
    return (
      <Button size="sm" variant={danger ? "danger" : "secondary"} onClick={() => setConfirming(key)}>
        {label}
      </Button>
    );
  };

  return (
    <Card padded={false} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-ink-900">#{payment.id}</span>
          <PaymentStatusBadge status={payment.status} />
        </div>
        <p className="mt-1 truncate text-xs text-ink-800/60">
          {truncateAddress(payment.creator)} → {truncateAddress(payment.recipient)}
        </p>
        <p className="mt-0.5 text-xs text-ink-800/50">
          {formatAmount(payment.amount)} · deadline {formatDateTime(payment.deadline)}
          {payment.escrowId > 0 ? ` · escrow #${payment.escrowId}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {(canApprove || canExecute || canCancel) && (
          <>
            {canApprove && confirmButton("approve", "Approve", () => approvePayment.run(payment.id))}
            {canExecute && confirmButton("execute", "Execute", () => executePayment.run(payment.id))}
            {canCancel && confirmButton("cancel", "Cancel", () => cancelPayment.run(payment.id), true)}
            {approvePayment.status === "failed" && (
              <span className="text-xs text-red-600">{getErrorMessage(approvePayment.error)}</span>
            )}
            {executePayment.status === "failed" && (
              <span className="text-xs text-red-600">{getErrorMessage(executePayment.error)}</span>
            )}
          </>
        )}
        {isRecipient && <span className="text-xs text-ink-800/40">recipient</span>}
      </div>
    </Card>
  );
}
