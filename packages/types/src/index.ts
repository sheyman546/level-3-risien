/**
 * Shared domain types for StellarFlow Hub.
 *
 * These types are consumed by the SDK, the web app, the event indexer and the
 * deploy tooling, so the on-chain data model only has to be defined once.
 */

/** Lifecycle of a payment recorded by the payment contract. */
export const PAYMENT_STATUSES = ["Created", "Approved", "Executed", "Cancelled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Lifecycle of an escrow recorded by the escrow contract. */
export const ESCROW_STATUSES = ["Locked", "Released", "Refunded", "Disputed"] as const;
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

/** A payment as stored in the payment contract. */
export interface Payment {
  /** Sequential id assigned by the contract (u32). */
  id: number;
  /** Creator of the payment (G... address). */
  creator: string;
  /** Recipient of the funds (G... address). */
  recipient: string;
  /** Amount in stroops (7 decimal places). */
  amount: bigint;
  /** Stellar Asset Contract id of the asset (C... address). */
  asset: string;
  /** Ledger timestamp deadline before which the payment must be executed. */
  deadline: number;
  status: PaymentStatus;
  /** Escrow id created when the payment was executed (0 while not executed). */
  escrowId: number;
}

/** An escrow as stored in the escrow contract. */
export interface Escrow {
  /** Sequential id assigned by the contract (u64). */
  id: number;
  /** Depositor that locked the funds (G... address). */
  depositor: string;
  /** Beneficiary that can receive the funds (G... address). */
  beneficiary: string;
  amount: bigint;
  asset: string;
  status: EscrowStatus;
  /** Ledger timestamp when the escrow was created. */
  createdAt: number;
  /** Ledger timestamp after which the escrow can be disputed. */
  timeout: number;
}

/** Topics emitted by the StellarFlow contracts. */
export const ACTIVITY_TOPICS = [
  "payment_created",
  "payment_approved",
  "payment_completed",
  "payment_cancelled",
  "escrow_created",
  "escrow_released",
  "escrow_refunded",
  "escrow_disputed",
  "escrow_resolved",
  "contract_registered",
  "contract_removed",
] as const;
export type ActivityTopic = (typeof ACTIVITY_TOPICS)[number];

/** A normalized contract event produced by the event indexer. */
export interface ActivityEvent {
  /** Unique event id (RPC event id / paging token). */
  id: string;
  /** Ledger sequence the event was emitted in. */
  ledger: number;
  /** Contract that emitted the event (C... address). */
  contractId: string;
  topic: ActivityTopic;
  /** Positional + named payload extracted from the event data. */
  payload: Record<string, unknown>;
  /** Milliseconds epoch timestamp of the ledger close. */
  emittedAt: number;
}

export type Network = "testnet" | "mainnet" | "local";

export interface NetworkConfig {
  network: Network;
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
}

/** Deployed contract addresses, keyed by contract name. */
export type ContractKey = "payment" | "escrow" | "registry";
export interface ContractAddresses {
  payment?: string;
  escrow?: string;
  registry?: string;
}

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";
export const LOCAL_PASSPHRASE = "Standalone Network ; February 2017";

export const NETWORK_PASSPHRASES: Record<Network, string> = {
  testnet: TESTNET_PASSPHRASE,
  mainnet: MAINNET_PASSPHRASE,
  local: LOCAL_PASSPHRASE,
};

export const DEFAULT_RPC_URLS: Record<Network, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  mainnet: "https://soroban-mainnet.stellar.org",
  local: "http://localhost:8000",
};

export const DEFAULT_HORIZON_URLS: Record<Network, string> = {
  testnet: "https://horizon-testnet.stellar.org",
  mainnet: "https://horizon.stellar.org",
  local: "http://localhost:8000",
};
