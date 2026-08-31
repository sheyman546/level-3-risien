import { PAYMENT_STATUSES, Payment, PaymentStatus } from "@stellarflow/types";
import { ContractClient, Signer, toErrorTypes, TxPhase, WriteResult } from "./client";
import { PAYMENT_CONTRACT_ERRORS } from "./errors";

export interface PaymentsClientOptions {
  contractId: string;
  networkPassphrase: string;
  rpcUrl: string;
  signer?: Signer;
}

export interface CreatePaymentInput {
  creator: string;
  recipient: string;
  /** Amount in stroops. */
  amount: bigint;
  /** Stellar Asset Contract id of the asset. */
  asset: string;
  /** Ledger timestamp deadline. */
  deadline: number;
}

/** Native contract Payment -> domain Payment. */
export function toPayment(native: Record<string, unknown>): Payment {
  return {
    id: Number(native.id),
    creator: String(native.creator),
    recipient: String(native.recipient),
    amount: BigInt(native.amount as bigint),
    asset: String(native.asset),
    deadline: Number(native.deadline),
    status: (PAYMENT_STATUSES[Number(native.status)] ?? "Created") as PaymentStatus,
    escrowId: Number(native.escrow_id ?? 0),
  };
}

export class PaymentsClient {
  private readonly client: ContractClient;

  constructor(options: PaymentsClientOptions) {
    this.client = new ContractClient({
      ...options,
      errorTypes: toErrorTypes(PAYMENT_CONTRACT_ERRORS),
    });
  }

  /** Create a payment. Requires wallet signature from the creator. */
  async createPayment(
    input: CreatePaymentInput,
    onPhase?: (phase: TxPhase) => void,
  ): Promise<WriteResult<number>> {
    return this.client.write<number>(
      "create_payment",
      {
        creator: input.creator,
        recipient: input.recipient,
        amount: input.amount,
        asset: input.asset,
        deadline: BigInt(input.deadline),
      },
      onPhase,
    );
  }

  /** Approve a payment (creator or admin). */
  async approvePayment(
    caller: string,
    id: number,
    onPhase?: (phase: TxPhase) => void,
  ): Promise<WriteResult<void>> {
    return this.client.write<void>("approve_payment", { caller, id }, onPhase);
  }

  /** Execute an approved payment; returns the created escrow id. */
  async executePayment(
    caller: string,
    id: number,
    onPhase?: (phase: TxPhase) => void,
  ): Promise<WriteResult<number>> {
    return this.client.write<number>("execute_payment", { caller, id }, onPhase);
  }

  /** Cancel a payment that has not been executed (creator only). */
  async cancelPayment(
    caller: string,
    id: number,
    onPhase?: (phase: TxPhase) => void,
  ): Promise<WriteResult<void>> {
    return this.client.write<void>("cancel_payment", { caller, id }, onPhase);
  }

  /** Read a single payment (no signature required). */
  async getPayment(id: number): Promise<Payment> {
    const native = await this.client.read<Record<string, unknown>>("get_payment", { id });
    return toPayment(native);
  }

  /** Read all payments (no signature required). */
  async listPayments(): Promise<Payment[]> {
    const native = await this.client.read<Array<Record<string, unknown>>>("payments");
    return native.map(toPayment);
  }
}
