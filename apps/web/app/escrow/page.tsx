"use client";

import { useEscrow } from "@/hooks/useEscrow";
import { EscrowList } from "@/components/escrow/EscrowList";
import { EscrowForm } from "@/components/escrow/EscrowForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

export default function EscrowPage() {
  const { escrows, loading, refresh } = useEscrow();

  return (
    <div>
      <PageHeader
        title="Escrow"
        description="Lock funds for a beneficiary, then release, refund or dispute."
        actions={
          <Button variant="secondary" onClick={refresh} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink-800">All escrows</h2>
          <EscrowList escrows={escrows} loading={loading} />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Lock new funds</h2>
          <EscrowForm />
        </div>
      </div>
    </div>
  );
}
