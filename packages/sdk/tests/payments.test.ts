import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAddress } from "@stellarflow/test-utils";

const { mockFrom, mockSignTransaction } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSignTransaction: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", () => ({
  contract: {
    Client: {
      from: mockFrom,
    },
  },
  rpc: {
    Server: class Server {
      constructor() {}
    },
  },
}));

import { PaymentsClient } from "../src/payments";
import { StellarFlowError, WalletRejectedError } from "../src/errors";

const NETWORK = {
  contractId: "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
};

const signer = {
  publicKey: fakeAddress("user"),
  signTransaction: mockSignTransaction,
};

/** Build a fake contract client whose methods return AssembledTransaction-ish objects. */
function fakeContract(methods: Record<string, (args?: Record<string, unknown>) => unknown>) {
  const client: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(methods)) {
    client[name] = (args?: Record<string, unknown>, _opts?: unknown) => fn(args);
  }
  return client;
}

function nativePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    creator: fakeAddress("creator"),
    recipient: fakeAddress("recipient"),
    amount: 10000000n,
    asset: "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR",
    deadline: 1700100000n,
    status: 0,
    escrow_id: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockFrom.mockReset();
  mockSignTransaction.mockReset().mockResolvedValue("signed-xdr");
});

describe("PaymentsClient", () => {
  it("creates a payment with spec-keyed args and returns the result + hash", async () => {
    mockFrom.mockResolvedValue(
      fakeContract({
        create_payment: () => ({
          result: 3,
          signAndSend: async () => ({
            result: 3,
            sendTransactionResponse: { hash: "abc123" },
          }),
        }),
      }),
    );
    const client = new PaymentsClient({ ...NETWORK, signer });

    const res = await client.createPayment({
      creator: fakeAddress("creator"),
      recipient: fakeAddress("recipient"),
      amount: 10000000n,
      asset: "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR",
      deadline: 1700100000,
    });

    expect(res.result).toBe(3);
    expect(res.hash).toBe("abc123");
    const args = mockFrom.mock.calls[0][0];
    expect(args.contractId).toBe(NETWORK.contractId);
    expect(args.errorTypes[1]).toBeDefined(); // contract error map wired in
  });

  it("passes caller + id for approve/execute/cancel writes", async () => {
    const seen: Array<{ method: string; args: Record<string, unknown> }> = [];
    mockFrom.mockResolvedValue(
      fakeContract({
        approve_payment: (args) => {
          seen.push({ method: "approve_payment", args: args ?? {} });
          return { result: undefined, signAndSend: async () => ({ result: undefined }) };
        },
        execute_payment: (args) => {
          seen.push({ method: "execute_payment", args: args ?? {} });
          return { result: 9, signAndSend: async () => ({ result: 9 }) };
        },
      }),
    );
    const client = new PaymentsClient({ ...NETWORK, signer });

    await client.approvePayment(fakeAddress("user"), 4);
    await client.executePayment(fakeAddress("user"), 4);

    expect(seen[0]).toEqual({ method: "approve_payment", args: { caller: fakeAddress("user"), id: 4 } });
    expect(seen[1]).toEqual({ method: "execute_payment", args: { caller: fakeAddress("user"), id: 4 } });
  });

  it("reads a single payment and maps native fields", async () => {
    mockFrom.mockResolvedValue(
      fakeContract({
        get_payment: () => ({ result: nativePayment({ escrow_id: 7 }) }),
      }),
    );
    const client = new PaymentsClient(NETWORK);

    const payment = await client.getPayment(1);

    expect(payment.id).toBe(1);
    expect(payment.status).toBe("Created");
    expect(payment.amount).toBe(10000000n);
    expect(payment.escrowId).toBe(7);
  });

  it("lists payments with status mapping", async () => {
    mockFrom.mockResolvedValue(
      fakeContract({
        payments: () => ({
          result: [nativePayment({ id: 1, status: 1 }), nativePayment({ id: 2, status: 3 })],
        }),
      }),
    );
    const client = new PaymentsClient(NETWORK);

    const payments = await client.listPayments();

    expect(payments).toHaveLength(2);
    expect(payments[0]?.status).toBe("Approved");
    expect(payments[1]?.status).toBe("Cancelled");
  });

  it("maps a contract error message to a typed error code", async () => {
    mockFrom.mockResolvedValue(
      fakeContract({
        get_payment: () => {
          throw new Error("Unauthorized caller.");
        },
      }),
    );
    const client = new PaymentsClient(NETWORK);

    await expect(client.getPayment(1)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("maps wallet rejection to WalletRejectedError", async () => {
    mockFrom.mockResolvedValue(
      fakeContract({
        approve_payment: () => ({
          result: undefined,
          signAndSend: async () => {
            throw new Error("User rejected the request");
          },
        }),
      }),
    );
    const client = new PaymentsClient({ ...NETWORK, signer });

    await expect(client.approvePayment(fakeAddress("user"), 1)).rejects.toBeInstanceOf(
      WalletRejectedError,
    );
  });

  it("throws a typed error when the contract call fails", async () => {
    mockFrom.mockResolvedValue(
      fakeContract({
        approve_payment: () => {
          throw new Error("Simulation failed: contract error");
        },
      }),
    );
    const client = new PaymentsClient({ ...NETWORK, signer });

    await expect(client.approvePayment(fakeAddress("user"), 1)).rejects.toBeInstanceOf(
      StellarFlowError,
    );
  });

  it("requires a signer for writes", async () => {
    const client = new PaymentsClient(NETWORK);
    await expect(client.approvePayment(fakeAddress("user"), 1)).rejects.toMatchObject({
      code: "NOT_CONNECTED",
    });
  });
});
