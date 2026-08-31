# Frontend

Next.js 15 (App Router) + TypeScript + Tailwind CSS, with Zod validation and
Vitest/Testing Library for tests. All pages are responsive (mobile/tablet/desktop).

## Pages

| Route | What it does |
| --- | --- |
| `/` | Landing page |
| `/dashboard` | Stats, recent payments and escrow summary |
| `/payments` | Payment list with approve/execute/cancel actions |
| `/payments/new` | Create payment form (zod validation + tx states) |
| `/escrow` | Escrow list with release/refund/dispute + create-escrow form |
| `/activity` | Live activity feed via SSE |
| `/api/health` | Health check |
| `/api/activity` | REST fallback proxying the indexer |

## Structure

```text
app/          pages + API routes
components/
  ui/         Button, Card, Badge, Input, Select, Spinner, Skeleton, …
  wallet/     WalletProvider, WalletButton (Freighter)
  notifications/  toast system
  payments/   PaymentForm, PaymentList, PaymentCard
  escrow/     EscrowForm, EscrowList, EscrowCard
  activity/   ActivityFeed (SSE), ActivityItem
hooks/        useWallet, useContractCall, usePayments, useEscrow, useActivity
lib/
  stellar/    Freighter adapter + client-side network config (NEXT_PUBLIC_*)
  contracts/  memoized contract client factories
  api/        fetch wrapper
  validation/ zod schemas
  errors.ts   friendly error messages
```

## Transaction UX

`useContractCall` drives a status machine that the UI renders:

```text
idle → connecting → waiting_approval → pending → confirmed
                       ↘ failed
```

Messages shown: "Connecting wallet…", "Waiting for approval…", "Transaction
pending…", "Transaction confirmed.", plus mapped error messages for wallet
rejection, insufficient balance, invalid input, contract failure, network
failure, timeout, and indexer delays.

## Wallet (Freighter)

`lib/stellar/wallet.ts` adapts Freighter to the SDK `Signer` interface.
Contract calls go through the typed SDK clients, which sign via Freighter and
submit through Soroban RPC.

## Browser environment variables

The browser can only see `NEXT_PUBLIC_*` variables:

```text
NEXT_PUBLIC_STELLARFLOW_NETWORK=testnet
NEXT_PUBLIC_STELLARFLOW_RPC_URL=
NEXT_PUBLIC_STELLARFLOW_PAYMENT_CONTRACT=C…
NEXT_PUBLIC_STELLARFLOW_ESCROW_CONTRACT=C…
NEXT_PUBLIC_STELLARFLOW_REGISTRY_CONTRACT=C…
NEXT_PUBLIC_STELLARFLOW_INDEXER_URL=http://localhost:4000
```

## Real-time activity

`useActivity` opens `EventSource(<indexer>/events)`, prepends events to the
feed, shows live/reconnecting states, and loads history from
`/events/recent` on mount. When the indexer is down the UI degrades
gracefully (offline badge, REST fallback).

## Tests

```bash
pnpm --filter @stellarflow/web test
```

Coverage includes: wallet connection (Freighter mock), payment form
validation, loading/error/success states, transaction status machine, and
real-time activity via a fake EventSource.
