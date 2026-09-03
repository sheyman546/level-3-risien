# 7. Error Handling & Loading States

Users don't see reverts — they see buttons that silently fail. Turn
byte-level failures into clear states.

## 7.1 Decoding failures: simulation first, decoding second

**Simulate before you send.** `useSimulateContract` (wagmi) runs the call
against your RPC with the user's address via `eth_call` — it returns the
exact revert before any gas is spent:

```tsx
import { useSimulateContract, useWriteContract } from "wagmi";
import { decodeErrorResult } from "viem";

const { data: simulation } = useSimulateContract({
  address: paymentAddress,
  abi: paymentAbi,
  functionName: "createPayment",
  args: [payee, amount],
});

const { writeContract } = useWriteContract();

// If simulation failed, decode the revert reason before showing anything:
function decodeRevert(bytesLike: unknown, abi: Abi): string {
  try {
    const decoded = decodeErrorResult({ abi, data: bytesLike as `0x${string}` });
    return `${decoded.errorName}(${decoded.args?.join(", ")})`;
  } catch {
    return "Transaction failed (unknown error)";
  }
}
```

Solidity revert surfaces and how to read them:

| Revert form | Looks like | Frontend handling |
| --- | --- | --- |
| Custom error | `0x` + selector (e.g. `0xcf479181` = `InsufficientBalance`) | `decodeErrorResult` with your ABI → name + args |
| `require("msg")` | `Error(string)` ABI-encoded | `decodeErrorResult` → message |
| Panic (0.8 internal) | `Panic(uint256)` — 0x11 overflow, 0x12 div-by-zero, 0x01 assert | Map code → "internal arithmetic error" |
| OOG / gas | Empty data / `Execution reverted` | "Network or gas issue — try again" |
| Wallet rejection | `User rejected the request` (EIP-1193 code 4001) | **Never** show as an error — "Transaction cancelled" |
| Wrong chain | code 4902 `Unrecognized chain` | Trigger `switchChain` (§6) |

**Map error codes to human copy in one place** (this is exactly what your
`packages/sdk/src/errors.ts` does — the EVM version is the same shape):

```ts
// lib/errors.ts — single source of truth for user-facing messages
export const ERROR_MAP: Record<string, string> = {
  InsufficientBalance: "You don't have enough funds for this payment.",
  DeadlinePassed: "This payment window has expired — create a new one.",
  EscrowNotReleased: "The escrow hasn't been released yet.",
  "User rejected the request": "Transaction cancelled — no changes were made.",
  "insufficient funds for gas": "Your wallet needs more ETH to cover gas.",
};
```

## 7.2 The transaction state machine

Every write goes through a lifecycle; model it explicitly or your UI will
show "submitting" forever:

```ts
type TxState =
  | { status: "idle" }
  | { status: "signing" }                       // wallet popup open
  | { status: "pending"; hash: `0x${string}` }  // in mempool
  | { status: "mined"; hash: `0x${string}`; block: bigint }
  | { status: "confirmed"; hash: `0x${string}` }// N confirmations
  | { status: "failed"; hash?: `0x${string}`; reason: string };
```

```tsx
function useTxFlow() {
  const [state, setState] = useState<TxState>({ status: "idle" });
  const { writeContractAsync } = useWriteContract();
  const { data: receipt, isLoading: mining, error }
    = useWaitForTransactionReceipt({ hash: state.status === "pending" ? state.hash : undefined });

  useEffect(() => {
    if (mining) setState((s) => ({ ...s, status: "pending" }));
    if (receipt) setState({ status: "confirmed", hash: receipt.transactionHash, block: receipt.blockNumber });
    if (error) setState((s) => ({ ...s, status: "failed", reason: friendly(error) }));
  }, [mining, receipt, error]);

  const submit = async () => {
    setState({ status: "signing" });
    try {
      const hash = await writeContractAsync({ ... });
      setState({ status: "pending", hash });
    } catch (e) {
      setState({ status: "failed", reason: friendly(e) }); // incl. user rejection
    }
  };
  return { state, submit };
}
```

Render each state distinctly: spinner + "Waiting for approval…" (signing);
"Transaction pending — [hash on explorer ↗]" (pending); green check +
"Confirmed" (confirmed); red + retry button that **re-submits, not reloads**
(failed). The explorer link (`https://etherscan.io/tx/${hash}` — chain-aware)
is the single most useful affordance.

## 7.3 Optimistic UI vs waiting for confirmations

Two legitimate strategies; choose by **what breaks if you're wrong**:

- **Optimistic (instant)**: update UI immediately, roll back on failure.
  Great for low-stakes, high-frequency actions (likes, reposts, small
  transfers where a second is the UX). With TanStack Query:

```tsx
const queryClient = useQueryClient();

const mutation = useMutation({
  mutationFn: () => writeContractAsync({ /* ... */ }),
  onMutate: async () => {
    await queryClient.cancelQueries({ queryKey: ["payments"] });
    const prev = queryClient.getQueryData(["payments"]);
    // patch cached list with the optimistic payment
    queryClient.setQueryData(["payments"], (old) => [optimisticRow, ...(old ?? [])]);
    return { prev }; // snapshot for rollback
  },
  onError: (_e, _v, ctx) => queryClient.setQueryData(["payments"], ctx!.prev),
  onSettled: () => queryClient.invalidateQueries({ queryKey: ["payments"] }),
});
```

- **Conservative (confirmations)**: block the action until the receipt
  lands. Right for fund movement, escrow releases, and anything the user
  must not double-submit. This is the default for payments/escrow dApps.

Rule of thumb: **optimistic for state you own, conservative for value**.
And always give a manual retry + "view on explorer" on failure — a pending
tx that never confirms (stuck in mempool) needs a *replace* path
(`gasPrice` bump or cancel), not just a spinner.

## 7.4 Loading states

- **Skeletons** sized to final layout (shimmer blocks, not spinners alone)
  for reads (`useReadContract`/`useQuery` `isPending`).
- **Disable buttons** during signing/pending; show *what's happening* in the
  button ("Approving USDC…", "Confirming…") — never a bare spinner.
- **Stale-while-revalidate:** TanStack Query refetches in the background
  after a write; combine with the SSE feed (§3.4) so the activity stream
  updates without user action.
- **Timeout handling:** wrap long operations; a wallet that never responds
  should surface "still waiting — check your wallet" after ~20s, not hang.
- Respect **network change mid-flow**: if the chain switches between sign
  and confirm, reset the flow with a clear message rather than a phantom tx.

## Mapping to StellarFlow

- `packages/sdk/src/errors.ts` and `apps/web/lib/errors.ts` are precisely
  the §7.1/§7.2 pattern — typed error hierarchy (`ContractCallError`,
  `WalletRejectedError`…) mapped to friendly messages. The EVM upgrade to
  add: **`decodeErrorResult`-style decoding of raw revert bytes** (your
  Soroban equivalent is decoding the result XDR / error enums), and
  **simulation before send** (on Soroban: `simulateTransaction` before
  `sendTransaction` — worth adding to the SDK's write path).
- Your README already lists the explicit states (connecting, waiting for
  approval, submitting, pending, confirmed, failed) — formalize them as the
  `TxState` union above so components can't invent new states.

**Next:** [08-testing.md](08-testing.md)