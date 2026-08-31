import { cx } from "@/lib/utils";

export type BannerTone = "info" | "success" | "error";

const tones: Record<BannerTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
};

export function TransactionStatusBanner({ tone, text }: { tone: BannerTone; text: string }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("rounded-lg border px-3 py-2.5 text-sm", tones[tone])}
    >
      {text}
    </div>
  );
}
