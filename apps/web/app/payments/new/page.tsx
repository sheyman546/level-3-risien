"use client";

import Link from "next/link";
import { PaymentForm } from "@/components/payments/PaymentForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

export default function NewPaymentPage() {
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="New payment"
        description="Funds are only moved when the payment is approved and executed."
        actions={
          <Link href="/payments">
            <Button variant="ghost" size="sm">
              ← Back
            </Button>
          </Link>
        }
      />
      <PaymentForm />
    </div>
  );
}
