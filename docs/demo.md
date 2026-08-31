# Demo

One complete flow, from wallet to on-chain event to live UI update.

## Flow

```text
Connect wallet (Freighter)
      ↓
Create a payment (payments/new)
      ↓
Contract call: create_payment (sign in Freighter)
      ↓
Approve the payment
      ↓
Execute the payment
      ↓
Cross-contract call: registry → escrow (funds locked)
      ↓
Events emitted (payment_completed, escrow_created)
      ↓
Indexer detects events from RPC
      ↓
Frontend activity feed updates in real time (SSE)
      ↓
Recipient releases the escrow → funds arrive
```

## Prerequisites

1. Contracts deployed on testnet: `STELLARFLOW_SECRET_KEY=S… pnpm deploy:testnet`
2. Postgres running: `pnpm db:up`
3. Indexer running: `pnpm dev:indexer` (with contract ids in `.env`)
4. Web app running: `pnpm dev:web`
5. A funded testnet account in Freighter, holding the demo token
   (`STELLARFLOW_ASSET_CONTRACT`), plus a second account as recipient
   (fund via `https://friendbot.stellar.org?addr=G…`)

## Script (approx. 5 minutes)

### 1. Connect
Open the app, click **Connect wallet**, approve in Freighter. The button
shows your truncated address and the network badge (Testnet).

### 2. Create a payment
`/payments/new`: enter the recipient, amount (e.g. `5`), the asset contract
id, and a deadline. Submit — note the in-form states: "Connecting…",
"Waiting for approval…", "Transaction pending…", then "Payment created ✓".

### 3. Approve & execute
On `/payments` find the payment (status `Created`) → **Approve** → the status
becomes `Approved` → **Execute** (two-step confirm) → status becomes
`Executed` and the card shows the linked `escrow #N`.

### 4. Watch it live
Open `/activity` in a second tab **before** executing. The feed updates by
itself: `payment created`, `payment approved`, `escrow created`,
`payment completed` — no refresh needed. Kill the indexer to see the
"Reconnecting…" state, then restart it and watch it recover.

### 5. Release the escrow
On `/escrow`, the funds are `Locked`. If you're the beneficiary (or the
depositor), click **Release** (two-step confirm). The escrow becomes
`Released` and the beneficiary's balance increases. To show the dispute
path, open a **Dispute** instead and resolve it as the admin via the CLI:

```bash
stellar contract invoke --id $STELLARFLOW_ESCROW_CONTRACT \
  --source-account stellarflow-deployer --network testnet -- \
  resolve_dispute --id 1 --pay_beneficiary true
```

### 6. Alt path: seed script
Skip the UI and run the whole loop from the CLI:

```bash
pnpm seed -- --recipient G… --amount 5 --release
```

## What to point out

- Multi-contract architecture: the payment contract discovers the escrow
  contract through the registry at runtime (no hard-coded addresses).
- Events → indexer → SSE → UI: the activity page updates without a refresh.
- Error handling: reject the wallet signature mid-flow to see the friendly
  error; try executing an unapproved payment to see "Invalid state".
- Tests: `pnpm test && pnpm contracts:test` covers the flows above.
