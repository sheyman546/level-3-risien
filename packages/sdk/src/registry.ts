import { ContractClient, Signer, toErrorTypes, TxPhase, WriteResult } from "./client";
import { REGISTRY_CONTRACT_ERRORS } from "./errors";

export interface RegistryClientOptions {
  contractId: string;
  networkPassphrase: string;
  rpcUrl: string;
  signer?: Signer;
}

export class RegistryClient {
  private readonly client: ContractClient;

  constructor(options: RegistryClientOptions) {
    this.client = new ContractClient({
      ...options,
      errorTypes: toErrorTypes(REGISTRY_CONTRACT_ERRORS),
    });
  }

  /** Look up a registered contract address (no signature required). */
  async getContract(key: string): Promise<string> {
    return this.client.read<string>("get_contract", { key });
  }

  /** Check whether a key is registered (no signature required). */
  async isRegistered(key: string): Promise<boolean> {
    return this.client.read<boolean>("is_registered", { key });
  }

  /** Register a contract address (admin or self-registration). */
  async register(
    key: string,
    address: string,
    onPhase?: (phase: TxPhase) => void,
  ): Promise<WriteResult<void>> {
    return this.client.write<void>("register", { key, address }, onPhase);
  }

  /** Remove a registration (admin only). */
  async remove(key: string, onPhase?: (phase: TxPhase) => void): Promise<WriteResult<void>> {
    return this.client.write<void>("remove", { key }, onPhase);
  }

  /** Read the registry admin (no signature required). */
  async admin(): Promise<string> {
    return this.client.read<string>("admin");
  }
}
