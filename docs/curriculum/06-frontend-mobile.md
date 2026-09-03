# 6. Mobile Responsive Frontend

A wallet-connected dApp that works as well in a mobile browser as on
desktop — because most Web3 users *are* on mobile.

## 6.1 Provider setup: viem + wagmi v2 + RainbowKit

The 2025-2026 standard stack: **viem** (chain I/O), **wagmi v2** (React
hooks on top of viem), **RainbowKit v2** (connect UI: injected wallets,
WalletConnect, Coinbase Wallet, and QR pairing out of the box),
**TanStack Query v5** underneath wagmi for cache invalidation. The old
`ethers.js + Web3React` stack still works but is deprecated in practice —
ethers v6 lacks viem's type safety and wagmi is the community standard.

```tsx
// app/providers.tsx (Next.js App Router)
"use client";
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";

const config = createConfig(
  getDefaultConfig({
    appName: "StellarFlow",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID!, // from cloud.walletconnect.com
    chains: [mainnet, sepolia],
    transports: {
      [mainnet.id]: http(),
      [sepolia.id]: http(),
    },
  })
);

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

**Mobile-wallet connection flow** — RainbowKit handles this automatically:

- Detects injected providers (`window.ethereum`, e.g. MetaMask/Coinbase
  Wallet in-app browsers).
- Falls back to **WalletConnect v2** for non-injected wallets: desktop shows
  a QR code, mobile shows a deep link (`wc:` URI → wallet app), with
  automatic chain-switch requests.
- Your job: request chains explicitly, and handle the **"wrong network"**
  state with a one-tap switch — users abandon dApps that require manual
  network changes.

```tsx
import { useSwitchChain, useAccount, useChainId } from "wagmi";

function NetworkGate({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const target = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID);

  if (isConnected && chainId !== target) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6">
        <div className="rounded-2xl bg-white p-6 text-center">
          <p className="mb-4 font-medium">Wrong network</p>
          <button
            onClick={() => switchChain({ chainId: target })}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-white"
          >
            Switch to {target === 1 ? "Mainnet" : "Sepolia"}
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
```

## 6.2 Responsive layouts with Tailwind

Mobile-first: design the narrow column, then expand with `sm:`/`md:`/`lg:`
breakpoints. Three patterns matter for dApps:

**1. Data tables → card lists.** Tables don't fit narrow screens. Render a
real `<table>` on `md+`, cards on mobile (same data, different markup):

```tsx
{/* mobile cards */}
<ul className="space-y-3 md:hidden">
  {payments.map((p) => (
    <li key={p.id} className="rounded-xl border p-4">
      <div className="flex justify-between">
        <span className="font-medium">{p.payeeLabel}</span>
        <span className="text-emerald-600">{p.amount} USDC</span>
      </div>
      <div className="mt-1 text-sm text-gray-500">{p.status} · {p.date}</div>
    </li>
  ))}
</ul>

{/* desktop table */}
<table className="hidden md:table w-full text-left">
  <thead><tr><th>Payee</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
  <tbody>{/* same data */}</tbody>
</table>
```

**2. Transaction modals → bottom sheets.** On mobile, a centered dialog
covers the screen and fights the keyboard; a **bottom sheet** matches native
UX. Use `fixed inset-x-0 bottom-0` for mobile and a centered dialog on
`sm+` — one component, two layouts:

```tsx
<div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
  <div className="absolute inset-0 bg-black/40" onClick={onClose} />
  <div className="relative w-full max-w-md rounded-t-2xl bg-white p-6
                  sm:rounded-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
    {/* amount input, gas estimate, submit */}
  </div>
</div>
```

**3. Safe areas & touch targets.** iOS home indicator overlaps bottom bars —
pad with `env(safe-area-inset-bottom)`; keep interactive targets ≥44px;
prevent accidental submits (confirm button with amount recap, "I
understand" checkbox for irreversible actions).

Also: `viewport-fit=cover` in metadata (required for safe-area env vars),
responsive font scaling, and always render **skeletons** sized to the
mobile layout (not desktop-sized placeholders that jump on load).

## 6.3 Reading and writing state (the wagmi hooks)

```tsx
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";

function CreatePayment() {
  const { data: balance } = useReadContract({
    address: usdcAddress, abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address as `0x${string}`],
  });

  const { writeContractAsync, isPending, error } = useWriteContract();

  async function submit() {
    const hash = await writeContractAsync({
      address: paymentAddress,
      abi: paymentAbi,
      functionName: "createPayment",
      args: [payee, parseEther(amount)],
    });
    // tx hash → show "pending" state; the receipt hook tracks confirmations
  }

  const { isLoading: isConfirming, isSuccess: isConfirmed }
    = useWaitForTransactionReceipt({ hash });

  return (/* form + state UI — see §7 for the full state machine */);
}
```

Pitfalls: `NEXT_PUBLIC_*` addresses are baked at build time (see §9 env
matrix); always pass `chainId` where the UI can be on the wrong network;
don't block rendering on `balance` (render zero-state skeletons); and
remember **writes need the user's wallet, not your RPC** — simulation via
`useSimulateContract` (next section) is your pre-flight check.

## Mapping to StellarFlow

- Your `apps/web` + Freighter is the Soroban equivalent of RainbowKit +
  `window.ethereum`: Freighter injects a Stellar provider, `contract.Client`
  wraps it. The same rules apply: detect the injected provider, guide the
  user to install it, handle network mismatch (testnet vs local), and keep
  the wallet adapter isolated (your README's "other wallets need a small
  adapter" note is exactly the RainbowKit/WalletConnect role on EVM).
- The responsive patterns (§6.2) and the `useContractCall`-style hooks map
  directly — your hooks layer already keeps React away from the SDK.

**Next:** [07-errors-loading.md](07-errors-loading.md)