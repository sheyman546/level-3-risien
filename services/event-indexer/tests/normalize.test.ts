import { describe, expect, it } from "vitest";
import { Address, Keypair, nativeToScVal, StrKey, xdr } from "@stellar/stellar-sdk";
import { decodeEvent, decodeScVal, normalize } from "../src/normalize";
import { RawRpcEvent } from "../src/types";

// Real (random) valid addresses — fixtures never hit the network.
const G1 = Keypair.random().publicKey();
const G2 = Keypair.random().publicKey();
const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 7));
const NOW = 1_700_100_000_000;

/** Encode a value (or tuple of mixed values) as base64 ScVal XDR. */
const scval = (value: unknown): string => {
  if (Array.isArray(value)) {
    const scvals = value.map((v) =>
      typeof v === "string" && (v.startsWith("G") || v.startsWith("C"))
        ? nativeToScVal(new Address(v))
        : nativeToScVal(v),
    );
    return xdr.ScVal.scvVec(scvals).toXDR("base64");
  }
  return nativeToScVal(value).toXDR("base64");
};
const symbolScval = (name: string): string => xdr.ScVal.scvSymbol(name).toXDR("base64");

function rawEvent(overrides: Partial<RawRpcEvent> = {}): RawRpcEvent {
  return {
    id: "event-1",
    ledger: 12345,
    contractId: CONTRACT,
    topic: [],
    value: { xdr: scval([]) },
    type: "contract",
    inSuccessfulContractCall: true,
    ...overrides,
  };
}

describe("decodeScVal", () => {
  it("decodes symbols, strings, bigints and addresses", () => {
    expect(decodeScVal(symbolScval("payment_created"))).toBe("payment_created");
    expect(decodeScVal(scval("hello"))).toBe("hello");
    expect(decodeScVal(scval(42n))).toBe(42n);
    expect(decodeScVal(scval(new Address(G1)))).toBe(G1);
  });

  it("passes through non-string values", () => {
    expect(decodeScVal(42)).toBe(42);
    expect(decodeScVal({ foo: 1 })).toEqual({ foo: 1 });
  });
});

describe("decodeEvent", () => {
  it("decodes a payment_created event", () => {
    const raw = rawEvent({
      topic: [symbolScval("payment_created"), scval(7)],
      value: { xdr: scval([G1, G2, 10000000n]) },
    });

    const decoded = decodeEvent(raw);
    expect(decoded).not.toBeNull();
    expect(decoded?.topicName).toBe("payment_created");
    expect(decoded?.topicValues).toEqual(["7"]);
    expect(decoded?.data).toEqual([G1, G2, 10000000n]);
  });

  it("uses ledgerClosedAt for emittedAt when present", () => {
    const raw = rawEvent({
      ledgerClosedAt: new Date(NOW).toISOString(),
      topic: [symbolScval("payment_created"), scval(7)],
      value: { xdr: scval([]) },
    });
    expect(decodeEvent(raw)?.emittedAt).toBe(NOW);
  });

  it("ignores events from other contracts", () => {
    const raw = rawEvent({
      topic: [symbolScval("transfer")],
      value: { xdr: scval([]) },
    });
    expect(decodeEvent(raw)).toBeNull();
  });
});

describe("normalize", () => {
  it("builds a payment_created payload", () => {
    const decoded = {
      id: "event-1",
      ledger: 12345,
      contractId: CONTRACT,
      topicName: "payment_created",
      topicValues: ["7"],
      data: [G1, G2, 10000000n],
      emittedAt: NOW,
    };
    const event = normalize(decoded);
    expect(event.topic).toBe("payment_created");
    expect(event.payload).toEqual({
      id: 7,
      creator: G1,
      recipient: G2,
      amount: "10000000",
    });
    expect(event.ledger).toBe(12345);
  });

  it("builds a payment_completed payload with escrow id", () => {
    const decoded = {
      id: "event-2",
      ledger: 12346,
      contractId: CONTRACT,
      topicName: "payment_completed",
      topicValues: ["7"],
      data: [3n, G2, 5000000n],
      emittedAt: NOW,
    };
    const event = normalize(decoded);
    expect(event.payload).toEqual({
      id: 7,
      escrowId: 3,
      recipient: G2,
      amount: "5000000",
    });
  });

  it("builds an escrow_released payload", () => {
    const decoded = {
      id: "event-3",
      ledger: 12347,
      contractId: CONTRACT,
      topicName: "escrow_released",
      topicValues: ["3"],
      data: [G2, 5000000n],
      emittedAt: NOW,
    };
    const event = normalize(decoded);
    expect(event.payload).toEqual({ id: 3, beneficiary: G2, amount: "5000000" });
  });

  it("builds a contract_registered payload", () => {
    const decoded = {
      id: "event-4",
      ledger: 12348,
      contractId: CONTRACT,
      topicName: "contract_registered",
      topicValues: [],
      data: ["escrow", CONTRACT],
      emittedAt: NOW,
    };
    const event = normalize(decoded);
    expect(event.payload).toEqual({ key: "escrow", address: CONTRACT });
  });
});
