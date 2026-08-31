import { ESCROW_STATUSES, Escrow, EscrowStatus } from "@stellarflow/types";
import { ContractClient, Signer, toErrorTypes, TxPhase, WriteResult } from "./client";
import { ESCROW_CONTRACT_ERRORS } from "./errors";

export interface EscrowClientOptions {
  contractId: string;
  networkPassphrase: string;
  rpcUrl: string;
  signer?: Signer;
}

export interface CreateEscrowInput {
  depositor: string;
  beneficiary: string;
  /** Amount in stroops. */
  amount: bigint;
  /** Stellar Asset Contract id of the asset. */
  asset: string;
  /** Ledger timestamp timeout. */
  timeout: number;
}

/** Native contract Escrow -> domain Escrow. */
export function toEscrow(native: Record<string, unknown>): Escrow {
  return {
    id: Number(native.id),
    depositor: String(native.depositor),
    beneficiary: String(native.beneficiary),
    amount: BigInt(native.amount as bigint),
    asset: String(native.asset),
    status: (ESCROW_STATUSES[Number(native.status)] ?? "Locked") as EscrowStatus,
    createdAt: Number(native.created_at),
    timeout: Number(native.timeout),
  };
}

export class EscrowClient {
  private readonly client: ContractClient;

  constructor(options: EscrowClientOptions) {
    this.client = new ContractClient({
      ...options,
      errorTypes: toErrorTypes(ESCROW_CONTRACT_ERRORS),
    });
  }

  /** Lock funds into a new escrow. Requires wallet signature from the depositor. */
  async createEscrow(
    input: CreateEscrowInput,
    onPhase?: (phase: TxPhase) => void,
  ): Promise<WriteResult<number>> {
    return this.client.write<number>(
      "create_escrow",
      {
        depositor: input.depositor,
        beneficiary: input.beneficiary,
        amount: input.amount,
        asset: input.asset,
        timeout: BigInt(input.timeout),
      },
      onPhase,
    );
  }

  /** Release escrowed funds to the beneficiary (depositor or beneficiary). */
  async release(
    caller: string,
    id: number,
    onPhase?: (phase: TxPhase) => void,
  ): Promise<WriteResult<void>> {
    return this.client.write<void>("release", { caller, id: BigInt(id) }, onPhase);
  }

  /** Refund escrowed funds to the depositor (depositor only). */
  async refund(
    caller: string,
    id: number,
    onPhase?: (phase: TxPhase) => void,
  ): Promise<WriteResult<void>> {
    return this.client.write<void>("refund", { caller, id: BigInt(id) }, onPhase);
  }

  /** Open a dispute (either party). */
  async dispute(
    caller: string,
    id: number,
    onPhase?: (phase: TxPhase) => void,
  ): Promise<WriteResult<void>> {
    return this.client.write<void>("dispute", { caller, id: BigInt(id) }, onPhase);
  }

  /** Settle a dispute (admin only). */
  async resolveDispute(
    caller: string,
    id: number,
    payBeneficiary: boolean,
    onPhase?: (phase: TxPhase) => void,
  ): Promise<WriteResult<void>> {
    return this.client.write<void>(
      "resolve_dispute",
      { caller, id: BigInt(id), pay_beneficiary: payBeneficiary },
      onPhase,
    );
  }

  /** Read a single escrow (no signature required). */
  async getEscrow(id: number): Promise<Escrow> {
    const native = await this.client.read<Record<string, unknown>>("get_escrow", { id: BigInt(id) });
    return toEscrow(native);
  }

  /** Read all escrows (no signature required). */
  async listEscrows(): Promise<Escrow[]> {
    const native = await this.client.read<Array<Record<string, unknown>>>("escrows");
    return native.map(toEscrow);
  }
}
