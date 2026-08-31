import { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-100 bg-ink-50/50 px-6 py-10 text-center">
      {icon && <div className="text-2xl">{icon}</div>}
      <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
      {description && <p className="max-w-sm text-xs text-ink-800/60">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
