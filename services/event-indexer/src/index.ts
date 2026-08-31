import "dotenv/config";
import { getIndexerConfig } from "./config";
import { EventStore } from "./db";
import { ContractListener } from "./listeners/contract-listener";
import { HttpServer } from "./http/server";
import { Broker } from "./workers/broker";

async function main(): Promise<void> {
  const config = getIndexerConfig();

  if (config.contractIds.length === 0) {
    throw new Error(
      "No contract ids configured. Set STELLARFLOW_PAYMENT_CONTRACT, " +
        "STELLARFLOW_ESCROW_CONTRACT and/or STELLARFLOW_REGISTRY_CONTRACT in .env",
    );
  }

  const store = new EventStore(config.databaseUrl);
  await store.ensureSchema();

  const broker = new Broker();
  const listener = new ContractListener(config, store, broker);
  const http = new HttpServer(store, broker, config.port);

  http.start();
  await listener.start();
}

main().catch((error) => {
  console.error("[indexer] fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[indexer] received ${signal}, shutting down`);
    process.exit(0);
  });
}
