import { contractAddresses, networkConfig, parseEnv } from "@stellarflow/config";

export interface IndexerConfig {
  rpcUrl: string;
  networkPassphrase: string;
  /** Contract ids to listen to (payment, escrow, registry). */
  contractIds: string[];
  pollIntervalMs: number;
  batchSize: number;
  /** First ledger to index on a fresh database. */
  startLedger: number;
  port: number;
  databaseUrl: string;
}

export function getIndexerConfig(env: NodeJS.ProcessEnv = process.env): IndexerConfig {
  // Validate shared env vars up front (throws a descriptive error on problems).
  parseEnv(env);

  const net = networkConfig(env);
  const contracts = contractAddresses(env);
  const contractIds = [contracts.payment, contracts.escrow, contracts.registry].filter(
    (c): c is string => Boolean(c),
  );

  return {
    rpcUrl: net.rpcUrl,
    networkPassphrase: net.networkPassphrase,
    contractIds,
    pollIntervalMs: Number(env.INDEXER_POLL_INTERVAL_MS ?? 4000),
    batchSize: Number(env.INDEXER_BATCH_SIZE ?? 100),
    startLedger: Number(env.INDEXER_START_LEDGER ?? 0),
    port: Number(env.INDEXER_PORT ?? 4000),
    databaseUrl:
      env.DATABASE_URL ?? "postgres://stellarflow:stellarflow@localhost:5432/stellarflow",
  };
}
