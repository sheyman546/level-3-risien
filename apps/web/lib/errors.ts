import { StellarFlowError, toStellarFlowError, WalletNotInstalledError } from "@stellarflow/sdk";

export { StellarFlowError, toStellarFlowError, WalletNotInstalledError };

/** Human-friendly message for a thrown error. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof StellarFlowError) {
    switch (error.code) {
      case "WALLET_NOT_INSTALLED":
        return "Freighter is not installed. Install the Freighter extension to connect your wallet.";
      case "WALLET_REJECTED":
        return "The transaction was rejected in your wallet.";
      case "NOT_CONNECTED":
        return "Connect your wallet first.";
      case "INSUFFICIENT_BALANCE":
        return "Insufficient balance for this transaction.";
      case "UNAUTHORIZED":
        return "Your wallet is not authorized to perform this action.";
      case "NOT_FOUND":
        return "The requested record was not found on-chain.";
      case "INVALID_STATUS":
        return "This action is not allowed in the current state.";
      case "INVALID_AMOUNT":
        return "The amount must be greater than zero.";
      case "INVALID_INPUT":
        return "Please check the form fields and try again.";
      case "TIMEOUT":
        return "The transaction is taking longer than expected. It may still confirm — check the activity feed shortly.";
      case "NETWORK_ERROR":
        return "Could not reach the Stellar network. Check your connection and RPC configuration.";
      case "REGISTRY_ERROR":
        return "The registry could not resolve a contract. Is the escrow contract registered?";
      default:
        return error.message;
    }
  }
  if (error instanceof Error) return error.message;
  return "Something unexpected happened. Please try again.";
}

export const ERROR_MESSAGE: Record<string, string> = {
  WALLET_NOT_INSTALLED: "Freighter is not installed.",
  WALLET_REJECTED: "Transaction rejected in wallet.",
  NOT_CONNECTED: "Wallet not connected.",
  CONTRACT_CALL_FAILED: "The contract call failed.",
  NETWORK_ERROR: "Network error.",
  TIMEOUT: "Transaction timed out.",
  INVALID_INPUT: "Invalid input.",
  INSUFFICIENT_BALANCE: "Insufficient balance.",
  UNAUTHORIZED: "Unauthorized.",
  NOT_FOUND: "Not found.",
  INVALID_STATUS: "Invalid state.",
  NOT_INITIALIZED: "Contract not initialized.",
  ALREADY_INITIALIZED: "Contract already initialized.",
  INVALID_AMOUNT: "Invalid amount.",
  TRANSFER_FAILED: "Transfer failed.",
  REGISTRY_ERROR: "Registry error.",
};
