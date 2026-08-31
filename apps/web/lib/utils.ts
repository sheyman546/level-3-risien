export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Truncate a Stellar address for display: GABC…WXYZ */
export function truncateAddress(address: string, chars = 6): string {
  if (!address || address.length <= chars * 2 + 3) return address ?? "";
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/** XLM amount in stroops -> formatted XLM string. */
export function formatAmount(stroops: bigint | number | string, asset?: string): string {
  const amount = Number(typeof stroops === "bigint" ? stroops : Number(stroops)) / 1e7;
  const formatted = amount.toLocaleString(undefined, {
    maximumFractionDigits: 7,
    minimumFractionDigits: 0,
  });
  return asset ? `${formatted} ${asset === "XLM" ? "XLM" : "units"}` : `${formatted} XLM`;
}

/** Convert an XLM amount string (e.g. "12.5") to stroops (bigint). */
export function amountToStroops(amount: string): bigint {
  const normalized = amount.trim();
  const [whole = "0", fraction = ""] = normalized.split(".");
  const padded = fraction.padEnd(7, "0").slice(0, 7);
  return BigInt(`${whole}${padded}` || "0");
}

/** Ledger timestamp (seconds) -> Date. */
export function ledgerTimestampToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

export function formatDateTime(timestamp: number): string {
  return ledgerTimestampToDate(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function timeAgo(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp * 1000);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Current ledger-style timestamp (unix seconds). */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
