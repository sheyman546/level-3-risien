import { EscrowStatus, PaymentStatus } from "@stellarflow/types";
import { Badge } from "@/components/ui/Badge";

const PAYMENT_TONES: Record<PaymentStatus, "neutral" | "green" | "amber" | "red" | "blue" | "purple"> = {
  Created: "blue",
  Approved: "purple",
  Executed: "green",
  Cancelled: "red",
};

const ESCROW_TONES: Record<EscrowStatus, "neutral" | "green" | "amber" | "red" | "blue" | "purple"> = {
  Locked: "amber",
  Released: "green",
  Refunded: "blue",
  Disputed: "red",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_TONES[status]}>{status}</Badge>;
}

export function EscrowStatusBadge({ status }: { status: EscrowStatus }) {
  return <Badge tone={ESCROW_TONES[status]}>{status}</Badge>;
}
