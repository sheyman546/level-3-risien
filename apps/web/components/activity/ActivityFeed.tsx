"use client";

import { ActivityEvent } from "@stellarflow/types";
import { ActivityItem } from "@/components/activity/ActivityItem";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { useActivity, ActivityStatus } from "@/hooks/useActivity";

const STATUS_UI: Record<ActivityStatus, { tone: "neutral" | "green" | "amber" | "red"; label: string }> = {
  idle: { tone: "neutral", label: "Starting…" },
  connecting: { tone: "amber", label: "Connecting…" },
  live: { tone: "green", label: "Live" },
  reconnecting: { tone: "amber", label: "Reconnecting…" },
  error: { tone: "red", label: "Offline" },
};

export function ActivityFeed({ initialEvents }: { initialEvents?: ActivityEvent[] }) {
  const { events, status, error } = useActivity();
  const display = events.length > 0 ? events : initialEvents ?? [];
  const ui = STATUS_UI[status];

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink-800">Live activity</h2>
        <Badge tone={ui.tone}>
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          {ui.label}
        </Badge>
      </div>

      {error && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      {display.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No activity yet"
            description="Contract events from payments and escrows will appear here in real time."
          />
        </div>
      ) : (
        <ul className="divide-y divide-ink-100 px-4">
          {display.map((event) => (
            <ActivityItem key={event.id} event={event} />
          ))}
        </ul>
      )}
    </Card>
  );
}
