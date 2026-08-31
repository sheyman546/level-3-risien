/**
 * Low-level client for invoking StellarFlow contracts.
 *
 * Wraps `@stellar/stellar-sdk` v12's `contract.Client` (spec-driven):
 *  - read()  -> simulated, signature-free calls, decoded via `tx.result`
 *  - write() -> signed + submitted calls (`signAndSend`) with phase callbacks
 *  - contract `Result<T, Error>` returns are unwrapped by the SDK; errors are
 *    parsed using the `errorTypes` map passed to `Client.from`
 *  - typed error mapping + timeouts
 */

import { contract } from "@stellar/stellar-sdk";
import {
  CONTRACT_ERROR_MESSAGES,
  ContractCallError,
  ErrorCode,
  InvalidInputError,
  NotConnectedError,
  StellarFlowError,
  toStellarFlowError,
} from "./errors";

/**
 * A wallet-provided signer. The signature matches Freighter's
 * `signTransaction` (takes tx XDR base64, returns signed XDR base64), so a
 * Freighter adapter can be passed through almost directly.
 */
export interface Signer {
  publicKey: string;
  signTransaction: (
    txXdr: string,
    opts?: { network?: string; networkPassphrase?: string; accountToSign?: string },
  ) => Promise<string>;
}

export interface ContractClientOptions {
  contractId: string;
  networkPassphrase: string;
  rpcUrl: string;
  signer?: Signer;
  /** Overall timeout for network calls, ms. Default 60s. */
  timeoutMs?: number;
  /** Contract error code -> message map (mirrors the Rust `#[contracterror]`). */
  errorTypes?: Record<number, { message: string }>;
}

/** Progress phases surfaced to the UI while a write call is in flight. */
export type TxPhase = "waiting_approval" | "submitting" | "pending" | "confirmed";

export interface WriteResult<T> {
  result: T;
  /** Transaction hash (hex). */
  hash: string;
  phase: TxPhase;
}

type MethodFn<T> = (
  args?: Record<string, unknown>,
  opts?: contract.MethodOptions,
) => Promise<contract.AssembledTransaction<T>>;

const DEFAULT_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Preserve typed error codes when the SDK throws message-only contract errors. */
function preserveErrorCode(error: unknown): never {
  const mapped = toStellarFlowError(error);
  if (mapped.code === "CONTRACT_CALL_FAILED") {
    for (const [code, message] of Object.entries(CONTRACT_ERROR_MESSAGES)) {
      if (mapped.message.includes(message)) {
        throw new StellarFlowError(code as ErrorCode, mapped.message, { cause: mapped.cause });
      }
    }
  }
  throw mapped;
}

/** Convert a numeric error map into the `errorTypes` shape the SDK expects. */
export function toErrorTypes(errorMap: Record<number, ErrorCode>): Record<number, { message: string }> {
  return Object.fromEntries(
    Object.entries(errorMap).map(([code, errorCode]) => [
      code,
      { message: CONTRACT_ERROR_MESSAGES[errorCode] },
    ]),
  );
}

export class ContractClient {
  private readonly timeoutMs: number;
  private clientPromise: Promise<contract.Client> | null = null;

  constructor(private readonly options: ContractClientOptions) {
    if (!options.contractId) {
      throw new InvalidInputError("Contract address is not configured.");
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get contractId(): string {
    return this.options.contractId;
  }

  /** Lazily build the spec-driven client (fetches the contract spec once). */
  private getClient(): Promise<contract.Client> {
    if (!this.clientPromise) {
      this.clientPromise = contract.Client.from({
        contractId: this.options.contractId,
        rpcUrl: this.options.rpcUrl,
        networkPassphrase: this.options.networkPassphrase,
        publicKey: this.options.signer?.publicKey,
        // signing is supplied per-call in write() so phase callbacks stay fresh
        allowHttp: this.options.rpcUrl.startsWith("http://"),
        errorTypes: this.options.errorTypes,
      });
    }
    return this.clientPromise;
  }

  private async method<T>(name: string): Promise<MethodFn<T>> {
    const client = await this.getClient();
    const fn = (
      client as unknown as Record<string, MethodFn<T>>
    )[name];
    if (typeof fn !== "function") {
      throw new ContractCallError(`Method "${name}" not found on the contract spec.`);
    }
    return fn.bind(client);
  }

  /**
   * Read-only call (simulated, no signature required). Args are keyed by the
   * contract's parameter names; the SDK converts them from the spec.
   */
  async read<T>(method: string, args?: Record<string, unknown>): Promise<T> {
    try {
      const fn = await this.method<T>(method);
      const tx = await withTimeout(fn(args), this.timeoutMs, `read ${method}`);
      return tx.result;
    } catch (error) {
      preserveErrorCode(error);
    }
  }

  /**
   * State-changing call. Signs with the wallet signer, submits, and waits for
   * the transaction to be included on-chain.
   */
  async write<T>(
    method: string,
    args?: Record<string, unknown>,
    onPhase?: (phase: TxPhase) => void,
  ): Promise<WriteResult<T>> {
    const signer = this.options.signer;
    if (!signer) throw new NotConnectedError();
    try {
      const fn = await this.method<T>(method);
      onPhase?.("submitting");
      const tx = await withTimeout(fn(args), this.timeoutMs, `write ${method}`);
      onPhase?.("waiting_approval");
      const sent = await withTimeout(
        tx.signAndSend({
          signTransaction: async (txXdr, opts) => {
            onPhase?.("pending");
            return signer.signTransaction(txXdr, opts);
          },
        }),
        this.timeoutMs,
        `write ${method}`,
      );
      onPhase?.("confirmed");
      return {
        result: sent.result,
        hash: sent.sendTransactionResponse?.hash ?? "",
        phase: "confirmed",
      };
    } catch (error) {
      preserveErrorCode(error);
    }
  }
}
