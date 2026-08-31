import { ActivityEvent } from "@stellarflow/types";
import { Badge } from "@/components/ui/Badge";
import { truncateAddress, timeAgo } from "@/lib/utils";

const TOPIC_TONES: Record<string, "neutral" | "green" | "amber" | "red" | "blue" | "purple"> = {
  payment_created: "blue",
  payment_approved: "purple",
  payment_completed: "green",
  payment_cancelled: "red",
  escrow_created: "amber",
  escrow_released: "green",
  escrow_refunded: "blue",
  escrow_disputed: "red",
  escrow_resolved: "green",
  contract_registered: "neutral",
  contract_removed: "neutral",
};

function topicLabel(topic: string): string {
  return topic.replace(/_/g, " ");
}

function payloadSummary(event: ActivityEvent): string {
  const { payload } = event;
  const parts: string[] = [];
  if (typeof payload.id !== "undefined") parts.push(`#${String(payload.id)}`);
  if (typeof payload.amount !== "undefined") parts.push(`${Number(payload.amount) / 1e7} XLM`);
  if (typeof payload.creator === "string") parts.push(truncateAddress(payload.creator));
  if (typeof payload.depositor === "string") parts.push(truncateAddress(payload.depositor));
  if (typeof payload.recipient === "string") parts.push(`→ ${truncateAddress(payload.recipient)}`);
  if (typeof payload.beneficiary === "string") parts.push(`→ ${truncateAddress(payload.beneficiary)}`);
  return parts.length > 0 ? parts.join(" ") : "";
}

export function ActivityItem({ event }: { event: ActivityEvent }) {
  const tone = TOPIC_TONES[event.topic] ?? "neutral";
  const summary = payloadSummary(event);
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone}>{topicLabel(event.topic)}</Badge>
          {summary && <span className="truncate text-xs text-ink-800/70">{summary}</span>}
        </div>
        <p className="mt-1 font-mono text-[10px] text-ink-800/40">
          ledger {event.ledger} · {truncateAddress(event.contractId, 4)}
        </p>
      </div>
      <time className="shrink-0 text-xs text-ink-800/50" dateTime={new Date(event.emittedAt).toISOString()}>
        {timeAgo(Math.floor(event.emittedAt / 1000))}
      </time>
    </li>
  );
}
