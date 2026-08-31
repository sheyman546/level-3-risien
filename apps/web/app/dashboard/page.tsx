"use client";

import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { usePayments } from "@/hooks/usePayments";
import { useEscrow } from "@/hooks/useEscrow";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatAmount, truncateAddress } from "@/lib/utils";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card padded={false} className="p-4">
      <p className="text-xs font-medium text-ink-800/50">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-800/40">{sub}</p>}
    </Card>
  );
}

export default function DashboardPage() {
  const { publicKey, network, isConnected } = useWallet();
  const { payments, loading: paymentsLoading } = usePayments();
  const { escrows, loading: escrowsLoading } = useEscrow();

  const activePayments = payments?.filter((p) => p.status === "Created" || p.status === "Approved") ?? [];
  const lockedEscrows = escrows?.filter((e) => e.status === "Locked") ?? [];
  const escrowedAmount = lockedEscrows.reduce((sum, e) => sum + e.amount, 0n);

  if (!isConnected) {
    return (
      <Card className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-lg font-semibold text-ink-900">Connect your wallet to get started</h1>
        <p className="mt-2 text-sm text-ink-800/60">
          Your dashboard shows payments, escrows and live activity from the StellarFlow contracts.
        </p>
        <Link href="/payments/new" className="mt-4 inline-block">
          <Button>Create a payment</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900">Dashboard</h1>
        <p className="mt-1 font-mono text-sm text-ink-800/50">
          {truncateAddress(publicKey ?? "")} · {network}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active payments"
          value={paymentsLoading && !payments ? "…" : String(activePayments.length)}
          sub={`${payments?.length ?? 0} total`}
        />
        <StatCard
          label="Locked escrows"
          value={escrowsLoading && !escrows ? "…" : String(lockedEscrows.length)}
          sub={`${escrows?.length ?? 0} total`}
        />
        <StatCard label="Escrowed value" value={escrowedAmount > 0n ? formatAmount(escrowedAmount) : "0 XLM"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent payments"
            subtitle="Your latest payment activity"
            action={
              <Link href="/payments" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                View all →
              </Link>
            }
          />
          {paymentsLoading && !payments ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : payments && payments.length > 0 ? (
            <ul className="divide-y divide-ink-100">
              {payments.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-mono">#{p.id}</span>
                  <span className="flex-1 truncate text-ink-800/70">
                    {truncateAddress(p.recipient)}
                  </span>
                  <span className="text-xs text-ink-800/50">{p.status}</span>
                  <span className="font-medium">{formatAmount(p.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-800/50">No payments yet.</p>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Escrow summary"
            subtitle="Funds currently locked"
            action={
              <Link href="/escrow" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                Manage →
              </Link>
            }
          />
          {escrowsLoading && !escrows ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : escrows && escrows.length > 0 ? (
            <ul className="divide-y divide-ink-100">
              {escrows.slice(0, 4).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-mono">#{e.id}</span>
                  <span className="flex-1 truncate text-ink-800/70">
                    {truncateAddress(e.beneficiary)}
                  </span>
                  <span className="text-xs text-ink-800/50">{e.status}</span>
                  <span className="font-medium">{formatAmount(e.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-800/50">No escrows yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
