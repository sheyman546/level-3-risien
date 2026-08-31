import { describe, expect, it } from "vitest";
import { paymentPayload } from "../src/processors/payment";
import { escrowPayload } from "../src/processors/escrow";

const G1 = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const G2 = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWJT";

describe("paymentPayload", () => {
  it("maps payment_created", () => {
    expect(paymentPayload("payment_created", ["1"], [G1, G2, 10000000n])).toEqual({
      id: 1,
      creator: G1,
      recipient: G2,
      amount: "10000000",
    });
  });

  it("maps payment_completed", () => {
    expect(paymentPayload("payment_completed", ["2"], [5n, G2, 2500000n])).toEqual({
      id: 2,
      escrowId: 5,
      recipient: G2,
      amount: "2500000",
    });
  });

  it("maps payment_approved", () => {
    expect(paymentPayload("payment_approved", ["3"], [])).toEqual({ id: 3 });
  });

  it("maps payment_cancelled", () => {
    expect(paymentPayload("payment_cancelled", ["4"], [])).toEqual({ id: 4 });
  });
});

describe("escrowPayload", () => {
  it("maps escrow_created", () => {
    expect(escrowPayload("escrow_created", ["1"], [G1, G2, 10000000n])).toEqual({
      id: 1,
      depositor: G1,
      beneficiary: G2,
      amount: "10000000",
    });
  });

  it("maps escrow_released", () => {
    expect(escrowPayload("escrow_released", ["1"], [G2, 10000000n])).toEqual({
      id: 1,
      beneficiary: G2,
      amount: "10000000",
    });
  });

  it("maps escrow_refunded", () => {
    expect(escrowPayload("escrow_refunded", ["2"], [G1, 5000000n])).toEqual({
      id: 2,
      depositor: G1,
      amount: "5000000",
    });
  });

  it("maps escrow_disputed", () => {
    expect(escrowPayload("escrow_disputed", ["2"], [G1])).toEqual({ id: 2, caller: G1 });
  });

  it("maps escrow_resolved", () => {
    expect(escrowPayload("escrow_resolved", ["2"], [true])).toEqual({ id: 2, payBeneficiary: true });
  });
});
