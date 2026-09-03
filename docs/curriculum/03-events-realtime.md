# 3. Event Streaming & Real-Time Updates

The bridge between on-chain state and off-chain products: what to emit, how
to consume it, and how to push it to a UI reactively.

## 3.1 Designing meaningful events

Events are the **public API of your state changes** — off-chain consumers
(and the frontend) depend on them as much as on your functions. Design
rules that hold everywhere:

- Emit **after** state changes (CEI) so the event reflects committed state,
  and so reentrant observers can't see stale logs.
- Up to **3 indexed parameters** (each costs an extra topic); index the
  fields consumers filter by (ids, addresses, status), keep amounts
  non-indexed. Indexed strings/arrays get hashed — only index what you
  query by.

```solidity
// Payment.sol
event PaymentCreated(
    uint256 indexed paymentId,
    address indexed payer,
    address indexed payee,
    uint256 amount,          // not indexed — queried as value, not filter
    uint256 deadline
);
event PaymentStatusChanged(uint256 indexed paymentId, Status indexed from, Status to);
```

- **Name for the domain, not the implementation** (`PaymentCreated`, not
  `PaymentStored`). Use consistent verbs per state (`Created`, `Approved`,
  `Executed`, `Cancelled`, `Released`, `Refunded`, `Disputed`, `Resolved`).
- **Version your schema**: append fields to the end when evolving; add a
  `uint256 version` field if consumers must handle breaking changes.
- Emit `Transfer`/`Approval`-style events for balance-moving functions too —
  explorers, wallets, and indexers key off those conventions.

## 3.2 Listening with viem (WebSocket + polling fallback)

`watchContractEvent` with a **WebSocket transport** is push-based and fast;
add `poll: true` (or a polling transport) as a fallback when WS is
unavailable — every dApp should tolerate both. Handle **reorgs**: don't
trust logs until they're deep enough, and dedupe by
`blockHash + transactionHash + logIndex`.

```ts
import { createPublicClient, webSocket, http } from "viem";
import { mainnet } from "viem/chains";
import { paymentAbi } from "./abi";

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: webSocket("wss://eth-mainnet.g.alchemy.com/v2/..."),
});

export function watchPaymentCreated(onLog: (l: PaymentCreatedLog) => void) {
  const unwatch = publicClient.watchContractEvent({
    address: paymentAddress,
    abi: paymentAbi,
    eventName: "PaymentCreated",
    poll: true,                 // fallback: poll every 4s if WS drops
    pollingInterval: 4_000,
    onLogs: (logs) => {
      for (const log of logs) {
        const { blockHash, blockNumber, transactionHash } = log;
        // skip logs without finality (reorg window) — or buffer by block
        if (!blockHash) continue;
        onLog({ ...log.args, blockNumber, transactionHash });
      }
    },
  });
  return unwatch;
}
```

For "the last N historical + subscribe going forward", query
`getLogs`/`getContractEvents` first, then start the watcher — and dedupe
against the cursor you already processed (your indexer does exactly this
with its stored ledger cursor).

## 3.3 Indexing: The Graph vs a custom indexer

Events alone can't answer "all payments for user X, paginated, filtered by
status, joined with metadata." That's what an indexer does.

### The Graph (subgraphs)

```yaml
# subgraph.yaml
specVersion: 1.0.0
schema:
  file: ./schema.graphql
dataSources:
  - kind: ethereum/contract
    name: Payment
    network: mainnet
    source:
      address: "0x..."
      abi: Payment
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript   # TS mappings are rolling out
      entities:
        - Payment
      abis:
        - name: Payment
          file: ./abis/Payment.json
      eventHandlers:
        - event: PaymentCreated(uint256,address,address,uint256,uint256)
          handler: handlePaymentCreated
      file: ./src/payment.ts
```

```ts
// schema.graphql
type Payment @entity {
  id: ID!
  payer: Bytes!
  payee: Bytes!
  amount: BigInt!
  status: Status!
  createdAt: BigInt!
}
```

```ts
// src/payment.ts (graph-ts)
import { PaymentCreated } from "../generated/Payment/Payment";
import { Payment } from "../generated/schema";

export function handlePaymentCreated(event: PaymentCreated): void {
  const payment = new Payment(event.params.paymentId.toString());
  payment.payer = event.params.payer;
  payment.payee = event.params.payee;
  payment.amount = event.params.amount;
  payment.status = "CREATED";
  payment.createdAt = event.block.timestamp;
  payment.save(); // upsert semantics, GraphQL queryable
}
```

**Status check (2025-2026):** the **hosted service has been deprecated** —
new subgraphs deploy via **Subgraph Studio** to the decentralized network.
For private or latency-sensitive data, self-host `graph-node` or use a
managed alternative (Goldsky, Alchemy Subgraphs).

### Custom indexer (Ponder-style) — what StellarFlow already does

Ponder is the modern TypeScript indexer: define sources in
`ponder.config.ts`, handle events in plain TS files, state lands in
Postgres/SQLite, dev mode hot-reloads. A hand-rolled indexer is the same
pipeline: **RPC poller/WS listener → decode → normalize → validate → store →
publish**. You control latency, schema, and cost; you pay for
infrastructure and edge cases (reorgs, gaps, backfills, RPC rate limits).

| | The Graph | Custom indexer (Ponder/DIY) |
| --- | --- | --- |
| Setup speed | Fast; hosted infra | You run/stage infra |
| Query language | GraphQL out of the box | SQL / your own API |
| Latency | Indexing delay (~seconds–minutes) | As low as your poll interval |
| Data flexibility | Entity model; good for graphs | Full SQL joins, analytics |
| Cost | Per-query + indexing | Infra you control |
| Control/ops | Limited (decentralized network) | Total (yours) |
| Best for | Public data products, analytics, explorer UIs | App-specific state, dashboards, SSO'd feeds |

**Pragmatic split:** public-facing explorer/analytics → The Graph;
app-internal state feeds, activity streams, and anything needing joins with
off-chain data → custom indexer. StellarFlow's split (indexer feeds the
app; docs/README describe explorer-style queries) matches this.

## 3.4 Pushing updates to the frontend

Three transports, in order of preference for a dApp:

1. **SSE** (Server-Sent Events) — one-way server→client over plain HTTP,
   auto-reconnect built in, trivial to proxy through Next.js. Ideal for
   activity feeds. This is what StellarFlow uses.
2. **WebSockets** — bidirectional; needed for chat/collab, overkill for
   on-chain notifications.
3. **Polling** — always keep as fallback; also the only option if your
   indexer is down.

Next.js App Router SSE route (proxying your indexer's stream):

```ts
// app/api/activity/route.ts
export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const es = new EventSource(INDEXER_SSE_URL); // your indexer
      es.onmessage = (e) =>
        controller.enqueue(encoder.encode(`data: ${e.data}\n\n`));
      es.onerror = () => { /* reconnect handled by EventSource */ };
      req.on("close", () => es.close());
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
```

Client side, keep the stream out of React's render cycle and subscribe via a
store (`useSyncExternalStore`) so components re-render only when new events
arrive; overlay with TanStack Query for the REST/historical data so a missed
SSE event self-heals on refetch (see §7 for optimistic updates).

```tsx
// hooks/useActivity.ts
export function useActivity() {
  const events = useSyncExternalStore(subscribe, getSnapshot);
  return events;
}
```

Pitfalls: unbounded event growth (cap the buffer / paginate into the DB);
SSE through proxies that buffer (disable buffering, keep-alive pings);
mobile browsers backgrounding the tab (reconnect + refetch on `focus`);
clock skew if you timestamp client-side — prefer the indexer's block time.

## Mapping to StellarFlow

- Your contracts emit exactly the right shape of typed events
  (`payment_created`, `escrow_released`, …) — the naming/versioning
  discipline in §3.1 is already followed.
- `services/event-indexer` *is* the custom-indexer column of the §3.3
  table: poll RPC → decode (XDR) → normalize (Zod-validated) → Postgres →
  publish. The README notes it polls without WS push yet — the EVM recipe
  above (WS watcher with polling fallback + cursor) is the upgrade path.
- SSE → `useActivity` hook is exactly §3.4; the REST fallback endpoint
  covers the polling fallback.
- The Graph equivalent for Stellar is *Stellar indexers* (Soroban
  subgraphs / stellar-indexer tooling); the decision table is unchanged.

**Next:** [04-cicd.md](04-cicd.md)