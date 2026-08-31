/**
 * Shared test utilities: domain factories and Freighter mocks used by the SDK,
 * web and indexer test suites.
 */

import { vi } from "vitest";
import {
  ActivityEvent,
  Escrow,
  EscrowStatus,
  Payment,
  PaymentStatus,
} from "@stellarflow/types";

let seq = 0;
const nextId = (): number => ++seq;

export const TEST_PUBLIC_KEY = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
export const TEST_PUBLIC_KEY_2 = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWJT";

/** Deterministic fake G... address (not a valid key, only for tests/UI). */
export function fakeAddress(seed = "test"): string {
  return `G${Buffer.from(seed).toString("hex").padEnd(55, "A")}`;
}

export function fakePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: nextId(),
    creator: fakeAddress("creator"),
    recipient: fakeAddress("recipient"),
    amount: 10000000n,
    asset: "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR",
    deadline: 1_700_000_000,
    status: "Created",
    escrowId: 0,
    ...overrides,
  };
}

export function fakeEscrow(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: nextId(),
    depositor: fakeAddress("depositor"),
    beneficiary: fakeAddress("beneficiary"),
    amount: 5000000n,
    asset: "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR",
    status: "Locked",
    createdAt: 1_700_000_000,
    timeout: 1_700_000_000 + 60 * 60 * 24,
    ...overrides,
  };
}

export function fakeActivityEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: `0000000000000000000000000000000000000000000000000000000000000000-${nextId()}`,
    ledger: 100_000 + nextId(),
    contractId: "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR",
    topic: "payment_created",
    payload: {
      id: 1,
      creator: fakeAddress("creator"),
      recipient: fakeAddress("recipient"),
      amount: "10000000",
    },
    emittedAt: Date.now(),
    ...overrides,
  };
}

/** A list of payment statuses for table-driven tests. */
export const ALL_PAYMENT_STATUSES: PaymentStatus[] = ["Created", "Approved", "Executed", "Cancelled"];
export const ALL_ESCROW_STATUSES: EscrowStatus[] = ["Locked", "Released", "Refunded", "Disputed"];

/**
 * A mock of the `@stellar/freighter-api` module (v2 API shape). Return this
 * from `vi.mock("@stellar/freighter-api", () => createFreighterMock())` in
 * wallet tests. All functions are `vi.fn()` so they can be re-stubbed.
 */
export function createFreighterMock() {
  return {
    isConnected: vi.fn().mockResolvedValue(true),
    getPublicKey: vi.fn().mockResolvedValue(TEST_PUBLIC_KEY),
    getNetwork: vi.fn().mockResolvedValue("TESTNET"),
    getNetworkDetails: vi.fn().mockResolvedValue({
      network: "TESTNET",
      networkUrl: "https://horizon-testnet.stellar.org",
      networkPassphrase: "Test SDF Network ; September 2015",
      sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    }),
    signTransaction: vi.fn().mockImplementation(async (xdr: string) => xdr),
    requestAccess: vi.fn().mockResolvedValue(TEST_PUBLIC_KEY),
    getUserInfo: vi.fn().mockResolvedValue({ publicKey: TEST_PUBLIC_KEY }),
  };
}
