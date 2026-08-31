import Link from "next/link";
import { Card } from "@/components/ui/Card";

const features = [
  {
    title: "Smart payments",
    description: "Create, approve, execute and cancel payments on-chain with a strict status lifecycle.",
  },
  {
    title: "Escrow with disputes",
    description: "Lock funds in escrow, release or refund them, and resolve disputes through an admin.",
  },
  {
    title: "Contract registry",
    description: "A service registry lets contracts discover each other at runtime instead of hard-coding addresses.",
  },
  {
    title: "Real-time activity",
    description: "Contract events are indexed and streamed to the UI over SSE — no refresh needed.",
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <section className="py-12 text-center sm:py-16">
        <p className="mb-3 inline-block rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
          Stellar · Soroban · Testnet
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          Smart payments &amp; escrow,{" "}
          <span className="text-brand-600">on Stellar</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-ink-800/70">
          StellarFlow Hub is a full-stack Soroban dApp: three interoperating contracts, an event
          indexer that streams activity to the UI, and a responsive wallet-first frontend.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Open the dashboard
          </Link>
          <Link
            href="/payments/new"
            className="rounded-lg border border-ink-100 bg-white px-5 py-2.5 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50"
          >
            Create a payment
          </Link>
        </div>
      </section>

      <section className="grid gap-4 pb-12 sm:grid-cols-2">
        {features.map((f) => (
          <Card key={f.title}>
            <h2 className="text-sm font-semibold text-ink-900">{f.title}</h2>
            <p className="mt-1.5 text-sm text-ink-800/60">{f.description}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
