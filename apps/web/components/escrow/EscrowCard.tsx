"use client";

import { useState } from "react";
import { Escrow } from "@stellarflow/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EscrowStatusBadge } from "@/components/ui/StatusBadge";
import { formatAmount, formatDateTime, truncateAddress } from "@/lib/utils";
import { useEscrow } from "@/hooks/useEscrow";
import { useWallet } from "@/hooks/useWallet";

export function EscrowCard({ escrow }: { escrow: Escrow }) {
  const { publicKey } = useWallet();
  const { release, refund, dispute, refresh } = useEscrow();
  const [confirming, setConfirming] = useState<string | null>(null);

  const isParty = publicKey === escrow.depositor || publicKey === escrow.beneficiary;
  const isDepositor = publicKey === escrow.depositor;
  const canRelease = isParty && escrow.status === "Locked";
  const canRefund = isDepositor && escrow.status === "Locked";
  const canDispute = isParty && escrow.status === "Locked";

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
          <span className="font-mono text-sm font-semibold text-ink-900">#{escrow.id}</span>
          <EscrowStatusBadge status={escrow.status} />
        </div>
        <p className="mt-1 truncate text-xs text-ink-800/60">
          {truncateAddress(escrow.depositor)} → {truncateAddress(escrow.beneficiary)}
        </p>
        <p className="mt-0.5 text-xs text-ink-800/50">
          {formatAmount(escrow.amount)} · created {formatDateTime(escrow.createdAt)} · timeout{" "}
          {formatDateTime(escrow.timeout)}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {canRelease && confirmButton("release", "Release", () => release.run(escrow.id))}
        {canRefund && confirmButton("refund", "Refund", () => refund.run(escrow.id), true)}
        {canDispute && confirmButton("dispute", "Dispute", () => dispute.run(escrow.id))}
      </div>
    </Card>
  );
}
