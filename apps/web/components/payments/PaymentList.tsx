"use client";

import { Payment } from "@stellarflow/types";
import { PaymentCard } from "@/components/payments/PaymentCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

export function PaymentList({ payments, loading }: { payments: Payment[] | null; loading: boolean }) {
  if (loading && !payments) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!payments || payments.length === 0) {
    return (
      <EmptyState
        title="No payments yet"
        description="Create your first payment to lock funds in escrow — the recipient only receives them once the payment is approved and executed."
      />
    );
  }

  return (
    <div className="space-y-3">
      {payments.map((payment) => (
        <PaymentCard key={payment.id} payment={payment} />
      ))}
    </div>
  );
}
