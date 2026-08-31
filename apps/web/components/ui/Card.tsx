import { HTMLAttributes } from "react";
import { cx } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ padded = true, className, children, ...props }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-xl border border-ink-100 bg-white shadow-card",
        padded && "p-5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-800/60">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
