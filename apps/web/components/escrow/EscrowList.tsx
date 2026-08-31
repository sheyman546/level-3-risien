"use client";

import { Escrow } from "@stellarflow/types";
import { EscrowCard } from "@/components/escrow/EscrowCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

export function EscrowList({ escrows, loading }: { escrows: Escrow[] | null; loading: boolean }) {
  if (loading && !escrows) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!escrows || escrows.length === 0) {
    return (
      <EmptyState
        title="No escrows yet"
        description="Escrows are created automatically when a payment is executed, or directly with the form above."
      />
    );
  }

  return (
    <div className="space-y-3">
      {escrows.map((escrow) => (
        <EscrowCard key={escrow.id} escrow={escrow} />
      ))}
    </div>
  );
}
