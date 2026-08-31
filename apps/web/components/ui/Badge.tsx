import { HTMLAttributes } from "react";
import { cx } from "@/lib/utils";

type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "purple";

const tones: Record<Tone, string> = {
  neutral: "bg-ink-50 text-ink-800/70 border-ink-100",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  blue: "bg-sky-50 text-sky-700 border-sky-200",
  purple: "bg-brand-50 text-brand-700 border-brand-200",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
