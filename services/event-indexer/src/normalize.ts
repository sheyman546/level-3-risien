import { scValToNative, xdr } from "@stellar/stellar-sdk";
import { ACTIVITY_TOPICS, ActivityEvent, ActivityTopic } from "@stellarflow/types";
import { DecodedEvent, RawRpcEvent } from "./types";
import { escrowPayload } from "./processors/escrow";
import { paymentPayload } from "./processors/payment";

/**
 * Decode a value into plain JS. Handles three shapes produced by different
 * RPC clients:
 *   - base64 XDR strings            -> xdr.ScVal.fromXDR -> scValToNative
 *   - `{ xdr: base64 }` wrappers    -> recurse
 *   - already-decoded `xdr.ScVal`   -> scValToNative directly
 */
export function decodeScVal(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return scValToNative(xdr.ScVal.fromXDR(value, "base64"));
    } catch {
      return value;
    }
  }
  if (value && typeof value === "object" && "xdr" in value && typeof (value as { xdr: unknown }).xdr === "string") {
    return decodeScVal((value as { xdr: string }).xdr);
  }
  if (value && typeof (value as { toXDR?: unknown }).toXDR === "function") {
    try {
      return scValToNative(value as xdr.ScVal);
    } catch {
      return value;
    }
  }
  return value;
}

/** Whether a raw RPC event is one of the StellarFlow contract events. */
function topicNameOf(raw: RawRpcEvent): string | null {
  if (raw.topic.length === 0) return null;
  const first = decodeScVal(raw.topic[0]);
  const name = typeof first === "string" ? first : String(first ?? "");
  return (ACTIVITY_TOPICS as readonly string[]).includes(name) ? name : null;
}

/** Decode a raw RPC event into a DecodedEvent, or null if it isn't ours. */
export function decodeEvent(raw: RawRpcEvent, fallbackEmittedAtMs?: number): DecodedEvent | null {
  const topicName = topicNameOf(raw);
  if (!topicName) return null;

  const contractId = String(
    (typeof raw.contractId === "object" && raw.contractId !== null
      ? raw.contractId.toString()
      : raw.contractId) ?? "",
  );
  const topicValues = raw.topic.slice(1).map((t) => String(decodeScVal(t)));
  const emittedAt = raw.ledgerClosedAt ? Date.parse(raw.ledgerClosedAt) : (fallbackEmittedAtMs ?? 0);

  return {
    id: raw.id,
    ledger: raw.ledger,
    contractId,
    topicName,
    topicValues,
    data: decodeScVal(raw.value),
    emittedAt: Number.isFinite(emittedAt) ? emittedAt : 0,
  };
}

/** Convert a decoded event into a normalized ActivityEvent with a JSON-safe payload. */
export function normalize(decoded: DecodedEvent): ActivityEvent {
  const topic = decoded.topicName as ActivityTopic;
  const payload =
    topic.startsWith("payment")
      ? paymentPayload(topic, decoded.topicValues, decoded.data)
      : topic.startsWith("escrow")
        ? escrowPayload(topic, decoded.topicValues, decoded.data)
        : registryPayload(topic, decoded.data);

  return {
    id: decoded.id,
    ledger: decoded.ledger,
    contractId: decoded.contractId,
    topic,
    payload,
    emittedAt: decoded.emittedAt,
  };
}

function registryPayload(topic: ActivityTopic, data: unknown): Record<string, unknown> {
  switch (topic) {
    case "contract_registered": {
      const [key, address] = data as [string, string];
      return { key, address };
    }
    case "contract_removed": {
      const [key] = data as [string];
      return { key };
    }
    default:
      return {};
  }
}
