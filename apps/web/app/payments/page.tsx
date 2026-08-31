"use client";

import Link from "next/link";
import { usePayments } from "@/hooks/usePayments";
import { PaymentList } from "@/components/payments/PaymentList";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

export default function PaymentsPage() {
  const { payments, loading, refresh } = usePayments();

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Create payments, approve them, and execute them to lock funds in escrow."
        actions={
          <>
            <Button variant="secondary" onClick={refresh} disabled={loading}>
              Refresh
            </Button>
            <Link href="/payments/new">
              <Button>New payment</Button>
            </Link>
          </>
        }
      />
      <PaymentList payments={payments} loading={loading} />
    </div>
  );
}
