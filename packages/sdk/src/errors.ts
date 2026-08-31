/**
 * Reusable, typed error hierarchy for the SDK.
 *
 * UI layers map these to friendly messages; the contract error codes mirror
 * the `Error` enums defined in the Rust contracts (see contracts/<crate>/src/contract.rs).
 */

export type ErrorCode =
  | "WALLET_NOT_INSTALLED"
  | "WALLET_REJECTED"
  | "NOT_CONNECTED"
  | "CONTRACT_CALL_FAILED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "INVALID_INPUT"
  | "INSUFFICIENT_BALANCE"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INVALID_STATUS"
  | "NOT_INITIALIZED"
  | "ALREADY_INITIALIZED"
  | "INVALID_AMOUNT"
  | "TRANSFER_FAILED"
  | "REGISTRY_ERROR";

export class StellarFlowError extends Error {
  readonly code: ErrorCode;
  readonly cause?: unknown;
  readonly contractCode?: number;

  constructor(code: ErrorCode, message: string, opts: { cause?: unknown; contractCode?: number } = {}) {
    super(message);
    this.name = "StellarFlowError";
    this.code = code;
    this.cause = opts.cause;
    this.contractCode = opts.contractCode;
  }
}

export class WalletNotInstalledError extends StellarFlowError {
  constructor() {
    super("WALLET_NOT_INSTALLED", "Freighter is not installed. Install the Freighter browser extension to continue.");
  }
}

export class WalletRejectedError extends StellarFlowError {
  constructor(cause?: unknown) {
    super("WALLET_REJECTED", "The transaction was rejected in your wallet.", { cause });
  }
}

export class NotConnectedError extends StellarFlowError {
  constructor() {
    super("NOT_CONNECTED", "Connect your wallet before performing this action.");
  }
}

export class ContractCallError extends StellarFlowError {
  constructor(message: string, opts: { cause?: unknown; contractCode?: number } = {}) {
    super("CONTRACT_CALL_FAILED", message, opts);
  }
}

export class NetworkError extends StellarFlowError {
  constructor(message: string, cause?: unknown) {
    super("NETWORK_ERROR", `Network error: ${message}`, { cause });
  }
}

export class TransactionTimeoutError extends StellarFlowError {
  constructor() {
    super("TIMEOUT", "The transaction is taking longer than expected. It may still confirm — check the activity feed.");
  }
}

export class InvalidInputError extends StellarFlowError {
  constructor(message: string) {
    super("INVALID_INPUT", message);
  }
}

/** Error codes returned by the StellarFlow contracts (mirror the Rust enums). */
export const PAYMENT_CONTRACT_ERRORS: Record<number, ErrorCode> = {
  1: "UNAUTHORIZED",
  2: "NOT_FOUND",
  3: "INVALID_STATUS",
  4: "INVALID_AMOUNT",
  5: "INVALID_INPUT", // invalid deadline
  6: "REGISTRY_ERROR",
  7: "CONTRACT_CALL_FAILED", // escrow call failed
  8: "ALREADY_INITIALIZED",
  9: "NOT_INITIALIZED",
};

export const ESCROW_CONTRACT_ERRORS: Record<number, ErrorCode> = {
  1: "UNAUTHORIZED",
  2: "NOT_FOUND",
  3: "INVALID_STATUS",
  4: "INVALID_AMOUNT",
  5: "INSUFFICIENT_BALANCE",
  6: "TRANSFER_FAILED",
  7: "ALREADY_INITIALIZED",
  8: "NOT_INITIALIZED",
};

export const REGISTRY_CONTRACT_ERRORS: Record<number, ErrorCode> = {
  1: "UNAUTHORIZED",
  2: "NOT_FOUND",
  3: "INVALID_INPUT", // already registered
  4: "ALREADY_INITIALIZED",
  5: "NOT_INITIALIZED",
};

export const CONTRACT_ERROR_MESSAGES: Record<ErrorCode, string> = {
  WALLET_NOT_INSTALLED: "Wallet not installed.",
  WALLET_REJECTED: "Transaction rejected.",
  NOT_CONNECTED: "Wallet not connected.",
  CONTRACT_CALL_FAILED: "The contract call failed.",
  NETWORK_ERROR: "Network error.",
  TIMEOUT: "Transaction timed out.",
  INVALID_INPUT: "Invalid input.",
  INSUFFICIENT_BALANCE: "Insufficient balance.",
  UNAUTHORIZED: "Unauthorized caller.",
  NOT_FOUND: "Not found.",
  INVALID_STATUS: "Invalid status for this operation.",
  NOT_INITIALIZED: "Contract is not initialized.",
  ALREADY_INITIALIZED: "Contract is already initialized.",
  INVALID_AMOUNT: "Amount must be greater than zero.",
  TRANSFER_FAILED: "Token transfer failed.",
  REGISTRY_ERROR: "Registry contract error.",
};

/** Map a numeric contract error to a typed StellarFlowError. */
export function contractErrorToStellarFlowError(
  code: number,
  errorMap: Record<number, ErrorCode>,
  contractName: string,
): ContractCallError {
  const errorCode = errorMap[code] ?? "CONTRACT_CALL_FAILED";
  return new ContractCallError(
    `${contractName} contract error ${code}: ${CONTRACT_ERROR_MESSAGES[errorCode]}`,
    { contractCode: code },
  );
}

/** Best-effort conversion of any thrown value into a StellarFlowError. */
export function toStellarFlowError(error: unknown): StellarFlowError {
  if (error instanceof StellarFlowError) return error;
  const message = error instanceof Error ? error.message : String(error);

  if (/reject|denied|user canceled|user cancelled/i.test(message)) {
    return new WalletRejectedError(error);
  }
  if (/timeout|timed out|taking longer than expected/i.test(message)) {
    return new TransactionTimeoutError();
  }
  if (/fetch|network|rpc|connection|ECONNREFUSED|socket/i.test(message)) {
    return new NetworkError(message, error);
  }
  if (/insufficient|balance/i.test(message)) {
    return new StellarFlowError("INSUFFICIENT_BALANCE", message, { cause: error });
  }
  return new ContractCallError(message, { cause: error });
}
