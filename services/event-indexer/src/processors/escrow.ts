import { ActivityTopic } from "@stellarflow/types";

/**
 * Build the JSON-safe payload for escrow contract events.
 *
 * Event shapes emitted by the contract:
 *   escrow_created:  (id)  data: [depositor, beneficiary, amount]
 *   escrow_released: (id)  data: [beneficiary, amount]
 *   escrow_refunded: (id)  data: [depositor, amount]
 *   escrow_disputed: (id)  data: [caller]
 *   escrow_resolved: (id)  data: [pay_beneficiary]
 */
export function escrowPayload(
  topic: ActivityTopic,
  topicValues: string[],
  data: unknown,
): Record<string, unknown> {
  const id = Number(topicValues[0] ?? 0);
  switch (topic) {
    case "escrow_created": {
      const [depositor, beneficiary, amount] = data as [string, string, bigint];
      return { id, depositor, beneficiary, amount: String(amount ?? 0n) };
    }
    case "escrow_released": {
      const [beneficiary, amount] = data as [string, bigint];
      return { id, beneficiary, amount: String(amount ?? 0n) };
    }
    case "escrow_refunded": {
      const [depositor, amount] = data as [string, bigint];
      return { id, depositor, amount: String(amount ?? 0n) };
    }
    case "escrow_disputed": {
      const [caller] = data as [string];
      return { id, caller };
    }
    case "escrow_resolved": {
      const [payBeneficiary] = data as [boolean];
      return { id, payBeneficiary };
    }
    default:
      return { id };
  }
}
