import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { WalletProvider } from "@/hooks/useWallet";
import { NotificationProvider, Toaster } from "@/components/notifications/NotificationProvider";
import { WalletButton } from "@/components/wallet/WalletButton";
import { Nav } from "@/components/layout/Nav";

export const metadata: Metadata = {
  title: {
    default: "StellarFlow Hub — Smart Payments & Escrow",
    template: "%s · StellarFlow Hub",
  },
  description:
    "StellarFlow Hub: smart payments and escrow on Stellar/Soroban with real-time activity, wallet-first UX, and a full contract suite.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NotificationProvider>
          <WalletProvider>
            <div className="flex min-h-screen flex-col">
              <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/90 backdrop-blur">
                <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
                  <div className="flex items-center gap-6">
                    <Link href="/" className="flex items-center gap-2 font-semibold text-ink-900">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                        S
                      </span>
                      <span className="hidden sm:inline">StellarFlow Hub</span>
                    </Link>
                    <Nav />
                  </div>
                  <WalletButton />
                </div>
              </header>
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
              <footer className="border-t border-ink-100 py-6">
                <div className="mx-auto w-full max-w-6xl px-4 text-xs text-ink-800/50">
                  StellarFlow Hub — demo dApp. Always verify transactions in your wallet before signing.
                </div>
              </footer>
            </div>
            <Toaster />
          </WalletProvider>
        </NotificationProvider>
      </body>
    </html>
  );
}
