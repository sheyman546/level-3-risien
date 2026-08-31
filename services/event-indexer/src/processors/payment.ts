import { ActivityTopic } from "@stellarflow/types";

/**
 * Build the JSON-safe payload for payment contract events.
 *
 * Event shapes emitted by the contract:
 *   payment_created:   (id)                data: [creator, recipient, amount]
 *   payment_approved:  (id)                data: []
 *   payment_completed: (id)                data: [escrow_id, recipient, amount]
 *   payment_cancelled: (id)                data: []
 */
export function paymentPayload(
  topic: ActivityTopic,
  topicValues: string[],
  data: unknown,
): Record<string, unknown> {
  const id = Number(topicValues[0] ?? 0);
  switch (topic) {
    case "payment_created": {
      const [creator, recipient, amount] = data as [string, string, bigint];
      return { id, creator, recipient, amount: String(amount ?? 0n) };
    }
    case "payment_completed": {
      const [escrowId, recipient, amount] = data as [bigint, string, bigint];
      return { id, escrowId: Number(escrowId ?? 0n), recipient, amount: String(amount ?? 0n) };
    }
    case "payment_approved":
    case "payment_cancelled":
      return { id };
    default:
      return { id };
  }
}
