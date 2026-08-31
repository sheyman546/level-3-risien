/**
 * Deploy the StellarFlow contracts to the given network.
 *
 * Usage:
 *   pnpm deploy:testnet   (uses STELLARFLOW_SECRET_KEY from .env)
 *   pnpm deploy:local     (needs `docker compose --profile localnet up -d`)
 *
 * Delegates to contracts/scripts/deploy.ts, which also writes the deployed
 * contract ids to .env.contracts.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";

const deployScript = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "contracts",
  "scripts",
  "deploy.ts",
);

// Importing the script executes it (it runs main() on load).
await import(deployScript);
