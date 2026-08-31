import { describe, expect, it } from "vitest";
import { createPaymentSchema } from "@/lib/validation/schemas";

const validRecipient = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const validAsset = "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR";

describe("createPaymentSchema", () => {
  it("accepts a valid payment", () => {
    const result = createPaymentSchema.safeParse({
      recipient: validRecipient,
      amount: "12.5",
      asset: validAsset,
      deadlineDays: "7",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid recipient", () => {
    const result = createPaymentSchema.safeParse({
      recipient: "not-an-address",
      amount: "1",
      asset: validAsset,
      deadlineDays: "7",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("recipient");
    }
  });

  it("rejects zero and negative amounts", () => {
    for (const amount of ["0", "-5", "abc"]) {
      const result = createPaymentSchema.safeParse({
        recipient: validRecipient,
        amount,
        asset: validAsset,
        deadlineDays: "7",
      });
      expect(result.success, `amount "${amount}" should be rejected`).toBe(false);
    }
  });

  it("rejects amounts with more than 7 decimals", () => {
    const result = createPaymentSchema.safeParse({
      recipient: validRecipient,
      amount: "1.12345678",
      asset: validAsset,
      deadlineDays: "7",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid asset contract id", () => {
    const result = createPaymentSchema.safeParse({
      recipient: validRecipient,
      amount: "1",
      asset: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      deadlineDays: "7",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("asset");
    }
  });
});
