import { describe, expect, it } from "vitest";
import { toErrorTypes } from "../src/client";
import { PAYMENT_CONTRACT_ERRORS } from "../src/errors";

describe("toErrorTypes", () => {
  it("maps numeric contract error codes to SDK errorTypes messages", () => {
    const types = toErrorTypes(PAYMENT_CONTRACT_ERRORS);
    expect(types[1]).toEqual({ message: "Unauthorized caller." });
    expect(types[2]).toEqual({ message: "Not found." });
    expect(types[5]).toEqual({ message: "Invalid input." });
  });
});
